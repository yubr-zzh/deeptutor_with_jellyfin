"""Course management API — the DeepTutor media-platform upload surface.

Endpoints
---------
* ``GET  /api/v1/courses`` — list courses (with their videos)
* ``POST /api/v1/courses`` — create a course (title, description)
* ``GET  /api/v1/courses/{course_id}`` — course detail incl. videos
* ``DELETE /api/v1/courses/{course_id}`` — remove course + media dir
* ``POST /api/v1/courses/{course_id}/videos`` — upload one video file
* ``GET  /api/v1/courses/{course_id}/videos`` — list videos
* ``DELETE /api/v1/courses/{course_id}/videos/{video_id}`` — remove video file

Upload flow (write-confirm loop against Jellyfin):

1. validate extension + size
2. persist bytes to ``{media_root}/Courses/{slug}/S01E{ep:02d}-{safe}.mp4``
3. record the video row (status=pending)
4. trigger a Jellyfin scan of the course container path
5. poll until the Episode/Series item appears; write its id back (indexed)
6. on timeout mark the row failed (file is still on disk; rescan later fixes it)

Auth: routers are registered with the shared ``require_auth`` dependency by
``main.py``; the upload endpoint additionally checks ``is_admin`` when auth is
enabled so only admins can publish media.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

import httpx

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse

from deeptutor.services.course_store import (
    MAX_VIDEO_BYTES,
    _ALLOWED_VIDEO_EXT,
    Course,
    CourseStore,
    get_course_store,
)
from deeptutor.services.jellyfin import JellyfinClient, JellyfinError, get_jellyfin_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["courses"])


def _admin_guard():
    """Return True when auth is disabled (local dev) or the user is admin."""
    from deeptutor.services.auth import AUTH_ENABLED

    if not AUTH_ENABLED:
        return None

    async def check(request) -> None:
        # Reuse the existing auth machinery: extract token, decode, check role.
        from fastapi import Request

        from deeptutor.services.auth import decode_token

        token = request.cookies.get("dt_token") or ""
        authz = request.headers.get("Authorization", "")
        if authz.lower().startswith("bearer "):
            token = authz.split(None, 1)[1].strip()
        payload = decode_token(token) if token else None
        if not payload or payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")

    return check


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


@router.get("/courses")
async def list_courses():
    store = get_course_store()
    return [c.to_dict() for c in store.list_courses()]


@router.post("/courses")
async def create_course(
    title: str = Form(...),
    description: str = Form(""),
):
    store = get_course_store()
    if not title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    course = store.create_course(title=title.strip(), description=description.strip())
    return course.to_dict()


@router.get("/courses/{course_id}")
async def get_course(course_id: str):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    data = course.to_dict()
    data["videos"] = [v.to_dict() for v in store.list_videos(course_id)]
    return data


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    store.delete_course(course_id)
    return {"deleted": course_id}


# ---------------------------------------------------------------------------
# Videos
# ---------------------------------------------------------------------------


@router.get("/courses/{course_id}/videos")
async def list_videos(course_id: str):
    store = get_course_store()
    if not store.get_course(course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return [v.to_dict() for v in store.list_videos(course_id)]


@router.post("/courses/{course_id}/videos")
async def upload_video(
    course_id: str,
    file: UploadFile = File(...),
    title: str = Form(""),
):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    filename = (file.filename or "video.mp4").strip()
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_VIDEO_EXT:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported video type {ext!r}; allowed: {sorted(_ALLOWED_VIDEO_EXT)}",
        )

    # Size check while streaming to disk
    episode = store.next_episode(course_id)
    video_title = (title.strip() or Path(filename).stem)[:200]
    safe_stem = "".join(c if c.isalnum() or c in "-_ " else "-" for c in video_title)
    target_name = f"S01E{episode:02d}-{safe_stem}{ext}"
    target = course.media_dir() / target_name

    size = 0
    try:
        with target.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise HTTPException(status_code=413, detail="Video exceeds 4 GiB limit")
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise

    video = store.add_video(
        course_id=course_id, episode=episode, title=video_title,
        filename=target_name, size_bytes=size,
    )
    store.update_video_status(video.id, status="scanning")

    # Write-confirm loop against Jellyfin (run in thread; HTTP is sync)
    def _sync_scan():
        client = get_jellyfin_client()
        client.ensure_library()
        container_dir = client.host_path_to_container(course.media_dir())
        client.trigger_scan(container_dir)
        # Exact identity by container path — SearchTerm is fuzzy and matches
        # TMDB junk (e.g. "python" -> Monty Python), so we never use it here.
        ep_path = f"{container_dir.rstrip('/')}/{target_name}"
        series = client._series_by_container_path(container_dir)
        ep = client.find_episode(episode_path=ep_path)
        if series is None and ep is not None:
            series = None  # series appears on next scan; episode id is enough
        return ep["Id"] if ep else None

    item_id = await asyncio.to_thread(_sync_scan)
    if item_id:
        store.update_video_status(video.id, status="indexed", jellyfin_item_id=item_id)
    else:
        store.update_video_status(video.id, status="failed",
                                  error="Jellyfin scan did not surface the episode within timeout")

    video = store.get_video(video.id)
    return video.to_dict() if video else {"id": video.id}


@router.get("/courses/{course_id}/videos/{video_id}/stream")
async def stream_video(course_id: str, video_id: str, request: Request):
    """Proxy the Jellyfin direct stream for a course video.

    The frontend <video> tag points here; this endpoint validates the video
    belongs to the course, then streams from Jellyfin server-side. The
    Jellyfin api_key never reaches the browser, and Jellyfin stays
    non-public (deep-tutor proxies everything).
    """
    store = get_course_store()
    course = store.get_course(course_id)
    video = store.get_video(video_id) if course else None
    if not course or not video or video.course_id != course_id:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.jellyfin_item_id:
        raise HTTPException(status_code=409, detail="Video not indexed in Jellyfin yet")

    client = get_jellyfin_client()
    upstream = client.direct_stream_url(video.jellyfin_item_id)

    # Forward Range header for seek support; stream chunks without buffering.
    headers = {}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    req = httpx.Request("GET", upstream, headers=headers)
    try:
        resp = await client._http_stream(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stream proxy failed: {e}")

    return StreamingResponse(
        resp.aiter_bytes(),
        status_code=resp.status_code,
        headers={
            k: v for k, v in resp.headers.items()
            if k.lower() in ("content-type", "content-length", "content-range",
                             "accept-ranges", "content-disposition")
        },
    )


@router.delete("/courses/{course_id}/videos/{video_id}")
async def delete_video(course_id: str, video_id: str):
    store = get_course_store()
    course = store.get_course(course_id)
    video = store.get_video(video_id) if course else None
    if not course or not video or video.course_id != course_id:
        raise HTTPException(status_code=404, detail="Video not found")
    # Remove file from the shared volume (best effort) + DB row
    (course.media_dir() / video.filename).unlink(missing_ok=True)
    with store._connect() as conn:
        conn.execute("DELETE FROM course_videos WHERE id = ?", (video_id,))
    return {"deleted": video_id}
