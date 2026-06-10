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
        success: "#22C55E"
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(37 99 235 / 0.16), 0 12px 30px rgb(37 99 235 / 0.13)",
        glass: "0 10px 30px rgb(15 23 42 / 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
