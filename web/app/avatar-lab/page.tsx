"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Pause,
  Play,
  RefreshCw,
  Square,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import AvatarRenderer from "@/app/components/avatar/AvatarRenderer";
import {
  AVATAR_MODELS,
  getAvatarModel,
  getAvatarAnimationsByState,
  getAvatarAnimation,
  resolveAvatarAnimationSet,
  type AvatarAnimationId,
  type AvatarAnimationState,
  type AvatarModelName,
  type AvatarRuntimeState,
} from "@/app/components/avatar/avatarAssets";
import { useTTS } from "@/app/hooks/useTTS";

type RuntimeDebug = {
  actionClip?: string | null;
  actionTime?: number | null;
  actionWeight?: number | null;
  actionRunning?: boolean;
  avatarState?: string | null;
  mixerTime?: number | null;
};

const STATE_OPTIONS: Array<{ value: AvatarRuntimeState; label: string }> = [
  { value: "idle", label: "Idle" },
  { value: "thinking", label: "Thinking" },
  { value: "speaking", label: "Speaking" },
  { value: "error", label: "Error" },
];

const SAMPLE_TEXT =
  "你好，我是 DeepTutor 的 Avatar 导师。这里会用于测试真实聊天中的语音播放和动作状态。";

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0s";
  return `${value.toFixed(1)}s`;
}

