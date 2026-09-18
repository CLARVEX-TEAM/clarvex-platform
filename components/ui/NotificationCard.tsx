"use client";

import Image from "next/image";
import { ImagenAmpliable } from "@/components/VisorImagen";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { StatusBadge } from "./StatusBadge";
import { ProfileAvatar } from "./ProfileAvatar";

export function NotificationCard({
  title,
  body,
  meta,
  unread,
  action,
  author,
  imageUrl
}: {
  title: string;
  body: string;
  meta?: string;
  unread?: boolean;
  action?: React.ReactNode;
  author?: { name: string; photoUrl?: string | null };
  imageUrl?: string | null;
}) {
  return (
    <GlassCard className={cn("p-3", unread && "border-volt/35 bg-volt/[0.055]")}>
      <div className="flex items-start gap-2.5">
        {author ? <ProfileAvatar name={author.name} photoUrl={author.photoUrl} size="sm" className="size-9 rounded-full shadow-none" /> : <span className={cn("grid size-9 shrink-0 place-items-center rounded-[16px] border border-line", unread ? "bg-volt/10 text-volt" : "bg-panel text-muted")}><Bell size={16} /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold leading-5 tracking-[-0.02em] text-ink">{title}</h2>
              {meta ? <p className="mt-0.5 text-[11px] text-muted">{meta}</p> : null}
            </div>
            <StatusBadge tone={unread ? "success" : "default"}>{unread ? "nuevo" : "leido"}</StatusBadge>
          </div>
          {/*
            ⚠️ `whitespace-pre-line` o el comunicado se lee como un muro.

            Los comunicados del corporativo vienen con estructura: una línea de
            vigencia, una lista de descuentos, otra de lo que no participa. El
            escritorio ya la respetaba --mismo texto, misma base de datos-- y
            aquí se colapsaba todo en un párrafo, así que el mismo comunicado se
            leía bien en la computadora y mal en el teléfono, que es donde lo
            lee el equipo. Reportado el 18 de septiembre de 2026.

            `pre-line` y no `pre-wrap`: conserva los saltos de línea pero junta
            los espacios repetidos, así que una sangría accidental al pegar el
            texto no abre un hueco en la tarjeta. Es lo mismo que usa el
            escritorio.

            `break-words` porque estos avisos traen códigos largos sin espacios
            --«75030000214»-- y en 412 px se salen de la tarjeta.
          */}
          <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-5 text-muted">{body}</p>
          {imageUrl ? (
            <ImagenAmpliable src={imageUrl} alt="Imagen del comunicado" className="mt-2.5 block w-full overflow-hidden rounded-2xl border border-line">
              <Image src={imageUrl} alt="Imagen del comunicado" width={800} height={400} className="w-full object-cover" />
            </ImagenAmpliable>
          ) : null}
          {action ? <div className="mt-2.5">{action}</div> : null}
        </div>
      </div>
    </GlassCard>
  );
}
