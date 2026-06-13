// Set de reacciones permitidas para comunicados. Compartido por API (validación) y frontend.
export const ANNOUNCEMENT_REACTIONS = ["👍", "❤️", "🎉", "🔥", "👏", "😮", "✅"] as const;

export type AnnouncementReactionEmoji = (typeof ANNOUNCEMENT_REACTIONS)[number];

export function isValidReaction(emoji: string): emoji is AnnouncementReactionEmoji {
  return (ANNOUNCEMENT_REACTIONS as readonly string[]).includes(emoji);
}
