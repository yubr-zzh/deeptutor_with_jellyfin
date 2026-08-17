"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAuthStatus } from "@/lib/auth";
import {
  getCourse,
  uploadVideo,
  deleteVideo,
  formatBytes,
  formatDate,
  statusLabel,
  type CourseRecord,
  type CourseVideoRecord,
} from "@/lib/courses-api";
import {
  ArrowLeft,
  Upload,
  Trash2,
  RefreshCw,
  PlayCircle,
  Film,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video,
} from "lucide-react";

function StatusBadge({ status }: { status: CourseVideoRecord["status"] }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium";
  switch (status) {
    case "indexed":
      return (
        <span className={`${base} bg-emerald-500/10 text-emerald-400`}>
          <CheckCircle2 size={11} /> {statusLabel(status)}
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-red-500/10 text-red-400`}>
          <AlertCircle size={11} /> {statusLabel(status)}
        </span>
      );
    case "scanning":
      return (
        <span className={`${base} bg-amber-500/10 text-amber-400`}>
          <Loader2 size={11} className="animate-spin" /> {statusLabel(status)}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-[var(--muted)]/10 text-[var(--muted-foreground)]`}>
          <Clock size={11} /> {statusLabel(status)}
        </span>
      );
  }
}

export default function AdminCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      setCourse(await getCourse(courseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载课程失败");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchAuthStatus().then((status) => {
      if (!status?.authenticated) {
        router.replace("/login");
        return;
      }
      if (status.role !== "admin") {
        router.replace("/");
        return;
      }
      void load();
    });
  }, [router, load]);

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setUploadError("");
    try {
      const video = await uploadVideo(
        courseId,
        uploadTitle.trim() || selectedFile.name.replace(/\.\w+$/, ""),
        selectedFile,
      );
      setSelectedFile(null);
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      // If scan already done, refresh; otherwise poll a bit
      setCourse(await getCourse(courseId));
      if (video.status === "scanning" || video.status === "pending") {
        // poll up to 60s for the scan to complete
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const updated = await getCourse(courseId);
          const target = updated.videos?.find((v) => v.id === video.id);
          setCourse(updated);
          if (target && (target.status === "indexed" || target.status === "failed")) break;
        }
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteVideo(video: CourseVideoRecord) {
    if (!window.confirm(`删除视频「${video.title}」？`)) return;
    try {
      await deleteVideo(courseId, video.id);
      setCourse(await getCourse(courseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-[var(--muted-foreground)]">加载中…</div>;
  }

  if (!course) {
    return (
      <div className="py-20 text-center text-sm text-[var(--muted-foreground)]">
        课程不存在
      </div>
    );
  }

  const videos = course.videos ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <button
          onClick={() => router.push("/admin/courses")}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> 返回课程列表
        </button>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-semibold text-[var(--foreground)]">
              <Film size={20} className="text-[var(--primary)]" />
              {course.title}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
              {course.description || "暂无简介"} · 创建于 {formatDate(course.created_at)}
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Upload zone */}
        <div className="mb-6 rounded-xl border border-dashed border-[var(--border)] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mkv,.webm,.mov,.m4v,video/*"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={pickFile}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Upload size={15} /> 选择视频
            </button>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="视频标题（默认取文件名）"
              disabled={uploading}
              className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
            />
            {selectedFile && (
              <span className="text-[12.5px] text-[var(--muted-foreground)]">
                {selectedFile.name} ({formatBytes(selectedFile.size)})
              </span>
            )}
            <button
              onClick={() => void handleUpload()}
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--foreground)] px-3.5 py-2 text-[13px] font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-40"
            >
              {uploading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> 上传入库中…
                </>
              ) : (
                <>上传并入库</>
              )}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
            支持 mp4 / mkv / webm / mov，单文件最大 4GB。上传完成后自动触发 Jellyfin 扫描入库。
          </p>
          {uploadError && (
            <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
              {uploadError}
            </div>
          )}
        </div>

        {/* Video list */}
        {videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-14 text-center">
            <Video size={28} className="mx-auto mb-3 text-[var(--muted-foreground)]/50" />
            <p className="text-sm text-[var(--muted-foreground)]">
              还没有视频，上传第一个吧
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {videos.map((video, idx) => (
              <li
                key={video.id}
                className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 transition-colors hover:border-[var(--primary)]/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                  <PlayCircle size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--muted-foreground)]">
                      第 {idx + 1} 集
                    </span>
                    <span className="truncate text-[14px] font-medium text-[var(--foreground)]">
                      {video.title}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                    <span>{formatBytes(video.size_bytes)}</span>
                    <span>·</span>
                    <StatusBadge status={video.status} />
                    {video.status === "failed" && video.error && (
                      <span className="truncate text-red-400/80" title={video.error}>
                        {video.error}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {video.status === "indexed" && (
                    <a
                      href={`http://localhost:8096/web/index.html#!/details?id=${video.jellyfin_item_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md px-2 py-1.5 text-[12.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary)]/10 hover:text-[var(--primary)]"
                    >
                      在 Jellyfin 中打开
                    </a>
                  )}
                  <button
                    onClick={() => void handleDeleteVideo(video)}
                    className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="删除视频"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
