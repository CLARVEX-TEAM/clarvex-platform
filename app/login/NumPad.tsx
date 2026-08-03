"use client";

import { Delete } from "lucide-react";
import { RippleButton } from "@/components/animate-ui/RippleButton";

export function NumPad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;
  return (
    <div className="grid grid-cols-3 gap-3 px-6">
      {keys.map((k, i) => {
        if (k === "") return <div key={`empty-${i}`} />;
        return (
          <RippleButton
            key={k}
            type="button"
            tapScale={0.85}
            onPointerDown={(e) => {
              e.preventDefault();
              onKey(k);
            }}
            className={`h-[4.25rem] select-none rounded-2xl text-xl font-bold transition-colors ${
              k === "del"
                ? "flex items-center justify-center text-slate-400 dark:text-slate-500"
                : "bg-white/80 text-slate-900 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-white"
            }`}
          >
            {k === "del" ? <Delete size={22} /> : k}
          </RippleButton>
        );
      })}
    </div>
  );
}
