"use client";

import { useEffect, useState } from "react";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, Search, Sparkles, Trash2, X } from "lucide-react";
import type { CursoDePendiente, Pending } from "@/lib/types";
import { AvanceDeCursos, AvisoCierrePedido, TipoYCursos } from "@/components/pendientes/CursosDelPendiente";
import { Badge, ProfileAvatar, priorityTone, statusTone } from "@/components/ui";
import { AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";
import {
  DeskButton, DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";
import { ShineBorder } from "@/components/magic/ShineBorder";

type Filter = "todos" | "urgentes" | "abiertos";

/** Respuesta de /api/ai/tasks-optimize. Tipada de verdad y no `any`. */
type TaskOptimization = {
  prioritizedTasks: { id: string; justification: string }[];
  duplicates?: { suggestedTitle: string; taskIds: string[] }[];
  suggestions: { taskId: string; recommendedOwnerName: string; reason: string }[];
};

const categoryOptions: SelectOption[] = [
  { value: "OPERACION", label: "Operación" },
  { value: "EQUIPO", label: "Equipo" },
  { value: "COMERCIAL", label: "Comercial" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" }
];
const priorityOptions: SelectOption[] = [
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica" },
  { value: "BAJA", label: "Baja" }
];

const todayKey = () => dashboardDateKey();

export default function EscritorioPendientes() {
  const { data, setData, error, reload } = useDesktopData();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("todos");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OPERACION");
  const [priority, setPriority] = useState("MEDIA");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState(todayKey());
  const [tipo, setTipo] = useState<"PENDIENTE" | "CURSO">("PENDIENTE");
  const [cursos, setCursos] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [optimization, setOptimization] = useState<TaskOptimization | null>(null);
  const [loadingOpt, setLoadingOpt] = useState(false);
  const [showOptModal, setShowOptModal] = useState(false);

  async function fetchTaskOptimization() {
    setLoadingOpt(true);
    try {
      const res = await fetch("/api/ai/tasks-optimize");
      const payload = await res.json() as TaskOptimization & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "No se pudo obtener la optimización.");
      setOptimization(payload);
      setShowOptModal(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al conectar con la optimización IA.", "error");
    } finally {
      setLoadingOpt(false);
    }
  }

  useEffect(() => { if (data && !ownerId) setOwnerId(data.users[0]?.id ?? ""); }, [data, ownerId]);
  useUnsavedGuard(Boolean(title.trim() || description.trim()));

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) {
    return (
      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <DeskSkeleton className="h-120" />
        <div className="space-y-3">
          <DeskSkeleton className="h-9 w-72" />
          {[0, 1, 2, 3].map((i) => <DeskSkeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const userOptions: SelectOption[] = data.users.map((u) => ({
    value: u.id,
    label: u.name,
    description: u.role === "ASESOR" ? "Asesor" : u.role === "GERENTE" ? "Gerente" : "Subgerente",
    photoUrl: u.photoUrl ?? null
  }));
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";

  const visible = data.pendings.filter((p) => {
    if (filter === "urgentes") return p.priority === "critica" || p.priority === "alta";
    if (filter === "abiertos") return p.status !== "completado";
    return true;
  });
  const term = query.trim().toLowerCase();
  const shown = term ? visible.filter((p) => `${p.title} ${p.description} ${userName(p.ownerId)}`.toLowerCase().includes(term)) : visible;

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("OPERACION"); setPriority("MEDIA");
    setOwnerId(data?.users[0]?.id ?? ""); setDueDate(todayKey()); setEditId(null);
    setTipo("PENDIENTE"); setCursos([]);
  }

  function editPending(p: Pending) {
    setEditId(p.id); setTitle(p.title); setDescription(p.description);
    setCategory(p.category.toUpperCase()); setPriority(p.priority.toUpperCase());
    setOwnerId(p.ownerId); setDueDate(p.dueDate);
    setTipo(p.tipo === "curso" ? "CURSO" : "PENDIENTE"); setCursos((p.cursos ?? []).map((c) => c.nombre));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePending(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    const wasEdit = editId;
    setSubmitting(true);
    try {
      const response = await fetch(wasEdit ? `/api/pendings/${wasEdit}` : "/api/pendings", {
        method: wasEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, category, priority, ownerId, dueDate, tipo,
          ...(tipo === "CURSO" ? { cursos: cursos.map((c) => c.trim()).filter(Boolean) } : {})
        })
      });
      const payload = await response.json() as { pending?: Pending; error?: string };
      if (!response.ok || !payload.pending) { toast(payload.error ?? "No se pudo guardar.", "error"); return; }
      const next = payload.pending;
      setData({ ...data, pendings: wasEdit ? data.pendings.map((item) => item.id === wasEdit ? next : item) : [next, ...data.pendings] });
      toast(wasEdit ? "Pendiente actualizado." : "Pendiente creado.", "success");
      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast("No se pudo guardar.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  /** Gerencia marca o desmarca un curso de la matriz a mano. */
  async function marcarCurso(pendingId: string, curso: CursoDePendiente, hecho: boolean) {
    const response = await fetch(`/api/pendings/${pendingId}/cursos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursoId: curso.id, hecho })
    }).catch(() => null);
    const payload = response ? ((await response.json().catch(() => ({}))) as { pending?: Pending; error?: string }) : {};
    if (!response?.ok || !payload.pending) { toast(payload.error ?? "No se pudo marcar.", "error"); return; }
    const next = payload.pending;
    setData((prev) => (prev ? { ...prev, pendings: prev.pendings.map((item) => (item.id === pendingId ? next : item)) } : prev));
  }

  async function changeStatus(id: string, status: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO") {
    if (!data) return;
    const response = await fetch(`/api/pendings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json() as { pending?: Pending; error?: string };
    if (response.ok && payload.pending) {
      const next = payload.pending;
      setData({ ...data, pendings: data.pendings.map((item) => item.id === id ? next : item) });
      if (status === "COMPLETADO") toast("Pendiente cerrado.", "success");
    } else {
      toast(payload.error ?? "No se pudo cambiar el estado.", "error");
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId || !data) return;
    const id = deleteTargetId;
    setDeleting(true);
    const previous = data.pendings;
    setData({ ...data, pendings: data.pendings.filter((item) => item.id !== id) });
    try {
      const response = await fetch(`/api/pendings/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
      toast("Pendiente eliminado.", "success");
    } catch {
      setData({ ...data, pendings: previous });
      toast("No se pudo eliminar el pendiente.", "error");
    } finally {
      setDeleting(false);
      setDeleteTargetId(null);
    }
  }

  const today = todayKey();

  return (
    <>
      {/* Formulario fijo a la izquierda, cola a la derecha. Por debajo de 1280px
          se apilan: un formulario de seis campos en media columna estrecha es
          peor que uno completo arriba. */}
      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <DeskReveal index={0}>
          <div className="xl:sticky xl:top-20">
            <DeskSection title={editId ? "Editar pendiente" : "Nuevo pendiente"}>
              <DeskPanel>
                <form className="grid gap-3" onSubmit={savePending}>
                  <AppInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
                  <AppTextarea label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} required />
                  <TipoYCursos tipo={tipo} onTipo={setTipo} cursos={cursos} onCursos={setCursos} />
                  <div className="grid grid-cols-2 gap-3">
                    <AppSelect label="Categoría" value={category} onChange={setCategory} options={categoryOptions} />
                    <AppSelect label="Prioridad" value={priority} onChange={setPriority} options={priorityOptions} />
                  </div>
                  <AppSelect label="Responsable" value={ownerId} onChange={setOwnerId} options={userOptions} placeholder="Selecciona responsable" />
                  <AppDatePicker label="Fecha límite" value={dueDate} onChange={setDueDate} required />
                  <div className="flex gap-2">
                    {editId ? (
                      <DeskButton type="button" onClick={resetForm} className="flex-1">Cancelar</DeskButton>
                    ) : null}
                    {/* La ÚNICA acción con destello de la pantalla. */}
                    <DeskPrimaryButton type="submit" disabled={submitting} className="flex-1">
                      {submitting ? "Guardando…" : saved ? "¡Listo!" : editId ? "Guardar cambios" : "Crear pendiente"}
                    </DeskPrimaryButton>
                  </div>
                </form>
              </DeskPanel>
            </DeskSection>
          </div>
        </DeskReveal>

        <DeskReveal index={1}>
          <DeskSection title={`Pendientes · ${shown.length}`}>
            {/* Filtros en una sola fila sobre la lista. */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5">
                {([["todos", "Todos"], ["urgentes", "Urgentes"], ["abiertos", "Abiertos"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`min-h-9 rounded-lg px-3.5 text-ui font-medium transition-colors ${
                      filter === value ? "bg-accent text-on-accent" : "border border-line bg-panel text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <DeskButton onClick={() => void fetchTaskOptimization()} disabled={loadingOpt} className="min-h-9">
                <Sparkles size={14} className="text-accent" />
                {loadingOpt ? "Optimizando…" : "Optimizar con IA"}
              </DeskButton>

              <div className="relative ml-auto w-64">
                <label className="sr-only" htmlFor="buscar-pendientes">Buscar pendientes</label>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  id="buscar-pendientes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className={`${deskInput} min-h-9 pl-9`}
                />
              </div>
            </div>

            <div className="mt-4">
              {shown.length === 0 ? (
                <DeskEmpty
                  icon={ClipboardCheck}
                  title={term ? "Sin resultados" : "Sin pendientes"}
                  hint={term ? `Nada coincide con “${query}”.` : "Crea uno con el formulario de la izquierda, o cambia el filtro."}
                />
              ) : (
                <AnimatePresence initial={false}>
                  {shown.map((p) => {
                    const overdue = p.status !== "completado" && p.dueDate < today;
                    const row = (
                      <article className="rounded-xl border border-line bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-ui font-semibold text-ink">{p.title}</h3>
                            <p className="mt-1 text-ui leading-6 text-muted">{p.description}</p>
                            <AvanceDeCursos pending={p} onMarcar={(curso, hecho) => marcarCurso(p.id, curso, hecho)} />
                            <AvisoCierrePedido pending={p} />
                          </div>
                          <Badge tone={priorityTone(p.priority)}>{p.priority}</Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-caption">
                          <span className="flex items-center gap-1.5 text-ink">
                            <ProfileAvatar
                              name={userName(p.ownerId)}
                              photoUrl={data.users.find((u) => u.id === p.ownerId)?.photoUrl}
                              size="sm"
                              className="size-5 rounded-md text-[9px] shadow-none"
                            />
                            {userName(p.ownerId)}
                          </span>
                          <span className="text-muted">{p.category}</span>
                          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                          {/* Lo vencido lleva palabra, no solo color. */}
                          <span className={overdue ? "font-medium text-danger" : "text-muted"}>
                            {overdue ? `Vencido · ${p.dueDate}` : `Vence ${p.dueDate}`}
                          </span>

                          <div className="ml-auto flex items-center gap-2">
                            <DeskButton onClick={() => editPending(p)} className="min-h-8 px-3 text-caption">Editar</DeskButton>
                            <label className="sr-only" htmlFor={`estado-${p.id}`}>Cambiar estado de {p.title}</label>
                            <select
                              id={`estado-${p.id}`}
                              value={p.status === "en proceso" ? "EN_PROCESO" : p.status.toUpperCase()}
                              onChange={(e) => void changeStatus(p.id, e.target.value as "PENDIENTE" | "EN_PROCESO" | "COMPLETADO")}
                              className={`${deskInput} min-h-8 w-auto py-0 text-caption`}
                            >
                              <option value="PENDIENTE">Pendiente</option>
                              <option value="EN_PROCESO">En proceso</option>
                              <option value="COMPLETADO">Cerrar</option>
                            </select>
                            <button
                              onClick={() => setDeleteTargetId(p.id)}
                              aria-label={`Eliminar ${p.title}`}
                              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );

                    return (
                      <motion.div key={p.id} layout exit={{ opacity: 0, scale: 0.96, x: 40 }} className="mb-3">
                        {/* ShineBorder solo en lo VENCIDO: es exactamente "lo que
                            está sin atender", que es para lo que sirve. Si se
                            encendiera en todos, dejaría de señalar nada. */}
                        {overdue ? (
                          <ShineBorder radius="rounded-[14px]" ringPx={1.5} tone="ember">{row}</ShineBorder>
                        ) : row}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </DeskSection>
        </DeskReveal>
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="¿Eliminar pendiente?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Optimización con IA. Antes iba con negros y blancos fijos
          (bg-[#0A0A0A], text-white): en tema claro quedaba ilegible. Ahora usa
          los tokens del escritorio y funciona en los dos temas. */}
      <AnimatePresence>
        {showOptModal && optimization ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            onClick={() => setShowOptModal(false)}
          >
            <motion.div
              role="dialog"
              aria-label="Priorización y handover sugeridos por IA"
              initial={{ scale: 0.97, opacity: 0, y: -8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="desk-floating max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl p-6"
            >
              <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <h3 className="flex items-center gap-2 text-ui font-semibold text-ink">
                  <Sparkles className="text-accent" size={18} />
                  Priorización y handover
                </h3>
                <button
                  onClick={() => setShowOptModal(false)}
                  aria-label="Cerrar"
                  className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mt-4 space-y-5">
                <section>
                  <h4 className="text-caption font-medium text-muted">Prioridades recomendadas</h4>
                  <div className="mt-2 space-y-2">
                    {optimization.prioritizedTasks.map((task) => (
                      <div key={task.id} className="rounded-xl border border-line bg-panel p-3">
                        <p className="text-ui font-medium text-ink">
                          {data.pendings.find((p) => p.id === task.id)?.title ?? "Tarea"}
                        </p>
                        <p className="mt-1 text-caption leading-5 text-muted">{task.justification}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {optimization.duplicates && optimization.duplicates.length > 0 ? (
                  <section>
                    <h4 className="text-caption font-medium text-muted">Duplicados detectados</h4>
                    <div className="mt-2 space-y-2">
                      {optimization.duplicates.map((dup, idx) => (
                        <div key={idx} className="rounded-xl border border-warn/30 bg-warn/[0.07] p-3">
                          <p className="text-ui font-medium text-ink">Fusión sugerida: “{dup.suggestedTitle}”</p>
                          <p className="mt-1 text-caption text-muted">Cubre {dup.taskIds.length} pendientes repetidos.</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section>
                  <h4 className="text-caption font-medium text-muted">Responsables sugeridos</h4>
                  <div className="mt-2 space-y-2">
                    {optimization.suggestions.map((sug) => (
                      <div key={sug.taskId} className="rounded-xl border border-line bg-panel p-3">
                        <p className="text-ui font-medium text-ink">
                          {data.pendings.find((p) => p.id === sug.taskId)?.title ?? "Tarea"}
                        </p>
                        <p className="mt-1 text-caption leading-5 text-muted">
                          Asignar a <strong className="font-medium text-accent">{sug.recommendedOwnerName}</strong> · {sug.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
