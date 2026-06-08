# DeepTutor Plus Troubleshooting

## Local Servers

### Frontend does not open

Check whether the frontend is running:

```text
http://localhost:3000/chat
```

If it is not running, start it from the project root:

```cmd
start-frontend-local.cmd
```

If the port is already occupied or the server seems stuck, stop local servers:

```cmd
stop-local.cmd
```

Then start again.

### Backend does not open

Check:

```text
http://localhost:8001/docs
```

Start it from the project root:

```cmd
start-backend-local.cmd
```

### "Access is denied" when stopping

Run Command Prompt as Administrator and execute:

```cmd
stop-local.cmd
```

## Environment And API Keys

Use `.env.example` as the template.

Do not send or commit `.env`.

For DeepSeek-compatible configuration:

```env
LLM_BINDING=openai
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-api-key
```

If chat returns provider/authentication errors, first check the API key and base URL.

## Avatar

### Canvas appears, but model is missing

Check that GLB files exist:

```text
web/public/avatars/glb/The Scholar.glb
web/public/avatars/glb/The Mentor.glb
web/public/avatars/glb/The Coach.glb
web/public/avatars/glb/The Innovator.glb
```

Run the avatar asset audit:

```bash
cd web
npm run avatar:audit
```

### Model appears but does not move

Avatar should at least play idle animation. If it is static:

- Check browser console for GLB loading errors.
- Confirm animation files exist under `web/public/avatars/glb/idle` and `web/public/avatars/glb/expression`.
- Open `/avatar-lab` and test the animation registry there.

### Mouse control does not work

In Avatar mode, drag on the model area to rotate and use mouse wheel to zoom.

If this fails, check whether another overlay is covering the canvas.

## TTS

TTS is browser-side and can fail depending on browser support, model download, and runtime availability.

Expected behavior:

- TTS failure should show an error or silently skip playback.
- TTS failure should not break the chat page.
- Avatar should still work without TTS.

## Math Rendering

Quiz/problem content should render common LaTeX expressions visually.

If raw LaTeX appears:

- Refresh the frontend page.
- Restart the frontend dev server.
- Check whether the content is malformed, especially nested `$...$`.

## Build Checks

Frontend:

```bash
cd web
npm run build
```

Backend Python smoke check:

```bash
python -m py_compile deeptutor/services/moa.py deeptutor/api/routes/moa.py deeptutor/api/main.py
```
