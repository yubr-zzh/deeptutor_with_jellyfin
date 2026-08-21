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


def _require_course_read(request: Request) -> None:
    """FastAPI dependency for read endpoints (browse/stream).

    No-op when AUTH_ENABLED=false. When auth is on, accepts the session via
    cookie, Bearer header, OR query ``?token=`` (needed by <video> tags which
    cannot attach cookies/headers cross-origin).
    """
    from deeptutor.services.auth import AUTH_ENABLED, decode_token

    if not AUTH_ENABLED:
        return

    cookie_token = request.cookies.get("dt_token") or ""
    authz = request.headers.get("Authorization", "")
    bearer = authz.split(None, 1)[1].strip() if authz.lower().startswith("bearer ") else ""
    query_token = request.query_params.get("token", "")
    payload = decode_token(query_token or bearer or cookie_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")


def _require_admin(request: Request) -> None:
    """FastAPI dependency: only admin may write (create/delete) media.

    No-op when AUTH_ENABLED=false (local dev). When auth is on, the request
    must carry a valid JWT (cookie or Bearer) whose role is ``admin``.
    """
    from deeptutor.services.auth import AUTH_ENABLED, decode_token

    if not AUTH_ENABLED:
        return

    token = request.cookies.get("dt_token") or ""
    authz = request.headers.get("Authorization", "")
    if authz.lower().startswith("bearer "):
        token = authz.split(None, 1)[1].strip()
    payload = decode_token(token) if token else None
    role = getattr(payload, "role", "") if payload else ""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


@router.get("/courses", dependencies=[Depends(_require_course_read)])
async def list_courses():
    store = get_course_store()
    result = []
    for c in store.list_courses():
        item = c.to_dict()
        with store._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) AS n FROM course_videos WHERE course_id = ?", (c.id,)
            ).fetchone()
        item["video_count"] = int(count["n"]) if count else 0
        result.append(item)
    return result


@router.post("/courses", dependencies=[Depends(_require_admin)])
async def create_course(
    title: str = Form(...),
    description: str = Form(""),
):
    store = get_course_store()
    if not title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    course = store.create_course(title=title.strip(), description=description.strip())
    return course.to_dict()


@router.get("/courses/{course_id}", dependencies=[Depends(_require_course_read)])
async def get_course(course_id: str):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    data = course.to_dict()
    data["videos"] = [v.to_dict() for v in store.list_videos(course_id)]
    return data


@router.delete("/courses/{course_id}", dependencies=[Depends(_require_admin)])
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


@router.get("/courses/{course_id}/videos", dependencies=[Depends(_require_course_read)])
async def list_videos(course_id: str):
    store = get_course_store()
    if not store.get_course(course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return [v.to_dict() for v in store.list_videos(course_id)]


@router.post("/courses/{course_id}/videos", dependencies=[Depends(_require_admin)])
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


@router.get("/courses/{course_id}/videos/{video_id}/stream", dependencies=[Depends(_require_course_read)])
async def stream_video(course_id: str, video_id: str, request: Request, token: str = ""):
    """...token query param allows <video> tags (no header/cookie control) to
    authenticate: the frontend appends ?token=<jwt> fetched from the session.
    """
    """Proxy the Jellyfin direct stream for a course video.

    The frontend <video> tag points here; this endpoint validates the video
    belongs to the course, then streams from Jellyfin server-side. The
    Jellyfin api_key never reaches the browser, and Jellyfin stays
    non-public (deep-tutor proxies everything).
    """
    from deeptutor.services.auth import AUTH_ENABLED, decode_token

    if AUTH_ENABLED:
        # <video> tags cannot set cookies/headers cross-port; accept ?token=
        cookie_token = request.cookies.get("dt_token") or ""
        authz = request.headers.get("Authorization", "")
        bearer = authz.split(None, 1)[1].strip() if authz.lower().startswith("bearer ") else ""
        payload = decode_token(token or bearer or cookie_token)
        if not payload:
            raise HTTPException(status_code=401, detail="Not authenticated")

    store = get_course_store()
    course = store.get_course(course_id)
    video = store.get_video(video_id) if course else None
    if not course or not video or video.course_id != course_id:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.jellyfin_item_id:
        raise HTTPException(status_code=409, detail="Video not indexed in Jellyfin yet")

    client = get_jellyfin_client()
    upstream, media_info = client.stream_url(video.jellyfin_item_id)

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

    # For transcoded streams, ensure content-type is video/mp4 so the
    # browser knows how to handle the response.
    response_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() in ("content-type", "content-length", "content-range",
                         "accept-ranges", "content-disposition")
    }
    if media_info.get("needs_transcode") and "content-type" not in {k.lower() for k in response_headers}:
        response_headers["Content-Type"] = "video/mp4"

    return StreamingResponse(
        resp.aiter_bytes(),
        status_code=resp.status_code,
        headers=response_headers,
    )


