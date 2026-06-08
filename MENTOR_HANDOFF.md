# DeepTutor Plus Mentor Handoff

Date: 2026-06-08

## 1. What This Package Contains

This package is the current DeepTutor Plus prototype. It starts from the DeepTutor codebase and adds a first usable path for selected OpenTutorAi-style Plus features.

The main focus so far is the Avatar tutor inside the real chat page.

## 2. Current Working Demo

Primary demo route:

```text
http://localhost:3000/chat
```

On the chat page, the user can switch between:

- `Normal`: original text chat mode.
- `Avatar`: chat mode with a 3D tutor panel.

Avatar mode currently supports:

- Four GLB tutor models: The Scholar, The Mentor, The Coach, The Innovator.
- Stable Three.js model loading and automatic framing.
- Mouse orbit controls for rotating and zooming the model.
- Idle/thinking/speaking state transitions.
- External animation registry for idle, thinking, and speaking clips.
- Speaking state during streamed AI replies.
- Optional TTS playback after replies; when TTS plays, Avatar also uses speaking state.

Developer test route:

```text
http://localhost:3000/avatar-lab
```

This is useful for testing model loading, animation selection, and renderer behavior without going through the full chat flow.

## 3. Local Startup And Shutdown

Windows helper scripts are included at the project root:

```cmd
start-backend-local.cmd
start-frontend-local.cmd
stop-local.cmd
```

Recommended demo flow:

```cmd
start-backend-local.cmd
start-frontend-local.cmd
```

Then open:

```text
http://localhost:3000/chat
```

When finished:

```cmd
stop-local.cmd
```

The shutdown script stops the frontend process on port `3000` and backend process on port `8001`.

## 4. Important Implementation Files

Avatar:

```text
web/app/components/avatar/AvatarChat.tsx
web/app/components/avatar/AvatarRenderer.tsx
web/app/components/avatar/avatarAssets.ts
web/app/avatar-lab/page.tsx
web/public/avatars/
```

Chat integration:

```text
web/app/chat/page.tsx
web/context/UnifiedChatContext.tsx
```

TTS:

```text
web/app/hooks/useTTS.ts
web/app/workers/kokoro.worker.ts
```

MoA backend:

```text
deeptutor/services/moa.py
deeptutor/api/routes/moa.py
deeptutor/api/main.py
```

Quiz math rendering:

```text
web/components/quiz/QuizViewer.tsx
web/app/globals.css
```

## 5. What Has Been Fixed

- Fixed frontend build blockers around missing Avatar exports and worker paths.
- Fixed Avatar default model path and GLB loading behavior.
- Stabilized the Three.js renderer lifecycle so the canvas does not disappear after route/state changes.
- Added model auto-scaling, ground placement, lighting, and camera framing.
- Added OrbitControls for mouse rotate and zoom.
- Added animation registry so Avatar states are not hard-coded directly in the renderer.
- Connected Avatar speaking state to streamed AI output.
- Added optional TTS-driven speaking state.
- Connected MoA backend routes to the FastAPI app.
- Updated quiz/problem rendering so common LaTeX math is rendered visually.
- Added Windows startup/shutdown scripts for local demo lifecycle.
- Initialized git version control for the project.

## 6. Known Limitations

- Avatar lip sync is state-based, not real viseme-based lip sync.
- TTS depends on browser support and model loading; it can fail gracefully.
- Voice/video calls are not implemented.
- Model Builder is not implemented.
- Avatar classroom scene is available as assets but not deeply integrated into the chat UI.
- MoA is wired as a backend route, but deep UI integration is still limited.
- The project is still a prototype and needs broader regression testing.

## 7. Suggested Next Steps

1. Stabilize Avatar production UX:
   - clearer loading/error states,
   - responsive layout checks,
   - more polished classroom background,
   - user-facing controls only where needed.

2. Improve animation realism:
   - map response phases to animation choices,
   - add expression changes,
   - eventually add viseme/lip-sync support.

3. Strengthen TTS:
   - decide between browser Kokoro and backend TTS,
   - add robust fallback,
   - cache model initialization where possible.

4. Integrate MoA into the main chat workflow:
   - model selection,
   - response comparison,
   - merged answer display,
   - streaming support.

5. Add tests:
   - Avatar asset audit in CI,
   - frontend build test,
   - backend route smoke tests,
   - browser screenshot checks for `/chat` and `/avatar-lab`.

## 8. Files Intentionally Excluded From Git/Package

The following should not be sent or committed:

- `.env`
- `web/.env.local`
- `.venv/`
- `.uv-cache/`
- `node_modules/`
- `.next/`
- `.logs/`
- local debug screenshots such as `web/avatar-*.png`

Use `.env.example` for configuration templates instead of sending real API keys.
