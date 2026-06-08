# DeepTutor Plus Integration Notes

## Integration Strategy

DeepTutor Plus keeps DeepTutor as the main system and adds selected OpenTutorAi-style features incrementally.

DeepTutor pieces preserved:

- Python/FastAPI backend structure.
- Next.js + React frontend.
- Original chat and capability workflow.
- Knowledge Hub, RAG, question bank, skills, CLI, and related DeepTutor modules.

OpenTutorAi-style pieces introduced:

- 3D Avatar GLB assets and React/Three.js renderer.
- Avatar chat mode inside the existing chat page.
- Browser-side Kokoro TTS hook and worker.
- MoA backend routes and response-card components.
- Multi-variant Docker files retained from the merge source.

## Completed In Current Prototype

- Added frontend dependencies for `three`, `@types/three`, `kokoro-js`, and `@huggingface/transformers`.
- Fixed Avatar model paths under `web/public/avatars`.
- Fixed TTS worker path.
- Removed references to missing Avatar exports.
- Added `/avatar-lab` for renderer and animation diagnostics.
- Added chat-page `Normal / Avatar` toggle.
- Added four selectable tutor models.
- Added Avatar animation registry for idle/thinking/speaking.
- Connected speaking state to streamed replies and optional TTS playback.
- Wired MoA router into the FastAPI app.
- Updated MoA service to use existing DeepTutor LLM helpers.
- Added Windows local lifecycle scripts for start and shutdown.

## Current Backend Interfaces

```text
GET  /api/v1/moa/models
POST /api/v1/moa/completions
POST /api/v1/moa/reset
```

Example request:

```json
{
  "messages": [
    { "role": "user", "content": "Explain gradient descent in one paragraph." }
  ],
  "strategy": "parallel",
  "models": ["deepseek-chat"]
}
```

## Current Preview Entrypoints

Main chat demo:

```text
/chat
```

Avatar developer lab:

```text
/avatar-lab
```

Older Plus preview route:

```text
/plus-preview
```

## Still Pending

- Real viseme/lip-sync support.
- Full classroom scene integration.
- Production-grade Avatar mode UX.
- MoA streaming protocol and full chat UI integration.
- Model Builder.
- Real voice/video calling.
- End-to-end regression tests and screenshot checks.
