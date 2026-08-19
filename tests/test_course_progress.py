"""Regression test for video progress persistence (course_store).

Run: python tests/test_course_progress.py
Uses a temp SQLite DB so it never touches real data.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_TMP_DIR = tempfile.mkdtemp(prefix="deeptutor_test_")
os.environ["COURSE_MEDIA_ROOT"] = str(Path(_TMP_DIR) / "media")

from deeptutor.services.course_store import CourseStore  # noqa: E402


class ProgressStoreTest(unittest.TestCase):
    def setUp(self):
        self.store = CourseStore()
        self.store._db_path = Path(_TMP_DIR) / "courses_test.db"
        self.store._init_schema()
        self.course = self.store.create_course(title="Test Course")
        self.video = self.store.add_video(
            course_id=self.course.id,
            title="Ep 1",
            filename="S01E01-test.mp4",
            episode=1,
            size_bytes=1024,
        )

    def test_set_and_get_progress(self):
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=123.5, duration=300
        )
        got = self.store.get_video_progress(user_id="user-a", video_id=self.video.id)
        self.assertIsNotNone(got)
        self.assertAlmostEqual(got["position"], 123.5)
        self.assertAlmostEqual(got["duration"], 300)

    def test_user_isolation(self):
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=50, duration=300
        )
        got_b = self.store.get_video_progress(user_id="user-b", video_id=self.video.id)
        self.assertIsNone(got_b)

    def test_upsert_overwrites(self):
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=10, duration=300
        )
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=200, duration=300
        )
        got = self.store.get_video_progress(user_id="user-a", video_id=self.video.id)
        self.assertAlmostEqual(got["position"], 200)

    def test_course_progress_aggregation(self):
        v2 = self.store.add_video(
            course_id=self.course.id,
            title="Ep 2",
            filename="S01E02-test.mp4",
            episode=2,
            size_bytes=2048,
        )
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=10, duration=100
        )
        self.store.set_video_progress(
            user_id="user-a", video_id=v2.id, position=20, duration=100
        )
        progress = self.store.get_course_progress(user_id="user-a", course_id=self.course.id)
        self.assertEqual(len(progress), 2)

    def test_fk_cascades_progress_on_video_delete(self):
        self.store.set_video_progress(
            user_id="user-a", video_id=self.video.id, position=42, duration=100
        )
        with self.store._connect() as conn:
            conn.execute("DELETE FROM course_videos WHERE id = ?", (self.video.id,))
        got = self.store.get_video_progress(user_id="user-a", video_id=self.video.id)
        self.assertIsNone(got)


if __name__ == "__main__":
    unittest.main(verbosity=2)
