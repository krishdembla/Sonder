export const AVATAR_NAMES = ["Cloud", "Ember", "Moon", "Heart"] as const
export type AvatarName = (typeof AVATAR_NAMES)[number]
