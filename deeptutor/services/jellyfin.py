"""Jellyfin integration client for the DeepTutor media pipeline.

DeepTutor owns the *course structure* (courses -> ordered video list); Jellyfin
owns *playback* (storage, scanning, transcoding, multi-user streaming). The two
sides are aligned by a path convention:

    {media_root}/Courses/{course_slug}/S01E01-{title}.mp4

DeepTutor writes video files into that directory, then asks Jellyfin to scan
the path and polls until the new Episode item appears, and finally records the
Jellyfin item id back in its own store (write-confirm loop).

Design notes
------------
* **Sync HTTP client** (urllib) is intentional: upload handling already runs
  in a thread executor, and Jellyfin scans are asynchronous anyway. Keeping
  this module free of httpx/aiohttp makes it trivially testable.
* **Scan confirmation is poll-based**: ``/Library/Refresh`` is async server
  side. After triggering we poll ``/Items`` for the new Episode/Series id.
* All URLs are built with ``urllib.parse.quote(..., safe="")`` so CJK course
  slugs survive (Jellyfin 10.11 rejects raw non-ASCII query params).
"""

from __future__ import annotations

import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

def _env(key: str, default: str) -> str:
    """Resolve config from the canonical .env store (EnvStore caches .env)."""
    try:
        from deeptutor.services.config import get_env_store
        val = get_env_store().get(key, "")
        return val or default
    except Exception:
        return os.getenv(key, default)


DEFAULT_JELLYFIN_URL = _env("JELLYFIN_URL", "http://127.0.0.1:8096")
DEFAULT_API_KEY = _env("JELLYFIN_API_KEY", "")
# Jellyfin container maps D:\Media -> /media; DeepTutor writes the same tree
# via the host path. Both sides must agree on the *container* relative path.
DEFAULT_MEDIA_ROOT_HOST = _env("COURSE_MEDIA_ROOT", "D:/Media")
DEFAULT_COURSE_LIBRARY_NAME = _env("JELLYFIN_COURSE_LIBRARY", "课程库")
# DeepTutor sees the host path; Jellyfin sees /media/... — strip the host root
# and re-prefix with the container mount point.
CONTAINER_MEDIA_PREFIX = "/media"


class JellyfinError(RuntimeError):
    """Raised when Jellyfin returns a non-success status or times out."""


