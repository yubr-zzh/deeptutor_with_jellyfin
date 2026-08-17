import { apiUrl } from "@/lib/api";

export interface CourseRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_filename: string;
  created_at: number;
  updated_at: number;
  media_path: string;
  videos?: CourseVideoRecord[];
}

export interface CourseVideoRecord {
  id: string;
  course_id: string;
  episode: number;
  title: string;
  filename: string;
  jellyfin_item_id: string;
  status: "pending" | "scanning" | "indexed" | "failed";
  error: string;
  size_bytes: number;
  created_at: number;
}

export async function listCourses(): Promise<CourseRecord[]> {
  const res = await fetch(apiUrl("/api/v1/courses"), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

export async function getCourse(courseId: string): Promise<CourseRecord> {
  const res = await fetch(apiUrl(`/api/v1/courses/${courseId}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch course");
  return res.json();
}

export async function createCourse(title: string, description: string): Promise<CourseRecord> {
  const form = new FormData();
  form.append("title", title);
  form.append("description", description);
  const res = await fetch(apiUrl("/api/v1/courses"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Failed to create course");
  }
  return res.json();
}

export async function deleteCourse(courseId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/v1/courses/${courseId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Failed to delete course");
  }
}

export async function uploadVideo(
  courseId: string,
  title: string,
  file: File,
  onProgress?: (done: boolean) => void,
): Promise<CourseVideoRecord> {
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  const res = await fetch(apiUrl(`/api/v1/courses/${courseId}/videos`), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Failed to upload video");
  }
  return res.json();
}

export async function deleteVideo(courseId: string, videoId: string): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/v1/courses/${courseId}/videos/${videoId}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Failed to delete video");
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<CourseVideoRecord["status"], string> = {
  pending: "待处理",
  scanning: "入库中",
  indexed: "已入库",
  failed: "失败",
};

export function statusLabel(s: CourseVideoRecord["status"]): string {
  return STATUS_LABEL[s] ?? s;
}
