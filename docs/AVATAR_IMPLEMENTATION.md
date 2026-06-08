# DeepTutor Plus Avatar Implementation

## Current Status

Avatar is now a selectable mode inside the main chat page. Users can switch
between `Normal` and `Avatar` without leaving `/chat`.

Implemented:

- Chat-page Avatar entry with `Normal / Avatar` toggle.
- Four selectable tutor models: The Scholar, The Mentor, The Coach, The Innovator.
- Stable Three.js canvas lifecycle with one active Avatar canvas.
- GLB model loading, automatic scaling, ground placement, lighting, and camera framing.
- External idle, thinking, and speaking animation clips loaded from `public/avatars/glb`.
- Animation registry for idle, thinking, and speaking clips.
- Idle animation starts automatically, so the tutor no longer appears in T-pose.
- Avatar runtime state machine: `idle`, `thinking`, `speaking`, `error`.
- Speaking animation is wired to chat streaming output and TTS playback.
- Optional post-stream TTS playback in the chat Avatar panel.
- `/avatar-lab` developer test page for model, animation, state, TTS, and renderer diagnostics.
- Resource audit command: `npm run avatar:audit`.

Not implemented yet:

- Real viseme timing from generated speech.
- Voice/video calls.
- Classroom background scene.
- Production user-facing animation or expression selector.

## Implementation Path

The Avatar feature is split into three layers.

### 1. Asset Configuration

File:

```text
web/app/components/avatar/avatarAssets.ts
```

Responsibilities:

- Defines available tutor models and their public GLB URLs.
- Defines the Avatar animation registry.
- Resolves default external animation clips:
  - idle: `idle-standing-002`
  - thinking: `thinking-expression-001`
  - speaking: `speaking-talk-001`
- Defines durable capability flags, such as whether TTS is connected.
- Provides helpers for validating stored model names.
- Provides helpers for resolving a complete animation set.

This keeps route/page code from manually constructing asset paths.

Registry entries are shaped like this:

```ts
{
  id: string;
  label: string;
  state: "idle" | "thinking" | "speaking";
  mood: "neutral" | "engaged" | "expressive";
  url: string;
  description: string;
  defaultForState: boolean;
}
```

### 2. Renderer

File:

```text
web/app/components/avatar/AvatarRenderer.tsx
```

Responsibilities:

- Creates the Three.js scene, camera, lights, ground, and renderer.
- Loads the selected tutor GLB.
- Loads external idle/thinking/speaking GLB animation clips.
- Crossfades between idle, thinking, and speaking actions.
- Exposes imperative methods for future animation, expression, and viseme control.
- Cleans up canvas and renderer resources when the model changes or component unmounts.

Important props:

```ts
modelUrl: string;
avatarState?: "idle" | "thinking" | "speaking" | "error";
idleAnimationUrl?: string;
thinkingAnimationUrl?: string;
speakingAnimationUrl?: string;
isSpeaking?: boolean;
```

### 3. Chat Integration

File:

```text
web/app/(workspace)/chat/[[...sessionId]]/page.tsx
```

Responsibilities:

- Keeps Avatar as an optional chat view mode.
- Persists selected mode and selected model in `localStorage`.
- Derives Avatar runtime state from renderer errors, request streaming,
  assistant output, TTS generation, and TTS playback.
- Shows loading/error/idle/thinking/speaking states in the Avatar panel.
- Keeps voice off by default. Users explicitly enable voice before Kokoro
  initializes or downloads model assets.
- Speaks the final assistant answer after streaming completes.

Current state signals:

```ts
thinking: streaming assistant message exists but has no text yet, or TTS is generating
speaking: assistant text is streaming, or TTS audio is playing
idle: no active request/audio
error: renderer failed
```

The current TTS path is intentionally post-stream full-answer playback. It does
not yet segment streaming text into a sentence queue.

## Avatar Lab

Route:

```text
/avatar-lab
```

Use it for real testing before tightening the main chat experience:

- Select any of the four tutor models.
- Manually switch runtime state: idle, thinking, speaking, error.
- Swap registered idle/thinking/speaking animation clips.
- Initialize Kokoro TTS and play a sample utterance.
- Inspect renderer runtime diagnostics from `window.__deepTutorAvatarDebug`.

This page deliberately excludes viseme/lip-sync controls for now.

## Asset Audit

Command:

```bash
npm run avatar:audit
```

What it checks:

- GLB file size.
- Node count.
- Mesh count.
- Skin count.
- Animation count.
- Morph target count.
- Whether an asset is registered in the Avatar animation registry.
- Whether a registered animation is the default for its state.

Current finding:

- The four tutor model GLBs contain mesh, skin, and morph targets.
- The four tutor model GLBs do not contain embedded animations.
- The `idle`, `expression`, `locomotion`, and `dance` folders contain external animation-only GLBs.

That is why the renderer loads a tutor model and separate animation clips.

## Next Work

Recommended order:

1. Test `/avatar-lab` across all four tutor models and registry clips.
2. Pick one final default speaking clip that feels like teaching rather than talking randomly.
3. Add a lightweight expression layer using existing morph targets.
4. Add streaming sentence segmentation and queued post-sentence TTS.
5. Add real viseme timing from generated speech.
6. Replace the sky/ground stage with a restrained classroom-style background.
7. Explore voice/video calls after the basic Avatar tutor loop is stable.
