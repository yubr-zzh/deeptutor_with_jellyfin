"""Course store: metadata + upload pipeline for the DeepTutor media platform.

This module owns the *course structure* side of the integration:

* A course is a row in SQLite (``data/user/courses.db``) with a slug that maps
  to a media directory ``{media_root}/Courses/{slug}/`` on the shared volume.
* A video is a row referencing its course; the actual bytes live on the
  Jellyfin-mounted volume under ``S01E01-{title}.mp4`` naming.
* Upload flows: persist bytes -> trigger Jellyfin scan -> poll for the
  Episode/Series item id -> write it back (write-confirm loop).

The database lives under the standard PathService user-data dir so backups,
permissions and the multi-user layer behave like the rest of DeepTutor.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from deeptutor.services.path_service import get_path_service

logger = logging.getLogger(__name__)

MEDIA_ROOT = Path(os.getenv("COURSE_MEDIA_ROOT", "D:/Media"))
COURSES_SUBDIR = "Courses"
MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024  # 4 GiB per video
_ALLOWED_VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}

_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def slugify(name: str) -> str:
    """ASCII slug for course directories: 'Intro to AI' -> 'intro-to-ai'."""
    s = name.strip().lower()
    s = _SLUG_RE.sub("-", s).strip("-")
    return s or "course"


@dataclass
class Course:
    id: str
    slug: str
    title: str
    description: str = ""
    cover_filename: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "description": self.description,
            "cover_filename": self.cover_filename,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "media_path": str(self.media_dir()),
        }

    def media_dir(self) -> Path:
        return MEDIA_ROOT / COURSES_SUBDIR / self.slug


@dataclass
class CourseVideo:
    id: str
    course_id: str
    episode: int
    title: str
    filename: str
    jellyfin_item_id: str = ""
    status: str = "pending"  # pending | scanning | indexed | failed
    error: str = ""
    size_bytes: int = 0
    created_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "course_id": self.course_id,
            "episode": self.episode,
            "title": self.title,
            "filename": self.filename,
            "jellyfin_item_id": self.jellyfin_item_id,
            "status": self.status,
            "error": self.error,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at,
        }


class CourseStore:
    """SQLite-backed metadata store for courses and their videos."""

    def __init__(self, db_path: Path | None = None):
        if db_path is None:
            db_path = get_path_service().user_data_dir / "courses.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS courses (
                    id TEXT PRIMARY KEY,
                    slug TEXT UNIQUE NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    cover_filename TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS course_videos (
                    id TEXT PRIMARY KEY,
                    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                    episode INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    jellyfin_item_id TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    error TEXT NOT NULL DEFAULT '',
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    UNIQUE (course_id, episode)
                );
                CREATE TABLE IF NOT EXISTS video_progress (
                    user_id TEXT NOT NULL,
                    video_id TEXT NOT NULL REFERENCES course_videos(id) ON DELETE CASCADE,
                    position REAL NOT NULL DEFAULT 0,
                    duration REAL NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (user_id, video_id)
                );
                """
            )

    # ------------------------------------------------------------------
    # Courses
    # ------------------------------------------------------------------
    def create_course(self, *, title: str, description: str = "") -> Course:
        import uuid

        now = time.time()
        course_id = uuid.uuid4().hex[:12]
        slug = slugify(title)
        # Ensure unique slug
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT slug FROM courses WHERE slug = ?", (slug,)
            ).fetchone()
        if existing:
            slug = f"{slug}-{course_id[:6]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO courses (id, slug, title, description, cover_filename, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, '', ?, ?)",
                (course_id, slug, title, description, now, now),
            )
        course = Course(id=course_id, slug=slug, title=title, description=description,
                        created_at=now, updated_at=now)
        # Create the media directory on the shared volume right away
        course.media_dir().mkdir(parents=True, exist_ok=True)
        return course

    def list_courses(self) -> list[Course]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM courses ORDER BY created_at DESC").fetchall()
        return [self._course_from_row(r) for r in rows]

    def get_course(self, course_id: str) -> Course | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
        return self._course_from_row(row) if row else None

    def get_course_by_slug(self, slug: str) -> Course | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM courses WHERE slug = ?", (slug,)).fetchone()
        return self._course_from_row(row) if row else None

    def delete_course(self, course_id: str) -> None:
        course = self.get_course(course_id)
        if course:
            import shutil

            shutil.rmtree(course.media_dir(), ignore_errors=True)
        with self._connect() as conn:
            conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))

    @staticmethod
    def _course_from_row(row: sqlite3.Row) -> Course:
        return Course(
            id=row["id"], slug=row["slug"], title=row["title"],
            description=row["description"], cover_filename=row["cover_filename"],
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    # ------------------------------------------------------------------
    # Videos
    # ------------------------------------------------------------------
    def add_video(self, *, course_id: str, episode: int, title: str,
                  filename: str, size_bytes: int) -> CourseVideo:
        import uuid

        now = time.time()
        vid = uuid.uuid4().hex[:12]
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO course_videos"
                " (id, course_id, episode, title, filename, status, size_bytes, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
                (vid, course_id, episode, title, filename, size_bytes, now),
            )
        return CourseVideo(id=vid, course_id=course_id, episode=episode, title=title,
                           filename=filename, size_bytes=size_bytes, created_at=now)

    def update_video_status(self, video_id: str, *, status: str, jellyfin_item_id: str = "",
                            error: str = "") -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE course_videos SET status = ?, jellyfin_item_id = ?, error = ? WHERE id = ?",
                (status, jellyfin_item_id, error, video_id),
            )

    def list_videos(self, course_id: str) -> list[CourseVideo]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM course_videos WHERE course_id = ? ORDER BY episode", (course_id,)
            ).fetchall()
        return [self._video_from_row(r) for r in rows]

    def get_video(self, video_id: str) -> CourseVideo | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM course_videos WHERE id = ?", (video_id,)).fetchone()
        return self._video_from_row(row) if row else None

    def next_episode(self, course_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(episode), 0) AS m FROM course_videos WHERE course_id = ?",
                (course_id,),
            ).fetchone()
        return int(row["m"]) + 1

    # ------------------------------------------------------------------
    # Video progress (per-user, server-side)
    # ------------------------------------------------------------------
    def set_video_progress(self, *, user_id: str, video_id: str, position: float, duration: float) -> None:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO video_progress (user_id, video_id, position, duration, updated_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, video_id)
                   DO UPDATE SET position = excluded.position,
                                 duration = excluded.duration,
                                 updated_at = excluded.updated_at""",
                (user_id, video_id, position, duration, time.time()),
            )

    def get_video_progress(self, *, user_id: str, video_id: str) -> dict[str, float] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT position, duration, updated_at FROM video_progress WHERE user_id = ? AND video_id = ?",
                (user_id, video_id),
            ).fetchone()
        if not row:
            return None
        return {"position": row["position"], "duration": row["duration"], "updated_at": row["updated_at"]}

    def get_course_progress(self, *, user_id: str, course_id: str) -> dict[str, dict[str, float]]:
        """Return {video_id: {position, duration, updated_at}} for all videos in a course."""
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT vp.video_id, vp.position, vp.duration, vp.updated_at
                   FROM video_progress vp
                   JOIN course_videos cv ON cv.id = vp.video_id
                   WHERE vp.user_id = ? AND cv.course_id = ?""",
                (user_id, course_id),
            ).fetchall()
        return {
            row["video_id"]: {
                "position": row["position"],
                "duration": row["duration"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        }

    @staticmethod
    def _video_from_row(row: sqlite3.Row) -> CourseVideo:
        return CourseVideo(
            id=row["id"], course_id=row["course_id"], episode=row["episode"],
            title=row["title"], filename=row["filename"],
            jellyfin_item_id=row["jellyfin_item_id"], status=row["status"],
            error=row["error"], size_bytes=row["size_bytes"], created_at=row["created_at"],
        )


_store: CourseStore | None = None


def get_course_store() -> CourseStore:
    global _store
    if _store is None:
        _store = CourseStore()
    return _store
