"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAuthStatus, AUTH_ENABLED } from "@/lib/auth";
import { listCourses, formatDate, type CourseRecord } from "@/lib/courses-api";
import { BookOpen, RefreshCw, Clapperboard, FolderOpen, Plus } from "lucide-react";

function getCourseGradient(seed: string): string {
  const gradients = [
    "from-violet-500/20 via-purple-500/10 to-transparent",
    "from-blue-500/20 via-cyan-500/10 to-transparent",
    "from-emerald-500/20 via-teal-500/10 to-transparent",
    "from-orange-500/20 via-amber-500/10 to-transparent",
    "from-rose-500/20 via-pink-500/10 to-transparent",
    "from-sky-500/20 via-indigo-500/10 to-transparent",
    "from-fuchsia-500/20 via-purple-500/10 to-transparent",
    "from-lime-500/20 via-green-500/10 to-transparent",
  ];
  let hash = 0;
  for (const c of seed) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return gradients[Math.abs(hash) % gradients.length];
}

function CourseCard({ course }: { course: CourseRecord }) {
  const videoCount = course.videos?.length ?? 0;
  const initial = course.title.charAt(0).toUpperCase();
  const gradient = getCourseGradient(course.title);

  // Calculate watched progress from localStorage
  const watchedCount = (course.videos ?? []).filter(v => {
    try {
      if (typeof window === 'undefined') return false;
      const time = parseFloat(localStorage.getItem(`dt_progress_${course.id}_${v.id}`) ?? '0');
      return time > 0;
    } catch { return false; }
  }).length;
  const progressPct = videoCount > 0 ? Math.round((watchedCount / videoCount) * 100) : 0;

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md"
    >
      <div className={`relative h-40 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 transition-transform duration-200 group-hover:scale-110">
          <span className="text-2xl font-bold text-white/90">{initial}</span>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1">
          <Clapperboard size={12} className="text-white/70" />
          <span className="text-[11px] font-medium text-white">{videoCount} 集</span>
        </div>
        {videoCount > 0 && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500/80 px-2 py-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-medium text-white">可播放</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-[15px] font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
          {course.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[var(--muted-foreground)]">
          {course.description || "暂无简介"}
        </p>
        {videoCount > 0 && watchedCount > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>{watchedCount}/{videoCount} 课时已学</span>
              <span className="font-medium text-emerald-500">{progressPct}%</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-[11.5px] text-[var(--muted-foreground)]">
          <span>更新于 {formatDate(course.updated_at || course.created_at)}</span>
          {videoCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-500">
              点击播放 <span aria-hidden="true">→</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listCourses();
      setCourses(data);
      try { localStorage.setItem('dt_course_count', String(data.length)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载课程失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      void load();
      return;
    }
    fetchAuthStatus().then((status) => {
      if (!status?.authenticated) {
        router.replace("/login?next=/courses");
        return;
      }
      void load();
    });
  }, [router, load]);

  const filteredCourses = courses.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <Link href="/" className="hover:text-[var(--foreground)] transition-colors">首页</Link>
            <span>/</span>
            <span className="text-[var(--foreground)]">课程点播</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[12px] font-medium text-[var(--primary)]">
                <Clapperboard size={13} /> 教学平台
              </div>
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-[var(--foreground)]">
                <BookOpen size={24} className="text-[var(--primary)]" />
                全部课程
              </h1>
              <p className="mt-1.5 text-[13.5px] text-[var(--muted-foreground)]">
                探索优质课程，随时学习
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted-foreground)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--foreground)]"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新
            </button>
          </div>
        </header>

        {/* Continue learning banner */}
        {!bannerDismissed && (() => {
          // Find the most recently watched course+video from localStorage
          let lastCourse: CourseRecord | null = null;
          let lastVideoId = "";
          let lastTime = 0;
          let lastWatched = 0;
          if (typeof window === 'undefined') return null;
          for (const c of courses) {
            for (const v of (c.videos ?? [])) {
              try {
                const t = parseFloat(localStorage.getItem(`dt_progress_${c.id}_${v.id}`) ?? '0');
                const ts = parseInt(localStorage.getItem(`dt_watched_ts_${c.id}_${v.id}`) ?? '0');
                if (ts > lastWatched && t > 5) {
                  lastWatched = ts;
                  lastCourse = c;
                  lastVideoId = v.id;
                  lastTime = t;
                }
              } catch {}
            }
          }
          if (!lastCourse || !lastVideoId) return null;
          const mins = Math.floor(lastTime / 60);
          const secs = Math.floor(lastTime % 60);
          return (
            <Link
              href={`/courses/${lastCourse.id}`}
              className="group mb-6 flex items-center gap-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-5 py-4 transition-all hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/8"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/15">
                <PlayCircle size={22} className="text-[var(--primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--primary)]">继续上次学习</div>
                <div className="mt-0.5 truncate text-[14px] font-semibold text-[var(--foreground)]">
                  {lastCourse.title}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[12px] text-[var(--muted-foreground)]">
                  停在 {mins}:{secs.toString().padStart(2, '0')}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-[var(--primary)]">
                  继续观看 <span aria-hidden="true">→</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.preventDefault(); setBannerDismissed(true); }}
                className="shrink-0 rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)]"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </Link>
          );
        })()}

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: parseInt(localStorage.getItem('dt_course_count') ?? '4') }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <div className="h-40 animate-pulse bg-[var(--border)]" />
                <div className="p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--border)]" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-[var(--border)]" />
                  <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-[var(--border)]" />
                  <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-[var(--border)]" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-20 text-center">
            <FolderOpen size={44} className="mx-auto mb-4 text-[var(--muted-foreground)]/40" />
            <p className="text-base font-medium text-[var(--foreground)]">暂无课程</p>
            <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
              管理员可在后台创建课程并上传视频
            </p>
            <Link
              href="/admin/courses"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus size={14} /> 创建第一门课程
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