export default function AvatarLabPage() {
  const { t } = useTranslation();
  const tts = useTTS();
  const [avatarModel, setAvatarModel] =
    useState<AvatarModelName>("The Scholar");
  const [runtimeState, setRuntimeState] =
    useState<AvatarRuntimeState>("idle");
  const [idleAnimationId, setIdleAnimationId] =
    useState<AvatarAnimationId>("idle-standing-002");
  const [thinkingAnimationId, setThinkingAnimationId] =
    useState<AvatarAnimationId>("thinking-expression-001");
  const [speakingAnimationId, setSpeakingAnimationId] =
    useState<AvatarAnimationId>("speaking-talk-001");
  const [sampleText, setSampleText] = useState(SAMPLE_TEXT);
  const [renderStatus, setRenderStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [runtimeDebug, setRuntimeDebug] = useState<RuntimeDebug>({});

  const selectedAvatar = getAvatarModel(avatarModel);
  const animationSet = useMemo(
    () =>
      resolveAvatarAnimationSet({
        idle: idleAnimationId,
        thinking: thinkingAnimationId,
        speaking: speakingAnimationId,
      }),
    [idleAnimationId, speakingAnimationId, thinkingAnimationId],
  );
  const rendererKey = [
    selectedAvatar.modelUrl,
    animationSet.idle.id,
    animationSet.thinking.id,
    animationSet.speaking.id,
  ].join(":");

  useEffect(() => {
    setRenderStatus("loading");
    setRenderError(null);
  }, [rendererKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const debug = window.__deepTutorAvatarDebug as
        | { runtime?: RuntimeDebug }
        | undefined;
      setRuntimeDebug(debug?.runtime ?? {});
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const handleSpeak = async () => {
    try {
      if (!tts.isInitialized) {
        await tts.init();
      }
      setRuntimeState("speaking");
      await tts.speakAndWait(sampleText);
    } finally {
      setRuntimeState("idle");
    }
  };

  const animationSelect = (
    state: AvatarAnimationState,
    value: AvatarAnimationId,
    onChange: (value: AvatarAnimationId) => void,
  ) => (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
        {state}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AvatarAnimationId)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[12px] text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]/50 focus:border-[var(--primary)]"
      >
        {getAvatarAnimationsByState(state).map((animation) => (
          <option key={animation.id} value={animation.id}>
            {animation.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1420px] grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[minmax(520px,1fr)_360px]">
        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot size={17} className="text-[var(--primary)]" />
              <div>
                <h1 className="text-[14px] font-semibold">
                  {t("Avatar Lab")}
                </h1>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {renderStatus === "ready"
                    ? t("Renderer ready")
                    : renderStatus === "error"
                      ? t("Renderer error")
                      : t("Renderer loading")}
                </p>
              </div>
            </div>
            <select
              value={avatarModel}
              onChange={(event) =>
                setAvatarModel(event.target.value as AvatarModelName)
              }
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[13px] text-[var(--foreground)] outline-none transition-colors hover:border-[var(--primary)]/50 focus:border-[var(--primary)]"
            >
              {AVATAR_MODELS.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          <div className="relative min-h-0 flex-1 bg-[#87ceeb]">
            <AvatarRenderer
              key={rendererKey}
              modelUrl={selectedAvatar.modelUrl}
              avatarState={runtimeState}
              idleAnimationUrl={animationSet.idle.url}
              thinkingAnimationUrl={animationSet.thinking.url}
              speakingAnimationUrl={animationSet.speaking.url}
              className="h-full"
              onLoad={() => setRenderStatus("ready")}
              onError={(error) => {
                setRenderStatus("error");
                setRenderError(error.message);
              }}
            />
            <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-900 shadow-sm">
              {runtimeState}
            </div>
            {renderError && (
              <div className="absolute inset-x-4 bottom-4 rounded-md border border-red-200 bg-white px-3 py-2 text-[12px] text-red-700 shadow-sm">
                {renderError}
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 overflow-y-auto">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-[13px] font-semibold">
              {t("Runtime State")}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {STATE_OPTIONS.map((option) => {
                const active = runtimeState === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRuntimeState(option.value)}
                    className={`h-9 rounded-md border text-[12px] font-medium transition-colors ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-[13px] font-semibold">
              {t("Animation Clips")}
            </h2>
            <div className="mt-3 grid gap-3">
              {animationSelect("idle", idleAnimationId, setIdleAnimationId)}
              {animationSelect(
                "thinking",
                thinkingAnimationId,
                setThinkingAnimationId,
              )}
              {animationSelect(
                "speaking",
                speakingAnimationId,
                setSpeakingAnimationId,
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold">
                {t("TTS Playback")}
              </h2>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                {tts.status}
              </span>
            </div>
            <textarea
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
              className="mt-3 min-h-[96px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12px] leading-5 text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void tts.init().catch(() => undefined)}
                disabled={tts.isLoading || tts.isInitialized}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={13} />
                {t("Init")}
              </button>
              <button
                type="button"
                onClick={() => void handleSpeak()}
                disabled={tts.isLoading || tts.isGenerating || !sampleText.trim()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] text-[12px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tts.isSpeaking ? <Pause size={13} /> : <Play size={13} />}
                {t("Speak")}
              </button>
              <button
                type="button"
                onClick={() => {
                  tts.stop();
                  setRuntimeState("idle");
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/50"
              >
                <Square size={12} />
                {t("Stop")}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
              <Volume2 size={13} />
              <span>
                {tts.isGenerating
                  ? t("Generating")
                  : tts.isSpeaking
                    ? t("Playing")
                    : tts.isInitialized
                      ? t("Ready")
                      : t("Not initialized")}
              </span>
              <span>
                {formatSeconds(tts.audioCurrentTime)} /{" "}
                {formatSeconds(tts.audioDuration)}
              </span>
            </div>
            {tts.error && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                {tts.error}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-[13px] font-semibold">{t("Diagnostics")}</h2>
            <dl className="mt-3 grid gap-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">{t("Model")}</dt>
                <dd>{avatarModel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">{t("Idle")}</dt>
                <dd>{getAvatarAnimation(idleAnimationId).label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">
                  {t("Thinking")}
                </dt>
                <dd>{getAvatarAnimation(thinkingAnimationId).label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">
                  {t("Speaking")}
                </dt>
                <dd>{getAvatarAnimation(speakingAnimationId).label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">
                  {t("Action")}
                </dt>
                <dd className="max-w-[190px] truncate">
                  {runtimeDebug.actionClip || t("none")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">{t("Mixer")}</dt>
                <dd>{formatSeconds(runtimeDebug.mixerTime ?? 0)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
