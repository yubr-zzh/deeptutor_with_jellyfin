"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCourse,
  videoStreamUrl,
  formatBytes,
  formatDate,
  type CourseRecord,
  type CourseVideoRecord,
} from "@/lib/courses-api";
import {
  ArrowLeft,
  PlayCircle,
  Film,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  BookOpen,
} from "lucide-react";

function EpisodeStatus({ status }: { status: CourseVideoRecord["status"] }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
  switch (status) {
    case "indexed":
      return (
        <span className={`${base} bg-emerald-500/10 text-emerald-400`}>
          <CheckCircle2 size={10} /> 可播放
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-red-500/10 text-red-400`}>
          <AlertCircle size={10} /> 暂不可用
        </span>
      );
    case "scanning":
      return (
        <span className={`${base} bg-amber-500/10 text-amber-400`}>
          <Loader2 size={10} className="animate-spin" /> 入库中
        </span>
      );
    default:
      return (
        <span className={`${base} bg-[var(--muted)]/10 text-[var(--muted-foreground)]`}>
          <Clock size={10} /> 待处理
        </span>
      );
  }
}

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentVideo, setCurrentVideo] = useState<CourseVideoRecord | null>(null);
  const [playError, setPlayError] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const c = await getCourse(courseId);
      setCourse(c);
      // Auto-select first playable video
      const firstPlayable = c.videos?.find((v) => v.status === "indexed") ?? null;
      if (firstPlayable && !currentVideo) {
        setCurrentVideo(firstPlayable);
        setPlayError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载课程失败");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectVideo(video: CourseVideoRecord) {
    setCurrentVideo(video);
    setPlayError("");
    // Force player to reload new source
    const player = playerRef.current;
    if (player) {
      player.load();
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        加载中…
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        课程不存在
      </div>
    );
  }

  const videos = course.videos ?? [];
  const playerVideo = currentVideo ?? videos.find((v) => v.status === "indexed") ?? null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/courses"
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> 返回全部课程
        </Link>

        <header className="mb-6">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-[var(--foreground)]">
            <Film size={22} className="text-[var(--primary)]" />
            {course.title}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--muted-foreground)]">
            {course.description || "暂无简介"} · 更新于 {formatDate(course.updated_at || course.created_at)}
          </p>
        </header>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Player */}
        <div className="mb-8">
          {playerVideo ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-lg">
                <video
                  key={playerVideo.id}
                  ref={playerRef}
                  src={videoStreamUrl(courseId, playerVideo.id)}
                  controls
                  autoPlay
                  className="aspect-video w-full"
                  onError={() =>
                    setPlayError("视频加载失败，请刷新重试或联系管理员")
                  }
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[14px] font-medium text-[var(--foreground)]">
                  {playerVideo.episode}. {playerVideo.title}
                </span>
                <EpisodeStatus status={playerVideo.status} />
                <span className="text-[12px] text-[var(--muted-foreground)]">
                  {formatBytes(playerVideo.size_bytes)}
                </span>
              </div>
              {playError && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
                  {playError}
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]">
              <div className="text-center">
                <BookOpen size={28} className="mx-auto mb-2 text-[var(--muted-foreground)]/50" />
                <p className="text-sm text-[var(--muted-foreground)]">
                  {videos.length === 0 ? "本课程暂无视频" : "暂无可用视频"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Episode list */}
        <h2 className="mb-3 text-[15px] font-semibold text-[var(--foreground)]">
          课时列表
        </h2>
        {videos.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">
            暂无课时
          </p>
        ) : (
          <ul className="space-y-2">
            {videos.map((video, idx) => {
              const active = currentVideo?.id === video.id || (!currentVideo && idx === 0);
              const playable = video.status === "indexed";
              return (
                <li key={video.id}>
                  <button
                    onClick={() => playable && selectVideo(video)}
                    disabled={!playable}
                    className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                      active
                        ? "border-[var(--primary)]/50 bg-[var(--primary)]/5"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/30"
                    } ${!playable ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--primary)]/10 text-[var(--primary)]"
                      }`}
                    >
                      {playable ? <PlayCircle size={17} /> : <Clock size={16} />}
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
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <EpisodeStatus status={video.status} />
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        {formatBytes(video.size_bytes)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
