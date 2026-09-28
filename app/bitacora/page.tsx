"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarClock, FileText, ImagePlus, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { AppFrame, AppHeader, Button, Card, EmptyState, FloatingActionButton, Skeleton } from "@/components/ui";
import { SelectorChips } from "@/components/ui/SelectorChips";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";

/*
 * Las cinco categorias, en un sitio y no repartidas por el JSX. Antes eran
 * cinco `<option>` escritos a mano dentro del `<select>`, asi que el valor
 * inicial del estado --"Apertura"-- era una cadena suelta que nada ataba a la
 * lista: renombrar una opcion dejaba el formulario arrancando en una categoria
 * que ya no existia, y el servidor recibia texto libre sin que nada avisara.
 */
const CATEGORIAS = ["Apertura", "Cliente", "Inventario", "Equipo", "Cierre"] as const;
type Categoria = (typeof CATEGORIAS)[number];
const OPCIONES_CATEGORIA = CATEGORIAS.map((valor) => ({ value: valor, label: valor }));

export default function BitacoraPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<Categoria>(CATEGORIAS[0]);
  /*
   * ⚠️ El formulario nace CERRADO. Ocupaba media pantalla por encima de la
   * bitacora, y la bitacora se abre sobre todo para LEER lo que paso en el
   * turno anterior; quien escribe un registro lo hace a proposito y no le
   * cuesta un toque. Misma decision que en Pendientes y Comunicados.
   */
  const [creando, setCreando] = useState(false);
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formStatusType, setFormStatusType] = useState<"neutral" | "success" | "error">("neutral");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const preview = useMemo(() => evidence ? URL.createObjectURL(evidence) : null, [evidence]);

  const load = useCallback(() => {
    setLoadError(false);
    fetchAppData().then(setData).catch(() => setLoadError(true));
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!data) {
    return (
      <>
        <AppHeader title="Bitacora" subtitle="Registro cronologico de operacion de tienda." backHref="/manager" />
        <AppFrame>
          {loadError ? (
            <Card className="text-center">
              <p className="font-semibold text-ink">No se pudo cargar la bitácora</p>
              <p className="mt-1 text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
              <Button className="mt-4" onClick={() => void load()}>Reintentar</Button>
            </Card>
          ) : <div className="space-y-3"><Skeleton className="h-20 rounded-[28px]" /><div className="grid grid-cols-2 gap-3"><Skeleton className="h-20 rounded-[28px]" /><Skeleton className="h-20 rounded-[28px]" /></div><Skeleton className="h-48 rounded-[28px]" /></div>}
        </AppFrame>
      </>
    );
  }

  const entries = [...data.logEntries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";

  async function createLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    setSubmitting(true);
    setFormStatus("Guardando..."); setFormStatusType("neutral");
    try {
      const response = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, description }) });
      const payload = await response.json() as { logEntry?: AppData["logEntries"][number]; error?: string };
      if (!response.ok || !payload.logEntry) { setFormStatusType("error"); setFormStatus(payload.error ?? "No se pudo guardar el registro."); return; }
      if (comment.trim()) {
        const commentResponse = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logEntryId: payload.logEntry.id, body: comment }) });
        if (!commentResponse.ok) { setFormStatusType("error"); setFormStatus("Registro guardado, pero el comentario no pudo guardarse."); return; }
      }
      if (evidence) {
        const form = new FormData();
        form.set("file", evidence);
        form.set("note", evidenceNote);
        form.set("logEntryId", payload.logEntry.id);
        const evidenceResponse = await fetch("/api/evidences/upload", { method: "POST", body: form });
        if (!evidenceResponse.ok) { setFormStatusType("error"); setFormStatus("Registro guardado, pero la evidencia no pudo subirse."); return; }
      }
      setData({ ...data, logEntries: [...data.logEntries, payload.logEntry] });
      setDescription(""); setComment(""); setEvidence(null); setEvidenceNote(""); setFormStatusType("success"); setFormStatus("Registro guardado.");
      // Se cierra solo: el registro ya esta en la lista de abajo, que es la
      // confirmacion real. Dejarlo abierto invita a guardarlo dos veces.
      setCreando(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      setFormStatusType("error"); setFormStatus("No se pudo guardar el registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader title="Bitacora" subtitle="Registro cronologico de operacion de tienda." backHref="/manager" />
      <AppFrame>
        <Card className="mb-3 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink/45">Operacion</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{entries.length} registros</h2>
              <p className="mt-1 text-sm text-ink/58">
                Ultimo: {latest ? new Date(latest.date).toLocaleDateString("es-MX") : "sin registros"}
              </p>
            </div>
            <div className="grid size-12 place-items-center rounded-[1.1rem] border border-volt/25 bg-volt/10 text-volt">
              <BookOpen size={21} />
            </div>
          </div>
        </Card>

        {/*
          ⚠️ Eran DOS tarjetas del mismo peso que la cabecera: «Categorias 4 /
          En uso» y «Autores 3 / Equipo». Nadie hace nada con cuantas
          categorias distintas se han usado. Baja a una linea de pie, que es lo
          que es, y deja el peso visual para los registros.
        */}
        {entries.length ? (
          <p className="mb-3 px-1 text-xs text-muted">
            {new Set(entries.map((entry) => entry.authorId)).size} personas han escrito en esta bitacora
          </p>
        ) : null}

        {creando ? (
        <Card className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Nuevo registro</h2>
              <p className="mt-1 text-sm text-muted">Captura eventos relevantes de apertura, cliente, inventario o cierre.</p>
            </div>
            <button
              type="button"
              onClick={() => setCreando(false)}
              aria-label="Cerrar nuevo registro"
              className="tappable grid size-10 shrink-0 place-items-center rounded-xl text-muted transition hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <form className="mt-3 grid gap-2.5" onSubmit={createLog}>
            {/*
              ⚠️ Era un `<select>` nativo, que en Android abre la rueda del
              sistema: su tipografia, sus colores y su alto, en medio de una
              pantalla rediseniada. Y con cinco opciones costaba dos toques
              --abrir y elegir-- ver algo que cabe entero en la pantalla.
            */}
            <div>
              <p className="mb-2 text-xs font-bold text-muted">Categoria</p>
              <SelectorChips options={OPCIONES_CATEGORIA} value={category} onChange={setCategory} ariaLabel="Categoria del registro" />
            </div>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 rounded-2xl border border-line/80 bg-panel/75 px-3 py-2.5 text-ink outline-hidden transition placeholder:text-ink/34 focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Descripcion del registro" required />
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} className="min-h-16 rounded-2xl border border-line/80 bg-panel/75 px-3 py-2.5 text-ink outline-hidden transition placeholder:text-ink/34 focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Comentario adicional (opcional)" />
            {preview ? (
              <div className="relative h-40 overflow-hidden rounded-2xl bg-panel">
                <Image src={preview} alt="Vista previa de evidencia" fill sizes="360px" className="object-cover" unoptimized />
                <button type="button" onClick={() => setEvidence(null)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-white/90" aria-label="Quitar evidencia"><X size={16} /></button>
              </div>
            ) : null}
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-panel text-sm font-semibold text-ink">
              <ImagePlus size={17} /> {evidence ? "Cambiar evidencia" : "Agregar evidencia"}
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Subir archivo de evidencia" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} />
            </label>
            {evidence ? <input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} maxLength={500} className="min-h-12 rounded-2xl border border-line bg-panel px-3 outline-hidden focus:border-volt" placeholder="Nota de evidencia (opcional)" /> : null}
            {formStatus ? <p className={`text-sm font-semibold ${formStatusType === "success" ? "text-mint" : formStatusType === "error" ? "text-orchid" : "text-muted"}`}>{formStatus}</p> : null}
            <Button type="submit" className="w-full" loading={submitting} success={saved} icon={<FileText size={17} />}>
              Guardar registro
            </Button>
          </form>
        </Card>
        ) : null}

        {/*
          ⚠️ Cada registro era su propia tarjeta, y cada tarjeta dibujaba dentro
          un trozo de linea vertical: la linea de tiempo se CORTABA en el hueco
          entre una tarjeta y la siguiente, asi que no unia nada. Ahora es una
          sola tarjeta con sus renglones y la linea la recorre entera, que es lo
          que la hace leerse como una cronologia.

          La fecha pasa a ser el titulo del renglon y la categoria baja a
          etiqueta de texto: eran una insignia y una fecha pequenia peleando por
          el mismo sitio, y lo que se busca al abrir la bitacora es cuando paso.
        */}
        {entries.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title="Sin registros aún" description="Toca el botón de abajo para capturar el primer evento de operación." /></Card>
        ) : (
          <div className="papel-elev relative overflow-hidden rounded-[20px] border border-line bg-card">
            <div className="absolute bottom-6 left-[2.15rem] top-6 w-px bg-line" aria-hidden />
            {entries.map((entry, index) => (
              <div key={entry.id} className={`relative px-4 py-3.5 ${index > 0 ? "border-t border-line" : ""}`}>
                <div className="flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card text-muted">
                    <CalendarClock size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[15px] font-semibold text-ink">
                        {new Date(entry.date).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-muted">{entry.category}</p>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink/80">{entry.description}</p>
                    <p className="mt-1 text-xs text-muted">{userName(entry.authorId)}</p>
                    <ResourceDiscussion target={{ logEntryId: entry.id }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* El boton flotante es la unica puerta al formulario, como en Pendientes. */}
        {!creando ? (
          <FloatingActionButton onClick={() => setCreando(true)} label="Nuevo registro" />
        ) : null}
      </AppFrame>
    </>
  );
}