@router.delete("/courses/{course_id}/videos/{video_id}", dependencies=[Depends(_require_admin)])
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


# ---------------------------------------------------------------------------
# Video progress (server-side persistence, per-user)
# ---------------------------------------------------------------------------


def _current_user_id(request: Request) -> str:
    """Extract user_id from JWT when auth is on; 'local' otherwise."""
    from deeptutor.services.auth import AUTH_ENABLED, decode_token

    if not AUTH_ENABLED:
        return "local"
    cookie_token = request.cookies.get("dt_token") or ""
    authz = request.headers.get("Authorization", "")
    bearer = authz.split(None, 1)[1].strip() if authz.lower().startswith("bearer ") else ""
    query_token = request.query_params.get("token", "")
    payload = decode_token(query_token or bearer or cookie_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return getattr(payload, "user_id", "") or getattr(payload, "username", "local")


@router.put("/courses/{course_id}/videos/{video_id}/progress", dependencies=[Depends(_require_course_read)])
async def save_progress(course_id: str, video_id: str, request: Request):
    body = await request.json()
    position = float(body.get("position", 0) or 0)
    duration = float(body.get("duration", 0) or 0)
    store = get_course_store()
    video = store.get_video(video_id)
    if not video or video.course_id != course_id:
        raise HTTPException(status_code=404, detail="Video not found")
    user_id = _current_user_id(request)
    store.set_video_progress(user_id=user_id, video_id=video_id, position=position, duration=duration)
    return {"ok": True}


@router.get("/courses/{course_id}/progress", dependencies=[Depends(_require_course_read)])
async def get_progress(course_id: str, request: Request):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    user_id = _current_user_id(request)
    return store.get_course_progress(user_id=user_id, course_id=course_id)


# ---------------------------------------------------------------------------
# Course cover images (asset library)
# ---------------------------------------------------------------------------


@router.get("/courses/{course_id}/cover")
async def get_course_cover(course_id: str):
    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    cover = course.cover_path()
    if not cover or not cover.exists():
        raise HTTPException(status_code=404, detail="No cover image")
    from fastapi.responses import FileResponse
    ext = cover.suffix.lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")
    return FileResponse(cover, media_type=media_type)


@router.post("/courses/{course_id}/cover", dependencies=[Depends(_require_admin)])
async def upload_course_cover(course_id: str, request: Request):
    """Upload a cover image for a course (admin only). Stored in the covers asset library."""
    import os
    from pathlib import Path as _Path

    store = get_course_store()
    course = store.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    from fastapi import UploadFile, File
    # Read the raw body as an image file
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty upload")

    # Detect extension from Content-Type
    content_type = request.headers.get("Content-Type", "")
    ext = ".png"
    if "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    elif "webp" in content_type:
        ext = ".webp"

    from deeptutor.services.course_store import COVERS_DIR
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{course.slug}{ext}"
    dest = COVERS_DIR / filename
    dest.write_bytes(body)

    with store._connect() as conn:
        conn.execute("UPDATE courses SET cover_filename = ? WHERE id = ?", (filename, course_id))
    return {"ok": True, "cover_url": f"/api/v1/courses/{course_id}/cover"}
