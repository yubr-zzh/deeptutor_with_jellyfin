# DeepTutor Plus 导师交接说明

日期：2026-06-08

## 1. 这个包里有什么

这是当前的 DeepTutor Plus 原型版本。项目以 DeepTutor 为基础，在保留原有学习系统主体能力的前提下，接入了一部分 OpenTutorAi 风格的 Plus 功能。

目前最主要的成果是：在真实聊天页面中加入了可选的 3D Avatar 导师模式。

## 2. 当前可演示内容

主要演示入口：

```text
http://localhost:3000/chat
```

在聊天页面中，用户可以在两种模式之间切换：

- `Normal`：原始文本聊天模式。
- `Avatar`：带 3D 导师面板的聊天模式。

当前 Avatar 模式支持：

- 四个 GLB 导师模型：The Scholar、The Mentor、The Coach、The Innovator。
- Three.js 模型加载与自动取景。
- 鼠标拖拽旋转模型，滚轮缩放模型。
- `idle`、`thinking`、`speaking`、`error` 四种运行状态。
- 通过 animation registry 管理 idle/thinking/speaking 动画片段。
- AI 流式回复期间，Avatar 会进入 speaking 状态。
- 可选 TTS 播放；TTS 播放期间，Avatar 也会进入 speaking 状态。

开发调试入口：

```text
http://localhost:3000/avatar-lab
```

该页面用于单独测试模型加载、动画选择、状态切换和渲染器行为，不需要经过完整聊天流程。

## 3. 本地启动与关闭

项目根目录下提供了 Windows 辅助脚本：

```cmd
start-backend-local.cmd
start-frontend-local.cmd
stop-local.cmd
```

推荐演示流程：

```cmd
start-backend-local.cmd
start-frontend-local.cmd
```

然后打开：

```text
http://localhost:3000/chat
```

演示结束后运行：

```cmd
stop-local.cmd
```

关闭脚本会停止：

- 前端：端口 `3000`
- 后端：端口 `8001`

## 4. 关键实现文件

Avatar 相关：

```text
web/app/components/avatar/AvatarChat.tsx
web/app/components/avatar/AvatarRenderer.tsx
web/app/components/avatar/avatarAssets.ts
web/app/avatar-lab/page.tsx
web/public/avatars/
```

聊天页面接入：

```text
web/app/chat/page.tsx
web/context/UnifiedChatContext.tsx
```

TTS 相关：

```text
web/app/hooks/useTTS.ts
web/app/workers/kokoro.worker.ts
```

MoA 后端：

```text
deeptutor/services/moa.py
deeptutor/api/routes/moa.py
deeptutor/api/main.py
```

数学公式渲染：

```text
web/components/quiz/QuizViewer.tsx
web/app/globals.css
```

## 5. 已完成修复与接入

- 修复了前端编译断点，包括缺失 Avatar 导出、TTS worker 路径等问题。
- 修复了 Avatar 默认模型路径和 GLB 加载行为。
- 稳定了 Three.js 渲染器生命周期，避免 canvas 在路由或状态变化后消失。
- 增加了模型自动缩放、地面放置、灯光和相机取景。
- 增加了 OrbitControls，支持鼠标旋转和缩放。
- 增加了 animation registry，避免把动画状态硬编码在渲染器内部。
- 将 Avatar speaking 状态接入 AI 流式回复过程。
- 增加了可选 TTS 驱动的 speaking 状态。
- 将 MoA 后端路由接入 FastAPI 应用。
- 修复了 quiz/problem 中常见 LaTeX 公式显示为原始文本的问题。
- 增加了 Windows 本地启动/关闭脚本，形成完整的本地演示生命周期。
- 初始化了 git 仓库并建立当前版本基线。

## 6. 当前限制

- Avatar 唇形同步目前是状态驱动，不是真正的 viseme/lip-sync。
- TTS 依赖浏览器能力和模型加载情况，可能失败，但不会阻塞主页面。
- Voice/Video 通话尚未实现。
- Model Builder 尚未实现。
- Classroom 场景资源已存在，但还没有深度接入聊天 UI。
- MoA 已经有后端路由，但与主聊天 UI 的深度整合仍有限。
- 当前仍是原型阶段，需要更多回归测试。

## 7. 建议下一步

1. 稳定 Avatar 生产级体验：
   - 更清晰的加载和错误状态；
   - 移动端/桌面端响应式检查；
   - 更自然的课堂背景；
   - 保留必要的用户控制项，减少调试痕迹。

2. 提升动画真实感：
   - 将回复阶段映射到不同动画；
   - 增加表情变化；
   - 后续接入真实 viseme/lip-sync。

3. 强化 TTS：
   - 决定继续使用浏览器端 Kokoro，还是转向后端 TTS；
   - 增加更稳定的降级策略；
   - 尽可能缓存模型初始化结果。

4. 将 MoA 深度接入主聊天流程：
   - 模型选择；
   - 多模型回答对比；
   - 合并答案展示；
   - 流式协议支持。

5. 增加测试：
   - Avatar 资源审计；
   - 前端构建测试；
   - 后端路由冒烟测试；
   - `/chat` 和 `/avatar-lab` 的浏览器截图检查。

## 8. 已排除的文件

以下文件不应发送，也不应提交：

- `.env`
- `web/.env.local`
- `.venv/`
- `.uv-cache/`
- `node_modules/`
- `.next/`
- `.logs/`
- 本地调试截图，例如 `web/avatar-*.png`

配置示例请使用 `.env.example`，不要发送真实 API key。
