# DeepTutor Plus

DeepTutor Plus is an enhanced DeepTutor prototype. The current goal is to keep the original DeepTutor learning system usable while adding a first working path for OpenTutorAi-style Plus features, especially the 3D Avatar tutor.

This repository is currently a local research/prototype handoff, not a production release.

## Current Status

Implemented or wired:

- Original DeepTutor chat and capability workspace remain available.
- Main chat page supports a selectable `Normal / Avatar` mode.
- Avatar mode can render four tutor models: The Scholar, The Mentor, The Coach, and The Innovator.
- Three.js GLB rendering is stable enough for local preview.
- Avatar state machine supports `idle`, `thinking`, `speaking`, and `error`.
- Idle/thinking/speaking animation clips are managed through an animation registry.
- During streamed AI replies, the Avatar enters `speaking`.
- Optional browser-side TTS is connected to Avatar mode; when it plays, the Avatar also enters `speaking`.
- Math rendering in quiz/problem content uses Markdown + LaTeX rendering instead of showing raw formula text.
- MoA backend routes are connected:
  - `GET /api/v1/moa/models`
  - `POST /api/v1/moa/completions`
  - `POST /api/v1/moa/reset`
- Local Windows lifecycle scripts are included:
  - `start-backend-local.cmd`
  - `start-frontend-local.cmd`
  - `stop-local.cmd`

Not implemented yet:

- Real viseme/lip-sync timing from TTS audio.
- Real voice/video calling.
- Full classroom scene integration.
- Full OpenTutorAi Model Builder integration.
- Production-grade Avatar controls and user-facing animation selection.

## Quick Start On Windows

From the project root:

```cmd
start-backend-local.cmd
start-frontend-local.cmd
```

Open:

```text
http://localhost:3000/chat
```

To stop both local servers:

```cmd
stop-local.cmd
```

The frontend usually runs on port `3000`; the backend usually runs on port `8001`.

## Manual Setup

Backend:

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[server]"
.venv\Scripts\python.exe -m deeptutor serve
```

Frontend:

```bash
cd web
npm install
npm run dev
```

## Environment

Use `.env.example` as the template. Do not commit real API keys.

For a DeepSeek-compatible OpenAI-style backend, configure values similar to:

```env
LLM_BINDING=openai
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-api-key
```

## Main Project Structure

```text
deep-tutor-plus/
  deeptutor/                 Python backend and DeepTutor core modules
  deeptutor_cli/             CLI entrypoints
  web/                       Next.js frontend
    app/chat/                Main chat route
    app/avatar-lab/          Avatar developer test route
    app/components/avatar/   Avatar renderer, chat panel, asset registry
    components/quiz/         Quiz/problem UI and math rendering
    public/avatars/          GLB models, animations, classroom assets
  docs/                      Current implementation and integration notes
  start-backend-local.cmd    Windows backend startup helper
  start-frontend-local.cmd   Windows frontend startup helper
  stop-local.cmd             Windows shutdown helper
```

## Useful Checks

Frontend build:

```bash
cd web
npm run build
```

Avatar asset audit:

```bash
cd web
npm run avatar:audit
```

Backend smoke check:

```bash
python -m py_compile deeptutor/services/moa.py deeptutor/api/routes/moa.py deeptutor/api/main.py
```

## Notes For Mentor Review

Start with `MENTOR_HANDOFF.md` for a concise summary of what changed, what works, and what should be done next.
