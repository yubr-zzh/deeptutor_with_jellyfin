export const AVATAR_MODELS = [
  {
    name: "The Scholar",
    modelUrl: "/avatars/glb/The%20Scholar.glb",
    role: "calm explainer",
  },
  {
    name: "The Mentor",
    modelUrl: "/avatars/glb/The%20Mentor.glb",
    role: "supportive coach",
  },
  {
    name: "The Coach",
    modelUrl: "/avatars/glb/The%20Coach.glb",
    role: "practice guide",
  },
  {
    name: "The Innovator",
    modelUrl: "/avatars/glb/The%20Innovator.glb",
    role: "creative guide",
  },
] as const;

export type AvatarModelName = (typeof AVATAR_MODELS)[number]["name"];

export type AvatarAnimationState = "idle" | "thinking" | "speaking";
export type AvatarAnimationMood = "neutral" | "engaged" | "expressive";
export type AvatarRuntimeState =
  | "idle"
  | "thinking"
  | "speaking"
  | "error";

export interface AvatarAnimationDef {
  id: string;
  label: string;
  state: AvatarAnimationState;
  mood: AvatarAnimationMood;
  url: string;
  description: string;
  defaultForState?: boolean;
}

export const AVATAR_ANIMATION_REGISTRY = [
  {
    id: "idle-standing-001",
    label: "Standing Idle",
    state: "idle",
    mood: "neutral",
    url: "/avatars/glb/idle/M_Standing_Idle_001.glb",
    description: "Minimal relaxed standing loop.",
    defaultForState: false,
  },
  {
    id: "idle-standing-002",
    label: "Standing Idle Wide",
    state: "idle",
    mood: "neutral",
    url: "/avatars/glb/idle/M_Standing_Idle_002.glb",
    description: "Default tutor idle with visible but restrained movement.",
    defaultForState: true,
  },
  {
    id: "idle-shift-001",
    label: "Idle Shift",
    state: "idle",
    mood: "engaged",
    url: "/avatars/glb/idle/M_Standing_Idle_Variations_001.glb",
    description: "Small posture variation for a more present tutor.",
    defaultForState: false,
  },
  {
    id: "thinking-expression-001",
    label: "Thinking Pause",
    state: "thinking",
    mood: "neutral",
    url: "/avatars/glb/expression/M_Standing_Expressions_001.glb",
    description: "Calm standing expression for request processing.",
    defaultForState: true,
  },
  {
    id: "thinking-expression-006",
    label: "Thinking Emphasis",
    state: "thinking",
    mood: "engaged",
    url: "/avatars/glb/expression/M_Standing_Expressions_006.glb",
    description: "More animated thinking posture.",
    defaultForState: false,
  },
  {
    id: "speaking-talk-001",
    label: "Tutor Talking",
    state: "speaking",
    mood: "engaged",
    url: "/avatars/glb/expression/M_Talking_Variations_001.glb",
    description: "Default speaking loop for streamed assistant output.",
    defaultForState: true,
  },
  {
    id: "speaking-talk-003",
    label: "Tutor Talking Small",
    state: "speaking",
    mood: "neutral",
    url: "/avatars/glb/expression/M_Talking_Variations_003.glb",
    description: "Subtler speaking loop.",
    defaultForState: false,
  },
  {
    id: "speaking-talk-005",
    label: "Tutor Talking Expressive",
    state: "speaking",
    mood: "expressive",
    url: "/avatars/glb/expression/M_Talking_Variations_005.glb",
    description: "More expressive speaking loop for future emphasis moments.",
    defaultForState: false,
  },
] as const satisfies readonly AvatarAnimationDef[];

export type AvatarAnimationId = (typeof AVATAR_ANIMATION_REGISTRY)[number]["id"];

export const AVATAR_ANIMATIONS = {
  idle: getDefaultAvatarAnimation("idle").url,
  thinking: getDefaultAvatarAnimation("thinking").url,
  speaking: getDefaultAvatarAnimation("speaking").url,
} as const;

export const AVATAR_CAPABILITIES = {
  modelAnimationsEmbedded: false,
  externalIdleAnimation: true,
  externalThinkingAnimation: true,
  externalSpeakingAnimation: true,
  morphTargetsRequiredForLipSync: true,
  ttsConnectedToChat: true,
  postStreamTTSPlayback: true,
  visemeTimingConnected: false,
} as const;

export function getAvatarModel(name: AvatarModelName) {
  return AVATAR_MODELS.find((model) => model.name === name) ?? AVATAR_MODELS[0];
}

export function isAvatarModelName(value: string): value is AvatarModelName {
  return AVATAR_MODELS.some((model) => model.name === value);
}

export function getAvatarAnimationsByState(state: AvatarAnimationState) {
  return AVATAR_ANIMATION_REGISTRY.filter(
    (animation) => animation.state === state,
  );
}

export function getAvatarAnimation(id: AvatarAnimationId) {
  return (
    AVATAR_ANIMATION_REGISTRY.find((animation) => animation.id === id) ??
    AVATAR_ANIMATION_REGISTRY[0]
  );
}

export function getDefaultAvatarAnimation(state: AvatarAnimationState) {
  return (
    AVATAR_ANIMATION_REGISTRY.find(
      (animation) => animation.state === state && animation.defaultForState,
    ) ?? getAvatarAnimationsByState(state)[0]
  );
}

export function resolveAvatarAnimationSet(overrides?: {
  idle?: AvatarAnimationId;
  thinking?: AvatarAnimationId;
  speaking?: AvatarAnimationId;
}) {
  return {
    idle: overrides?.idle
      ? getAvatarAnimation(overrides.idle)
      : getDefaultAvatarAnimation("idle"),
    thinking: overrides?.thinking
      ? getAvatarAnimation(overrides.thinking)
      : getDefaultAvatarAnimation("thinking"),
    speaking: overrides?.speaking
      ? getAvatarAnimation(overrides.speaking)
      : getDefaultAvatarAnimation("speaking"),
  };
}
