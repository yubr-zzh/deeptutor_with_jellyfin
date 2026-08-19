"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAuthStatus, AUTH_ENABLED } from "@/lib/auth";
import {
  getCourse,
  videoStreamUrl,
  saveServerProgress,
  loadServerProgress,
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
  ChevronDown,
  ChevronUp,
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

function EpisodeItem({
  video,
  idx,
  isActive,
  watched,
  onClick,
}: {
  video: CourseVideoRecord;
  idx: number;
  isActive: boolean;
  watched: boolean;
  onClick: () => void;
}) {
  const playable = video.status === "indexed";

  return (
    <button
      onClick={onClick}
      disabled={!playable}
      className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all ${
        isActive
          ? "border-[var(--primary)]/50 bg-[var(--primary)]/8"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/25"
      } ${!playable ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          watched && !isActive
            ? "bg-green-500/15 text-green-500"
            : isActive
            ? "bg-[var(--primary)] text-white"
            : "bg-[var(--primary)]/10 text-[var(--primary)]"
        }`}
      >
        {watched && !isActive ? <CheckCircle2 size={15} /> : playable ? <PlayCircle size={15} /> : <Clock size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
            第 {idx + 1} 集
          </span>
          <span className="truncate text-[13.5px] font-medium text-[var(--foreground)]">
            {video.title}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <EpisodeStatus status={video.status} />
        <span className="hidden text-[11px] text-[var(--muted-foreground)] sm:inline">
          {formatBytes(video.size_bytes)}
        </span>
      </div>
    </button>
  );
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());
  const playerRef = useRef<HTMLVideoElement>(null);
  const episodeListRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      // Load watched set from localStorage
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(`dt_progress_${courseId}_`));
        const watched = new Set<string>();
        for (const key of keys) {
          const vid = key.split('_').pop()!;
          const time = parseFloat(localStorage.getItem(key) || '0');
          if (time > 0) watched.add(vid);
        }
        setWatchedSet(watched);
      } catch {}
      const c = await getCourse(courseId);
      setCourse(c);
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
    if (!AUTH_ENABLED) {
      void load();
      return;
    }
    fetchAuthStatus().then((status) => {
      if (!status?.authenticated) {
        router.replace(`/login?next=${encodeURIComponent(`/courses/${courseId}`)}`);
        return;
      }
      void load();
    });
  }, [router, courseId, load]);

  useEffect(() => {
    if (episodeListRef.current) {
      const active = episodeListRef.current.querySelector("[data-active]");
      active?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentVideo?.id]);

  // Restore saved progress when a new video loads
  useEffect(() => {
    if (!playerVideo) return;
    const player = playerRef.current;
    if (!player) return;
    const saved = loadProgress(playerVideo.id);
    if (saved > 5) {
      const onLoaded = () => {
        player.currentTime = saved;
        player.removeEventListener("loadedmetadata", onLoaded);
      };
      player.addEventListener("loadedmetadata", onLoaded);
      return () => player.removeEventListener("loadedmetadata", onLoaded);
    }
  }, [playerVideo?.id]);

  function saveProgress(videoId: string, time: number, duration = 0) {
    try {
      localStorage.setItem(`dt_progress_${courseId}_${videoId}`, String(time));
      localStorage.setItem(`dt_watched_ts_${courseId}_${videoId}`, String(Date.now()));
    } catch {}
    // Server-side persistence (fire-and-forget)
    if (time > 5 && duration > 0) {
      void saveServerProgress(courseId, videoId, time, duration);
    }
  }

  function loadProgress(videoId: string): number {
    try {
      const v = localStorage.getItem(`dt_progress_${courseId}_${videoId}`);
      return v ? parseFloat(v) : 0;
    } catch {
      return 0;
    }
  }

  function selectVideo(video: CourseVideoRecord) {
    // Save progress of current video before switching
    if (currentVideo && playerRef.current) {
      saveProgress(currentVideo.id, playerRef.current.currentTime);
    }
    setCurrentVideo(video);
    setPlayError("");
    const player = playerRef.current;
    if (player) {
      player.load();
      // Restore progress after metadata loads
      const saved = loadProgress(video.id);
      if (saved > 5) {
        player.addEventListener("loadedmetadata", function onLoaded() {
          player.removeEventListener("loadedmetadata", onLoaded);
          player.currentTime = saved;
        }, { once: true });
      }
    }
  }

  // Get next playable video
  function getNextVideo(): CourseVideoRecord | null {
    if (!currentVideo || !course) return null;
    const vids = (course.videos ?? []).filter(v => v.status === "indexed");
    const idx = vids.findIndex(v => v.id === currentVideo.id);
    return idx >= 0 && idx < vids.length - 1 ? vids[idx + 1] : null;
  }

  function getPrevVideo(): CourseVideoRecord | null {
    if (!currentVideo || !course) return null;
    const vids = (course.videos ?? []).filter(v => v.status === "indexed");
    const idx = vids.findIndex(v => v.id === currentVideo.id);
    return idx > 0 ? vids[idx - 1] : null;
  }

  // Global keyboard shortcuts for video playback
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when typing in input/textarea/contenteditable
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      const v = playerRef.current;
      if (!v) return;
      const key = e.key.toLowerCase();

      // Skip if modifier keys are pressed (Ctrl+F etc)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (key) {
        case " ":
        case "k":
          e.preventDefault();
          if (v.paused) v.play(); else v.pause();
          break;
        case "j":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "l":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
          break;
        case "arrowleft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "arrowright":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
          break;
        case "arrowup":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.05);
          break;
        case "arrowdown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.05);
          break;
        case "m":
          e.preventDefault();
          v.muted = !v.muted;
          break;
        case ",":
          e.preventDefault();
          {
            const speeds = [1, 1.25, 1.5, 2];
            const cur = speeds.indexOf(v.playbackRate);
            const next = speeds[Math.max(0, cur - 1)];
            v.playbackRate = next;
            setPlaybackRate(next);
          }
          break;
        case ".":
          e.preventDefault();
          {
            const speeds = [1, 1.25, 1.5, 2];
            const cur = speeds.indexOf(v.playbackRate);
            const next = speeds[Math.min(speeds.length - 1, cur + 1)];
            v.playbackRate = next;
            setPlaybackRate(next);
          }
          break;
        case "f":
          e.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen();
          else {
            const container = v.parentElement;
            if (container?.requestFullscreen) container.requestFullscreen();
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        <nav className="mb-5 flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
          <Link href="/" className="hover:text-[var(--foreground)] transition-colors">首页</Link>
          <span>/</span>
          <Link href="/courses" className="hover:text-[var(--foreground)] transition-colors">课程</Link>
          <span>/</span>
          <span className="text-[var(--foreground)] truncate">{course.title}</span>
        </nav>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <Link
              href="/courses"
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowLeft size={14} /> 返回课程列表
            </Link>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-[var(--foreground)]">
              <Film size={22} className="text-[var(--primary)]" />
              {course.title}
            </h1>
            {course.description && (
              <p className="mt-1.5 max-w-2xl text-[13.5px] text-[var(--muted-foreground)]">
                {course.description}
              </p>
            )}
          </div>
          <div className="hidden shrink-0 text-right text-[12px] text-[var(--muted-foreground)]">
            <div>{videos.length} 个课时</div>
            <div>更新于 {formatDate(course.updated_at || course.created_at)}</div>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="flex-1 min-w-0">
            {playerVideo ? (
              <>
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-black shadow-md">
                  <video
                    key={playerVideo.id}
                    ref={playerRef}
                    src={videoStreamUrl(courseId, playerVideo.id)}
                    controls
                    autoPlay
                    className="aspect-video w-full"
                    onError={() => setPlayError("视频加载失败，请刷新重试或联系管理员")}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.currentTime > 0 && v.currentTime % 5 < 1) {
                        saveProgress(playerVideo.id, v.currentTime, v.duration);
                        // Mark as watched when > 50% played
                        if (v.duration > 0 && v.currentTime / v.duration > 0.8) {
                          if (!watchedSet.has(playerVideo.id)) {
                            setWatchedSet(prev => new Set(prev).add(playerVideo.id));
                          }
                        }
                      }
                    }}
                    onEnded={() => {
                      const d = playerRef.current?.duration || 0;
                      saveProgress(playerVideo.id, d, d);
                      const next = getNextVideo();
                      if (next) {
                        selectVideo(next);
                      }
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[14px] font-medium text-[var(--foreground)]">
                      {playerVideo.episode}. {playerVideo.title}
                    </span>
                    <EpisodeStatus status={playerVideo.status} />
                    <span className="text-[12px] text-[var(--muted-foreground)]">
                      {formatBytes(playerVideo.size_bytes)}
                    </span>
                    {/* Playback speed selector */}
                    <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-1 py-0.5">
                      {([1, 1.25, 1.5, 2] as const).map((speed) => (
                        <button
                          key={speed}
                          onClick={() => {
                            if (playerRef.current) playerRef.current.playbackRate = speed;
                            setPlaybackRate(speed);
                          }}
                          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                            playbackRate === speed
                              ? "bg-[var(--primary)] text-white"
                              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPrevVideo() && (
                      <button
                        onClick={() => selectVideo(getPrevVideo()!)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
                      >
                        <ChevronLeft size={14} /> 上一集
                      </button>
                    )}
                    {getNextVideo() ? (
                      <button
                        onClick={() => selectVideo(getNextVideo()!)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                      >
                        下一集 <ChevronRight size={14} />
                      </button>
                    ) : (
                      <span className="text-[12px] text-[var(--muted-foreground)]">已是最后一集</span>
                    )}
                  </div>
                </div>
                {playError && (
                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-400">
                    <span className="flex-1">{playError}</span>
                    <button
                      onClick={() => {
                        setPlayError("");
                        const player = playerRef.current;
                        if (player) {
                          player.load();
                          player.play();
                        }
                      }}
                      className="shrink-0 rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      重试
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]">
                <div className="text-center">
                  <BookOpen size={28} className="mx-auto mb-2 text-[var(--muted-foreground)]/50" />
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {videos.length === 0 ? "本课程暂无视频" : "暂无可用视频"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:max-w-[340px] lg:shrink-0">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[14px] font-medium text-[var(--foreground)] lg:hidden"
            >
              <span className="flex items-center gap-2">
                <Film size={16} className="text-[var(--primary)]" />
                课时列表 ({videos.length})
              </span>
              {mobileOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
              <div className="sticky top-6">
                <h2 className="mb-3 hidden text-[14px] font-semibold text-[var(--foreground)] lg:block">
                  课时列表
                </h2>
                {videos.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">
                    暂无课时
                  </p>
                ) : (
                  <div ref={episodeListRef} className="space-y-2">
                    {videos.map((video, idx) => (
                      <EpisodeItem
                        key={video.id}
                        video={video}
                        idx={idx}
                        isActive={currentVideo?.id === video.id || (!currentVideo && idx === 0)}
                        watched={watchedSet.has(video.id)}
                        onClick={() => {
                          if (video.status === "indexed") {
                            selectVideo(video);
                            setMobileOpen(false);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
