import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0F14",
        panel: "#111827",
        card: "#161F2C",
        line: "#1E293B",
        ink: "#F8FAFC",
        muted: "#94A3B8",
        volt: "#22C55E",
        mint: "#22C55E",
        ember: "#F59E0B",
        orchid: "#EF4444"
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(34 197 94 / 0.18), 0 24px 64px rgb(0 0 0 / 0.58)",
        glass: "0 20px 55px rgb(0 0 0 / 0.38)"
      }
    }
  },
  plugins: []
};

export default config;
