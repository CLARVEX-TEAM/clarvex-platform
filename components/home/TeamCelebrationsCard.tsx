"use client";

import Link from "next/link";
import { Cake, Pencil } from "lucide-react";
import { Card, ProfileAvatar } from "@/components/ui";

export type TeamMember = { id: string; name: string; photoUrl?: string | null; birthDate?: string | null; hireDate?: string | null };

function formatDayMonth(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

export function TeamCelebrationsCard({ members, manageHref }: { members: TeamMember[]; manageHref?: string }) {
  return (
    <Card className="p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cake className="text-pink-500" size={18} />
          <h2 className="text-lg font-black">Cumpleaños del equipo</h2>
        </div>
        {manageHref ? (
          <Link href={manageHref} className="flex items-center gap-1 text-xs font-black text-volt">
            <Pencil size={13} /> Configurar
          </Link>
        ) : null}
      </div>
      <div className="divide-y divide-white/[0.07]">
        {members.map((member) => {
          const birthday = formatDayMonth(member.birthDate);
          const anniversary = formatDayMonth(member.hireDate);
          return (
            <div key={member.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar name={member.name} photoUrl={member.photoUrl} size="sm" />
                <p className="truncate font-bold">{member.name}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                <span className="text-ink/70">{birthday ? `🎂 ${birthday}` : <span className="text-muted">🎂 sin fecha</span>}</span>
                {anniversary ? <span className="text-ink/55">🎉 ingreso {anniversary}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