@dataclass
class JellyfinClient:
    """Thin wrapper over the Jellyfin REST API."""

    base_url: str = field(default_factory=lambda: DEFAULT_JELLYFIN_URL)
    api_key: str = field(default_factory=lambda: DEFAULT_API_KEY)
    media_root_host: Path = field(default_factory=lambda: Path(DEFAULT_MEDIA_ROOT_HOST))
    library_name: str = field(default_factory=lambda: DEFAULT_COURSE_LIBRARY_NAME)
    library_id: str | None = None
    _poll_interval: float = 2.0

    # ------------------------------------------------------------------
    # HTTP plumbing
    # ------------------------------------------------------------------
    def _headers(self) -> dict[str, str]:
        return {"X-Emby-Token": self.api_key, "Accept": "application/json"}

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: Any = None,
        timeout: float = 20.0,
    ) -> Any:
        if params:
            qs = urllib.parse.urlencode(params)
            path = f"{path}?{qs}" if "?" not in path else f"{path}&{qs}"
        url = self.base_url.rstrip("/") + path
        req = urllib.request.Request(url, headers=self._headers(), method=method)
        if body is not None:
            req.add_header("Content-Type", "application/json")
            payload = body if isinstance(body, bytes) else __import__("json").dumps(body)
            req.data = payload.encode("utf-8") if isinstance(payload, str) else payload
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return __import__("json").loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            raise JellyfinError(f"Jellyfin {method} {path} -> {e.code}: {detail}") from e

    def ping(self) -> dict[str, Any]:
        return self._request("GET", "/System/Info/Public")

    # ------------------------------------------------------------------
    # Libraries
    # ------------------------------------------------------------------
    def list_libraries(self) -> list[dict[str, Any]]:
        return self._request("GET", "/Library/VirtualFolders") or []

    def ensure_library(
        self,
        *,
        collection_type: str = "tvshows",
        paths: list[str] | None = None,
        refresh: bool = True,
    ) -> str:
        """Return the library id for the course library, creating it if missing."""
        if self.library_id:
            return self.library_id
        for lib in self.list_libraries():
            if lib.get("Name") == self.library_name:
                self.library_id = lib.get("ItemId") or lib.get("Id")
                return self.library_id  # type: ignore[return-value]
        paths = paths or [self.host_path_to_container(self.media_root_host / "Courses")]
        created = self._request(
            "POST",
            "/Library/VirtualFolders",
            params={
                "name": self.library_name,
                "collectionType": collection_type,
                "refreshLibrary": "true" if refresh else "false",
                "paths": ",".join(paths),
            },
            body={"LibraryOptions": self._course_library_options()},
        )
        for lib in self.list_libraries():
            if lib.get("Name") == self.library_name:
                self.library_id = lib.get("ItemId") or lib.get("Id")
                return self.library_id  # type: ignore[return-value]
        raise JellyfinError(f"Library {self.library_name!r} was not created")

    @staticmethod
    def _course_library_options() -> dict[str, Any]:
        return {
            "Enabled": True,
            "EnableRealtimeMonitor": True,
            "SaveLocalMetadata": False,
            "EnableInternetProviders": False,
            "AutomaticRefreshIntervalDays": 0,
            "MetadataSavers": ["Nfo"],
            "LocalMetadataReaderOrder": ["Nfo"],
            "TypeOptions": [],
        }

    # ------------------------------------------------------------------
    # Path mapping
    # ------------------------------------------------------------------
    def host_path_to_container(self, host_path: Path) -> str:
        """Map a host path (D:/Media/Courses/X) to the container view (/media/Courses/X)."""
        try:
            rel = host_path.resolve().relative_to(self.media_root_host.resolve())
        except ValueError:
            raise JellyfinError(f"{host_path} is outside media root {self.media_root_host}")
        return f"{CONTAINER_MEDIA_PREFIX}/{rel.as_posix()}"

    def container_path_to_host(self, container_path: str) -> Path:
        rel = container_path.removeprefix(CONTAINER_MEDIA_PREFIX).lstrip("/")
        return (self.media_root_host / rel).resolve()

    # ------------------------------------------------------------------
    # Scan + confirmation
    # ------------------------------------------------------------------
    def trigger_scan(self, container_path: str | None = None) -> None:
        """Ask Jellyfin to re-scan a path (or the whole library).

        Uses ``/Library/Refresh?path=`` (full path refresh) instead of
        ``/Library/Media/Updated`` (incremental): on Windows bind mounts
        inotify is unavailable, and the incremental endpoint proved flaky
        for newly created series directories (episodes silently skipped).
        """
        params = {"path": container_path} if container_path else None
        self._request("POST", "/Library/Refresh", params=params)

    def _items_in_library(
        self, lib_id: str, item_types: str, max_attempts: int = 1
    ) -> list[dict[str, Any]]:
        """Fetch all items of *item_types* under *lib_id*.

        Deliberately avoids ``SearchTerm``: Jellyfin's search is fuzzy full
        text and matches TMDB scraped junk (e.g. searching "python" returns
        "巨蟒剧团之飞翔的马戏团" / Monty Python). Exact identity is by path.
        """
        for _ in range(max_attempts):
            items = self._request(
                "GET",
                "/Items",
                params={
                    "Recursive": "true",
                    "ParentId": lib_id,
                    "IncludeItemTypes": item_types,
                    "Fields": "Path,SeriesName",
                    "Limit": "200",
                },
            )
            found = (items or {}).get("Items", []) or []
            if found:
                return found
            time.sleep(self._poll_interval)
        return []

    def _series_by_container_path(
        self, container_path: str, max_attempts: int = 15
    ) -> dict[str, Any] | None:
        """Poll until a Series whose path equals *container_path* appears."""
        lib_id = self.library_id or self.ensure_library()
        target = container_path.rstrip("/")
        for _ in range(max_attempts):
            for it in self._items_in_library(lib_id, "Series"):
                if (it.get("Path") or "").rstrip("/") == target:
                    return it
            time.sleep(self._poll_interval)
        return None

    def _episode_by_path(
        self, container_path: str, max_attempts: int = 15
    ) -> dict[str, Any] | None:
        """Poll until an Episode whose path equals *container_path* appears."""
        lib_id = self.library_id or self.ensure_library()
        target = container_path.rstrip("/")
        for _ in range(max_attempts):
            for it in self._items_in_library(lib_id, "Episode"):
                if (it.get("Path") or "").rstrip("/") == target:
                    return it
            time.sleep(self._poll_interval)
        return None

    def find_episode(
        self,
        *,
        episode_path: str,
        library_id: str | None = None,
        max_attempts: int = 15,
    ) -> dict[str, Any] | None:
        """Poll Jellyfin until the Episode at *episode_path* (container form) appears."""
        return self._episode_by_path(episode_path, max_attempts=max_attempts)

    def series_by_name(self, series_name: str, max_attempts: int = 15) -> dict[str, Any] | None:
        """Poll for the Series item whose directory name is *series_name* (back-compat)."""
        lib_id = self.library_id or self.ensure_library()
        for _ in range(max_attempts):
            for it in self._items_in_library(lib_id, "Series"):
                if (it.get("Name") or "").lower() == series_name.lower():
                    return it
            time.sleep(self._poll_interval)
        return None


_client: JellyfinClient | None = None


def get_jellyfin_client() -> JellyfinClient:
    global _client
    if _client is None:
        _client = JellyfinClient()
    return _client
