import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "rgb(var(--color-void) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        volt: "#2563EB",
        mint: "#22C55E",
        ember: "#F59E0B",
        orchid: "#EF4444",
        purple: "#4F46E5",
        sky: "#0EA5E9",
        success: "#22C55E",

        // ─── Tokens del escritorio (app/escritorio/desktop.css) ───────────────
        // Solo tienen valor real dentro de [data-surface="desk"]. El segundo
        // argumento de var() es la reserva: si estas clases se usaran fuera del
        // escritorio, caen en el valor de marca y no rompen nada.
        accent: "rgb(var(--desk-accent, 37 99 235) / <alpha-value>)",
        "accent-hi": "rgb(var(--desk-accent-hover, 29 78 216) / <alpha-value>)",
        "accent-quiet": "rgb(var(--desk-accent-quiet, 239 246 255) / <alpha-value>)",
        "on-accent": "rgb(var(--desk-on-accent, 255 255 255) / <alpha-value>)",
        "ink-2": "rgb(var(--desk-ink-2, 131 132 140) / <alpha-value>)",
        "line-strong": "rgb(var(--desk-line-strong, 209 213 219) / <alpha-value>)",
        "surface-3": "rgb(var(--desk-surface-3, 255 255 255) / <alpha-value>)",
        ok: "rgb(var(--desk-success, 34 197 94) / <alpha-value>)",
        warn: "rgb(var(--desk-warn, 245 158 11) / <alpha-value>)",
        danger: "rgb(var(--desk-danger, 239 68 68) / <alpha-value>)"
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(37 99 235 / 0.16), 0 12px 30px rgb(37 99 235 / 0.13)",
        glass: "0 10px 30px rgb(15 23 42 / 0.08)",
        e1: "var(--desk-elev-1, 0 1px 2px rgb(16 20 27 / 0.06))",
        e2: "var(--desk-elev-2, 0 4px 12px rgb(16 20 27 / 0.08))",
        e3: "var(--desk-elev-3, 0 16px 40px rgb(16 20 27 / 0.14))"
      },
      fontSize: {
        // Escala fija en rem (ratio ~1.2). Mapea 1:1 con las variables del
        // escritorio para poder usarlas como clases.
        caption: ["0.75rem", { lineHeight: "1rem" }],
        ui: ["0.875rem", { lineHeight: "1.25rem" }],
        lead: ["1.125rem", { lineHeight: "1.6rem" }],
        metric: ["2.75rem", { lineHeight: "1", letterSpacing: "-0.03em" }]
      },
      transitionTimingFunction: {
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
