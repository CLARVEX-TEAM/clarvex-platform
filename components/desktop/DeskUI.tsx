"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fillWidth, markerPosition, paceStatus } from "@/lib/progress-pace";
import { BlurFade } from "@/components/magic/BlurFade";
import { BorderBeam } from "@/components/magic/BorderBeam";
import { ShineBorder } from "@/components/magic/ShineBorder";
import { ShimmerButton } from "@/components/magic/ShimmerButton";

/**
 * Vocabulario compartido de las páginas de escritorio.
 *
 * Existe para que las 18 pantallas no vuelvan a divergir: si el encabezado de
 * sección, la tabla o el vacío se escriben a mano en cada página, en tres
 * semanas hay tres estilos distintos de cada cosa.
 *
 * ─── Reglas de los efectos de Magic UI ──────────────────────────────────────
 * Meterlos todos en todas partes se anula solo: si todo brilla, nada destaca.
 * Cada efecto tiene aquí un único trabajo:
 *
 *  · GradientText  → el título de sección del header. Uno por pantalla.
 *  · BlurFade      → entrada de los bloques de primer nivel. Máximo ~4 por
 *                    pantalla: anima `filter`, que es caro en GPU.
 *  · ShimmerButton → LA acción principal. Una por pantalla, nunca dos.
 *  · ShineBorder   → lo que está SIN ATENDER (vencido, sin leer).
 *  · BorderBeam    → lo que es IMPORTANTE pero está en orden.
 *  · Meteors       → fondo, en DeskBackdrop.
 */

/* ─── Estructura ─────────────────────────────────────────────────────────── */

/**
 * Encabezado de sección con acción opcional a la derecha. Es el ritmo que
 * ordena la página: título discreto arriba, contenido con peso debajo.
 */
export function DeskSection({
  title,
  hint,
  action,
  children,
  className
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-ui font-medium text-muted">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="flex items-center gap-1 text-caption font-medium text-accent hover:underline"
          >
            {action.label} <ChevronRight size={13} />
          </Link>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-caption text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Regla divisoria entre bandas. Separa sin encerrar en una tarjeta. */
export function DeskRule({ className }: { className?: string }) {
  return <hr className={cn("desk-rule", className)} />;
}

/**
 * Superficie contenida. Se usa SOLO cuando el contenido es de verdad una unidad
 * separable (un formulario, un panel de detalle), no como envoltorio por
 * defecto: para agrupar bastan el espacio y las reglas.
 *
 * `attention` enciende el borde animado. Dos niveles distintos a propósito:
 * "unattended" pide atención (vencido, sin leer), "important" solo jerarquiza.
 */
export function DeskPanel({
  children,
  className,
  attention
}: {
  children: React.ReactNode;
  className?: string;
  attention?: "unattended" | "important";
}) {
  const panel = (
    <div className={cn("rounded-2xl border border-line bg-card p-5", className)}>{children}</div>
  );

  if (attention === "unattended") {
    return <ShineBorder radius="rounded-[18px]" ringPx={1.5} tone="ember">{panel}</ShineBorder>;
  }
  if (attention === "important") {
    return <BorderBeam radius="rounded-[18px]" ringPx={1.5}>{panel}</BorderBeam>;
  }
  return panel;
}

/**
 * Entrada de un bloque de primer nivel. `index` escalona la aparición.
 * Se corta a los 4 bloques: más allá el escalonado se percibe como lentitud,
 * y BlurFade anima `filter`, que no es gratis.
 */
export function DeskReveal({
  children,
  index = 0,
  className
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <BlurFade delay={Math.min(index, 3) * 0.07} className={className}>
      {children}
    </BlurFade>
  );
}

/* ─── Estados ────────────────────────────────────────────────────────────── */

/**
 * Vacío que ENSEÑA la interfaz. Nunca "sin datos": el usuario necesita saber
 * qué tiene que pasar para que aparezca algo.
 */
export function DeskEmpty({
  icon: Icon,
  title,
  hint,
  className
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-line px-4 py-10 text-center", className)}>
      {Icon ? <Icon size={20} className="mx-auto mb-2 text-muted" aria-hidden /> : null}
      <p className="text-ui font-medium text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-caption text-muted">{hint}</p> : null}
    </div>
  );
}

/** Bloque de carga que calca la maqueta. Nunca un spinner en medio del contenido. */
export function DeskSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-panel", className)} />;
}

/* ─── Acciones ───────────────────────────────────────────────────────────── */

/**
 * LA acción principal de la pantalla. El barrido solo tiene sentido si hay una:
 * con dos botones brillando, ninguno destaca.
 */
export function DeskPrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ShimmerButton
      {...props}
      // tailwind-merge deja que estas clases ganen a las del componente base,
      // así el botón adopta los tokens del escritorio sin tocar el de móvil.
      className={cn(
        "min-h-10 w-auto rounded-xl bg-accent px-4 text-ui font-semibold text-on-accent",
        className
      )}
    />
  );
}

/** Acción secundaria: mismo tamaño y radio, sin brillo y en superficie neutra. */
export function DeskButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3.5",
        "text-ui font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-55",
        className
      )}
    />
  );
}

/* ─── Indicadores ────────────────────────────────────────────────────────── */

/**
 * Barra de alcance. El color nunca es la única señal: el porcentaje va siempre
 * al lado, y quien no distinga verde de ámbar lee el número igual.
 */
/**
 * Medidor con MARCA DE RITMO opcional.
 *
 * Sin `pace` se comporta como antes. Con `pace`, la marca dice dónde deberías
 * ir hoy y el color sale de compararte con ELLA, no con el 100%: el día 2 de un
 * mes, un 33% iba en rojo aunque estuviera por delante de lo esperado.
 */
export function DeskMeter({ value, pace = null, className }: { value: number; pace?: number | null; className?: string }) {
  const width = fillWidth(value, pace);
  const marker = markerPosition(value, pace);
  const tone = pace === null || pace === undefined
    ? (value >= 100 ? "bg-ok" : value >= 80 ? "bg-accent" : "bg-warn")
    : { cumplida: "bg-ok", adelante: "bg-ok", "en-ritmo": "bg-accent", atras: "bg-danger", "sin-ritmo": "bg-accent" }[paceStatus(value, pace)];
  return (
    <div
      className={cn("relative h-1.5 rounded-full bg-panel", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Alcance de la meta"
    >
      <div className="h-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out-quint", tone)}
          style={{ width: `${width}%` }}
        />
      </div>
      {marker !== null ? (
        <span
          className="pointer-events-none absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink/45"
          style={{ left: `${marker}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/** Campo de formulario con los tokens del escritorio. */
export const deskInput =
  "min-h-10 w-full rounded-xl border border-line bg-panel px-2.5 text-ui text-ink outline-none transition-colors focus:border-accent";

/* ─── Tabla ──────────────────────────────────────────────────────────────── */
// Clases sueltas en vez de un componente de tabla cerrado: cada pantalla tiene
// columnas distintas, y un <DeskTable columns={...}> acabaría con una prop por
// excepción. Así el marcado sigue siendo una tabla normal y legible.

export const deskTh = "py-2 text-left text-caption font-medium text-muted";
export const deskThRight = "py-2 text-right text-caption font-medium text-muted";
export const deskTd = "py-2.5 text-ui text-ink";
export const deskTdMuted = "py-2.5 text-ui text-muted";
export const deskTr = "desk-row border-b border-line last:border-b-0";
export const deskThead = "border-b border-line";
