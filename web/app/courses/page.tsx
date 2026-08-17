"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listCourses, formatDate, type CourseRecord } from "@/lib/courses-api";
import { BookOpen, PlayCircle, Video, RefreshCw, Clapperboard } from "lucide-react";

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCourses(await listCourses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载课程失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[12px] font-medium text-[var(--primary)]">
              <Clapperboard size={13} /> AI 教学平台 · 课程点播
            </div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-[var(--foreground)]">
              <BookOpen size={24} className="text-[var(--primary)]" />
              全部课程
            </h1>
            <p className="mt-1.5 text-[13.5px] text-[var(--muted-foreground)]">
              浏览入门 AI 系列课程，点击进入观看视频
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </header>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center text-sm text-[var(--muted-foreground)]">
            加载中…
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-24 text-center">
            <Video size={36} className="mx-auto mb-4 text-[var(--muted-foreground)]/50" />
            <p className="text-sm text-[var(--muted-foreground)]">暂无课程，敬请期待</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const videoCount = course.videos?.length ?? 0;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-lg"
                >
                  <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-[var(--primary)]/15 via-[var(--primary)]/5 to-transparent">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)] transition-transform group-hover:scale-110">
                      <PlayCircle size={26} />
                    </div>
                    <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      {videoCount} 集
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="truncate text-[15.5px] font-semibold text-[var(--foreground)]">
                      {course.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 min-h-[36px] text-[13px] leading-5 text-[var(--muted-foreground)]">
                      {course.description || "暂无简介"}
                    </p>
                    <div className="mt-3 text-[12px] text-[var(--muted-foreground)]">
                      更新于 {formatDate(course.updated_at || course.created_at)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
