"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAuthStatus } from "@/lib/auth";
import {
  listCourses,
  deleteCourse,
  createCourse,
  formatDate,
  type CourseRecord,
} from "@/lib/courses-api";
import { BookOpen, Plus, Trash2, RefreshCw, ArrowLeft, PlayCircle, Video, X } from "lucide-react";

export default function AdminCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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

  function openCreate() {
    setCreateTitle("");
    setCreateDesc("");
    setCreateError("");
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    if (!createTitle.trim()) {
      setCreateError("课程名称不能为空");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const course = await createCourse(createTitle.trim(), createDesc.trim());
      setShowCreate(false);
      router.push(`/admin/courses/${course.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(course: CourseRecord) {
    if (!window.confirm(`删除课程「${course.title}」？视频文件将一并删除。`)) return;
    try {
      await deleteCourse(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push("/")}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft size={14} /> 返回工作台
            </button>
            <h1 className="flex items-center gap-2.5 text-xl font-semibold text-[var(--foreground)]">
              <BookOpen size={20} className="text-[var(--primary)]" />
              课程管理
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
              创建课程、上传视频。上传后自动同步到 Jellyfin 媒体库，供所有用户点播。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              <RefreshCw size={14} /> 刷新
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} /> 新建课程
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-[var(--muted-foreground)]">加载中…</div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-20 text-center">
            <Video size={32} className="mx-auto mb-3 text-[var(--muted-foreground)]/50" />
            <p className="text-sm text-[var(--muted-foreground)]">还没有课程，点击右上角「新建课程」开始</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const videoCount = course.videos?.length ?? 0;
              return (
                <div
                  key={course.id}
                  className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--primary)]/40"
                >
                  <Link href={`/admin/courses/${course.id}`} className="block">
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                      <PlayCircle size={18} />
                    </div>
                    <h3 className="truncate text-[15px] font-medium text-[var(--foreground)]">{course.title}</h3>
                    <p className="mt-1 line-clamp-2 min-h-[36px] text-[12.5px] leading-5 text-[var(--muted-foreground)]">
                      {course.description || "暂无简介"}
                    </p>
                  </Link>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--border)]/60 pt-3">
                    <span className="text-[12px] text-[var(--muted-foreground)]">
                      {videoCount} 个视频 · {formatDate(course.created_at)}
                    </span>
                    <button
                      onClick={() => void handleDelete(course)}
                      className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="删除课程"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">新建课程</h2>
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[12.5px] text-[var(--muted-foreground)]">
                  课程名称 <span className="text-red-400">*</span>
                </label>
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="例如：Python 入门"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] text-[var(--muted-foreground)]">课程简介</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="简单介绍一下这门课（可选）"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13.5px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                />
              </div>
              {createError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "创建中…" : "创建课程"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
