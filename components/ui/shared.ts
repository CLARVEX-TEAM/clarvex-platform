// Tipos y constantes compartidos entre todos los componentes UI.
// Extraídos de ui.tsx para evitar imports circulares.

export type Tone = "default" | "success" | "done" | "warn" | "danger" | "info";
export type Accent = "volt" | "mint" | "ember" | "orchid" | "purple" | "sky";

export const accentText: Record<Accent, string> = {
  volt: "text-volt",
  mint: "text-success",
  ember: "text-ember",
  orchid: "text-orchid",
  purple: "text-purple",
  sky: "text-sky"
};

export const accentBg: Record<Accent, string> = {
  volt: "bg-volt",
  mint: "bg-success",
  ember: "bg-ember",
  orchid: "bg-orchid",
  purple: "bg-purple",
  sky: "bg-sky"
};

export const badgeTones: Record<Tone, string> = {
  default: "border-line bg-panel text-muted",
  success: "border-success/25 bg-success/10 text-success",
  done: "border-success/25 bg-success/10 text-success",
  warn: "border-ember/35 bg-ember/12 text-ember",
  danger: "border-orchid/35 bg-orchid/12 text-orchid",
  info: "border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-300"
};

// Curva de muelle estilo iOS: responde rápido y asienta sin rebote.
export const tactileSpring = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const;
