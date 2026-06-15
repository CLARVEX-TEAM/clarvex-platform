// Reconocimiento entre pares. Set fijo de reconocimientos.

export const KUDO_OPTIONS: Array<{ emoji: string; label: string }> = [
  { emoji: "👏", label: "Buen trabajo" },
  { emoji: "🙌", label: "Crack" },
  { emoji: "⭐", label: "Estrella" },
  { emoji: "💪", label: "Gran esfuerzo" },
  { emoji: "🔥", label: "En racha" },
  { emoji: "🤝", label: "Buen compañero" }
];

export const KUDO_EMOJIS = KUDO_OPTIONS.map((option) => option.emoji);

export function isValidKudoEmoji(emoji: string): boolean {
  return KUDO_EMOJIS.includes(emoji);
}
