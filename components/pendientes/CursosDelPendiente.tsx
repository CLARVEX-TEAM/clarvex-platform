"use client";

import { useState } from "react";
import { Check, GraduationCap, Hourglass, Plus, X } from "lucide-react";
import type { CursoDePendiente, Pending } from "@/lib/types";

/*
 * Matrices de cursos dentro de Pendientes.
 *
 * ⚠️ Viven aquí y no en `app/pendientes/page.tsx` porque Next no deja exportar
 * nada más que el `default` de una página, y los usan las dos pantallas.
 */

/**
 * El avance de una matriz: barra, «3 de 6» y cada curso con su palomita.
 * Gerencia puede marcar o desmarcar a mano; la persona completa los suyos
 * mandando el certificado al bot de WhatsApp.
 */
export function AvanceDeCursos(props: {
  pending: Pending;
  /** Solo gerencia: toca un curso para marcarlo o desmarcarlo. */
  onMarcar?: (curso: CursoDePendiente, hecho: boolean) => Promise<void>;
}) {
  const cursos = props.pending.cursos ?? [];
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (cursos.length === 0) return null;
  const hechos = cursos.filter((c) => c.hecho).length;
  const pct = Math.round((hechos / cursos.length) * 100);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-panel/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <GraduationCap size={15} aria-hidden /> Cursos
        </span>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {hechos} de {cursos.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {cursos.map((c) => {
          const contenido = (
            <>
              {c.hecho ? <Check size={13} aria-hidden /> : <span className="tabular-nums opacity-60">{c.orden}</span>}
              {c.nombre}
            </>
          );
          const clase = `inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${
            c.hecho ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-muted dark:bg-slate-800"
          }`;
          return (
            <li key={c.id}>
              {props.onMarcar ? (
                <button
                  type="button"
                  disabled={ocupado === c.id}
                  aria-pressed={c.hecho}
                  aria-label={`${c.nombre}: ${c.hecho ? "completado, toca para desmarcar" : "pendiente, toca para marcar"}`}
                  onClick={async () => {
                    setOcupado(c.id);
                    try {
                      await props.onMarcar!(c, !c.hecho);
                    } finally {
                      setOcupado(null);
                    }
                  }}
                  className={`${clase} transition-opacity disabled:opacity-50`}
                >
                  {contenido}
                </button>
              ) : (
                <span className={clase}>{contenido}</span>
              )}
            </li>
          );
        })}
      </ul>
      {props.pending.cierreSolicitado ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Hourglass size={13} aria-hidden /> Avisó que terminó: falta que gerencia lo revise y lo cierre.
        </p>
      ) : (
        <p className="mt-2.5 text-[11px] leading-4 text-muted">Cada curso se completa mandando su certificado al WhatsApp de la tienda.</p>
      )}
    </div>
  );
}

/** Aviso de «pidió cierre» para un pendiente normal (sin matriz). */
export function AvisoCierrePedido(props: { pending: Pending }) {
  if (!props.pending.cierreSolicitado || (props.pending.cursos ?? []).length > 0) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
      <Hourglass size={13} aria-hidden /> Avisó que terminó: falta que gerencia lo revise y lo cierre.
    </p>
  );
}

/** El formulario: elegir Pendiente o Curso y, si es curso, capturar su lista. */
export function TipoYCursos(props: {
  tipo: "PENDIENTE" | "CURSO";
  onTipo: (tipo: "PENDIENTE" | "CURSO") => void;
  cursos: string[];
  onCursos: (cursos: string[]) => void;
}) {
  const { cursos } = props;
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-ink">Tipo</span>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de pendiente">
        {(["PENDIENTE", "CURSO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={props.tipo === t}
            onClick={() => {
              props.onTipo(t);
              if (t === "CURSO" && cursos.length === 0) props.onCursos([""]);
            }}
            className={`min-h-11 rounded-xl border text-sm font-semibold transition-colors ${
              props.tipo === t ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "border-line bg-panel text-muted"
            }`}
          >
            {t === "PENDIENTE" ? "Pendiente" : "Curso"}
          </button>
        ))}
      </div>
      {props.tipo === "CURSO" ? (
        <div className="grid gap-2 rounded-2xl border border-line p-3">
          <p className="text-xs leading-4 text-muted">
            El título es el nombre de la matriz. Aquí van sus cursos, en orden: cada uno se completa con su certificado.
          </p>
          {cursos.map((nombre, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
              <input
                value={nombre}
                onChange={(e) => props.onCursos(cursos.map((c, j) => (j === i ? e.target.value : c)))}
                placeholder={`Curso ${i + 1}`}
                aria-label={`Nombre del curso ${i + 1}`}
                maxLength={80}
                className="min-h-10 flex-1 rounded-xl border border-line bg-panel px-3 text-sm"
              />
              <button
                type="button"
                aria-label={`Quitar curso ${i + 1}`}
                onClick={() => props.onCursos(cursos.filter((_, j) => j !== i))}
                className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => props.onCursos([...cursos, ""])}
            disabled={cursos.length >= 20}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-semibold text-muted disabled:opacity-50"
          >
            <Plus size={15} /> Agregar curso
          </button>
        </div>
      ) : null}
    </div>
  );
}
