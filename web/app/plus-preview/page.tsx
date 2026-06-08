"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Layers3,
  Loader2,
  Mic2,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";

import AvatarChat from "@/app/components/avatar/AvatarChat";
import MultiResponseMessages from "@/app/components/chat/MultiResponseMessages";
import { useTTS } from "@/app/hooks/useTTS";

export default function PlusPreviewPage() {
  const [speaking, setSpeaking] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("The Scholar");
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState("等待合并预览");
  const { init, speak, stop, isInitialized, isLoading, isSpeaking, error, status } = useTTS();

  const avatarUrl = `/avatars/glb/${selectedModel}.glb`;
  const sampleText =
    "你好，我是 DeepTutor Plus 的 Avatar 预览。这里用于验证三维模型、语音合成和多模型响应卡片是否能正常加载。";

  const responses = useMemo(
    () => [
      {
        id: "gpt-sample",
        model: "gpt-4o-mini",
        content:
          "建议先验证基础聊天链路，再把 MoA 作为独立增强入口接入，这样能避免破坏 DeepTutor 原有六模式体验。",
        timestamp: new Date(),
        status: "complete" as const,
      },
      {
        id: "claude-sample",
        model: "claude-3-sonnet",
        content:
          "Avatar 和 TTS 应先作为可预览组件存在，等模型路径、worker、依赖都稳定后，再嵌入主聊天流。",
        timestamp: new Date(),
        status: "complete" as const,
      },
      {
        id: "gemini-sample",
        model: "gemini-1.5-pro",
        content:
          "后端 MoA 接口保持非流式即可满足首轮预览，后续再为并行流式响应补 WebSocket 事件协议。",
        timestamp: new Date(),
        status: "complete" as const,
      },
    ],
    [],
  );

  const handleInitTTS = async () => {
    await init({ dtype: "q8" });
  };

  const handleSpeak = async () => {
    setSpeaking(true);
    const audioUrl = await speak(sampleText, "af_heart");
    if (!audioUrl) {
      window.setTimeout(() => setSpeaking(false), 1200);
    }
  };

  const handleStop = () => {
    stop();
    setSpeaking(false);
  };

  return (
    <main className="min-h-screen bg-[#f7f4ec] text-[#191917]">
      <section className="border-b border-[#d8d0bd] bg-[#fbf8f0]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a5b2f]">
              DeepTutor Plus Preview
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-[#191917] md:text-5xl">
              Avatar、TTS 与 MoA 的集成检查台
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <StatusPill label="Avatar" value="GLB" />
            <StatusPill label="TTS" value={status} />
            <StatusPill label="MoA" value="静态卡片" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="min-h-[560px] overflow-hidden border border-[#d8d0bd] bg-[#171717]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#d8b46a]" />
              <span className="font-medium">Avatar 模型加载</span>
            </div>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="border border-white/15 bg-black px-3 py-1.5 text-sm text-white"
            >
              <option>The Scholar</option>
              <option>The Mentor</option>
              <option>The Coach</option>
              <option>The Innovator</option>
            </select>
          </div>
          <div className="h-[520px]">
            <AvatarChat
              key={avatarUrl}
              avatarUrl={avatarUrl}
              currentMessage={sampleText}
              speaking={speaking || isSpeaking}
              className="h-full"
              useClassroom={false}
              onMessageComplete={() => setSpeaking(false)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="TTS 语音合成" icon={<Mic2 className="h-5 w-5" />}>
            <p className="text-sm leading-6 text-[#565044]">{sampleText}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleInitTTS}
                disabled={isLoading || isInitialized}
                className="inline-flex items-center gap-2 border border-[#191917] bg-[#191917] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                {isInitialized ? "已初始化" : "初始化 TTS"}
              </button>
              <button
                onClick={handleSpeak}
                disabled={!isInitialized || isSpeaking}
                className="inline-flex items-center gap-2 border border-[#8a5b2f] px-3 py-2 text-sm font-medium text-[#5d371b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                播放示例
              </button>
              <button
                onClick={handleStop}
                className="inline-flex items-center gap-2 border border-[#d8d0bd] px-3 py-2 text-sm font-medium text-[#565044]"
              >
                <RotateCcw className="h-4 w-4" />
                停止
              </button>
            </div>
            {error ? (
              <p className="mt-3 border border-[#d9a7a0] bg-[#fff1ef] px-3 py-2 text-sm text-[#8f2f22]">
                TTS 当前不可用：{error}
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-[#5c6f35]">
                <CheckCircle2 className="h-4 w-4" />
                页面会在模型缺失或浏览器不支持时显示错误，不阻塞预览。
              </p>
            )}
          </Panel>

          <Panel title="MoA 多模型响应卡片" icon={<Layers3 className="h-5 w-5" />}>
            <div className="h-[420px] overflow-hidden border border-[#d8d0bd] bg-white">
              <MultiResponseMessages
                responses={responses}
                defaultExpanded
                onResponseSelect={(response) => setSelectedResponse(response.model)}
                onMergeRequest={() => setMergeNotice("已触发合并预览：后端接口为 /api/v1/moa/completions")}
              />
            </div>
            <p className="mt-3 text-sm text-[#565044]">
              当前选择：{selectedResponse ?? "未选择"}；{mergeNotice}
            </p>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#d8d0bd] bg-white px-3 py-2">
      <div className="text-xs text-[#786f61]">{label}</div>
      <div className="font-semibold text-[#191917]">{value}</div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-[#d8d0bd] bg-[#fffdf7] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="text-[#8a5b2f]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
