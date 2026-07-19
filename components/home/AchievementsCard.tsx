"use client";

import { Award } from "lucide-react";
import type { Achievement } from "@/lib/achievements";
import { Badge, Card } from "@/components/ui";

export function AchievementsCard({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter((a) => a.unlocked).length;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="text-volt" size={18} />
          <h2 className="text-lg font-semibold">Logros</h2>
        </div>
        <Badge tone={unlocked > 0 ? "success" : "default"}>{unlocked}/{achievements.length}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-2.5 rounded-2xl border p-2.5 transition ${
              a.unlocked
                ? "border-volt/30 bg-volt/[0.06]"
                : "border-line bg-panel opacity-60"
            }`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-lg ${a.unlocked ? "bg-volt/15" : "bg-slate-200/60 grayscale dark:bg-slate-700/60"}`}>
              {a.unlocked ? a.emoji : "🔒"}
            </span>
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${a.unlocked ? "text-ink" : "text-muted"}`}>{a.title}</p>
              <p className="truncate text-[11px] text-muted">{a.description}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
