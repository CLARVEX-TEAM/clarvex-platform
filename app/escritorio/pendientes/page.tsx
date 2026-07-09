"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ClipboardCheck, Search, Sparkles, Trash2, X } from "lucide-react";
import type { Pending } from "@/lib/types";
import { Badge, Card, EmptyState, ProfileAvatar, priorityTone, statusTone } from "@/components/ui";
import { AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { SendButton } from "@/components/SendButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";

type Filter = "todos" | "urgentes" | "abiertos";

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

export default function EscritorioPendientes() {
  const { data, setData, error, reload } = useDesktopData();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("todos");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OPERACION");
  const [priority, setPriority] = useState("MEDIA");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [optimization, setOptimization] = useState<any | null>(null);
  const [loadingOpt, setLoadingOpt] = useState(false);
  const [showOptModal, setShowOptModal] = useState(false);

  async function fetchTaskOptimization() {
    setLoadingOpt(true);
    try {
      const res = await fetch("/api/ai/tasks-optimize");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "No se pudo obtener la optimización.");
      setOptimization(payload);
      setShowOptModal(true);
    } catch (err: any) {
      toast(err.message || "Error al conectar con la optimización IA.", "error");
    } finally {
      setLoadingOpt(false);
    }
  }

  useEffect(() => { if (data && !ownerId) setOwnerId(data.users[0]?.id ?? ""); }, [data, ownerId]);
  useUnsavedGuard(Boolean(title.trim() || description.trim()));

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) {
    return (
      <div className="grid animate-pulse grid-cols-5 gap-5">
        <div className="col-span-2 h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-3 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div>
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
    setOwnerId(data?.users[0]?.id ?? ""); setDueDate(new Date().toISOString().slice(0, 10)); setEditId(null);
  }

  function editPending(p: Pending) {
    setEditId(p.id); setTitle(p.title); setDescription(p.description);
    setCategory(p.category.toUpperCase()); setPriority(p.priority.toUpperCase());
    setOwnerId(p.ownerId); setDueDate(p.dueDate);
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
        body: JSON.stringify({ title, description, category, priority, ownerId, dueDate })
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

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Crear / editar */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="text-volt" size={18} />
          <h2 className="text-lg font-black text-ink">{editId ? "Editar pendiente" : "Nuevo pendiente"}</h2>
        </div>
        <form className="grid gap-3" onSubmit={savePending}>
          <AppInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <AppTextarea label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <AppSelect label="Categoría" value={category} onChange={setCategory} options={categoryOptions} />
            <AppSelect label="Prioridad" value={priority} onChange={setPriority} options={priorityOptions} />
          </div>
          <AppSelect label="Responsable" value={ownerId} onChange={setOwnerId} options={userOptions} placeholder="Selecciona responsable" />
          <AppDatePicker label="Fecha límite" value={dueDate} onChange={setDueDate} required />
          <div className="flex gap-2">
            {editId ? (
              <button type="button" onClick={resetForm} className="tappable min-h-12 flex-1 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-black text-ink">Cancelar</button>
            ) : null}
            <SendButton type="submit" loading={submitting} success={saved} sentLabel="¡Listo!" className="flex-1">
              {editId ? "Guardar cambios" : "Crear pendiente"}
            </SendButton>
          </div>
        </form>
      </Card>

      {/* Lista */}
      <div className="col-span-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {([["todos", "Todos"], ["urgentes", "Urgentes"], ["abiertos", "Abiertos"]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setFilter(value)} className={`tappable min-h-9 rounded-full px-4 text-[13px] font-bold transition ${filter === value ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink"}`}>{label}</button>
            ))}
          </div>
          <button
            onClick={() => void fetchTaskOptimization()}
            disabled={loadingOpt}
            className="flex min-h-9 items-center justify-center gap-2 rounded-full bg-[#00FF66] px-4 text-[13px] font-black text-black transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {loadingOpt ? "Optimizando..." : "Optimizar con IA"}
          </button>
          <div className="relative ml-auto w-56">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="min-h-9 w-full rounded-full border border-line bg-panel pl-9 pr-3 text-[13px] font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10" />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {shown.map((p) => (
            <motion.div key={p.id} layout exit={{ opacity: 0, scale: 0.96, x: 40 }}>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-ink">{p.title}</h3>
                    <p className="mt-1 text-[13px] leading-5 text-muted">{p.description}</p>
                  </div>
                  <Badge tone={priorityTone(p.priority)}>{p.priority}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line py-2.5 text-[13px]">
                  <span className="flex items-center gap-1.5 text-muted"><span className="font-bold uppercase tracking-[0.08em] text-[11px]">Categoría</span> {p.category}</span>
                  <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Estado</span> <Badge tone={statusTone(p.status)}>{p.status}</Badge></span>
                  <span className="flex items-center gap-1.5 text-ink"><ProfileAvatar name={userName(p.ownerId)} photoUrl={data.users.find((u) => u.id === p.ownerId)?.photoUrl} size="sm" className="size-6 rounded-lg shadow-none" /> {userName(p.ownerId)}</span>
                  <span className="text-muted"><span className="text-[11px] font-bold uppercase tracking-[0.08em]">Vence</span> {p.dueDate}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => editPending(p)} className="tappable min-h-9 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 text-sm font-bold text-ink">Editar</button>
                  <select
                    aria-label="Cambiar estado"
                    value={p.status === "en proceso" ? "EN_PROCESO" : p.status.toUpperCase()}
                    onChange={(e) => void changeStatus(p.id, e.target.value as "PENDIENTE" | "EN_PROCESO" | "COMPLETADO")}
                    className="min-h-9 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-volt/20"
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="EN_PROCESO">En proceso</option>
                    <option value="COMPLETADO">Cerrar</option>
                  </select>
                  <button onClick={() => setDeleteTargetId(p.id)} aria-label="Eliminar" className="tappable ml-auto grid size-9 place-items-center rounded-xl text-muted transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30">
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {shown.length === 0 ? <Card><EmptyState icon={ClipboardCheck} title={term ? "Sin resultados" : "Sin pendientes"} description={term ? `Nada coincide con “${query}”.` : "Cambia el filtro o crea uno nuevo."} /></Card> : null}
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="¿Eliminar pendiente?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Modal Optimización IA */}
      <AnimatePresence>
        {showOptModal && optimization && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl rounded-2xl bg-[#0A0A0A] border border-white/10 p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-[#00FF66]" size={20} />
                  <h3 className="text-sm font-black text-white">Priorización & Handover IA</h3>
                </div>
                <button
                  onClick={() => setShowOptModal(false)}
                  className="rounded-full bg-white/5 p-1.5 text-slate-400 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div>
                  <h4 className="font-bold text-[#00FF66] uppercase tracking-wider text-[10px] mb-1.5">⚡ Prioridades Recomendadas</h4>
                  <div className="space-y-2">
                    {optimization.prioritizedTasks.map((task: any) => {
                      const orig = data.pendings.find((p) => p.id === task.id);
                      return (
                        <div key={task.id} className="rounded-xl bg-white/5 border border-white/5 p-3 space-y-1">
                          <p className="font-black text-white">{orig?.title || "Tarea"}</p>
                          <p className="text-slate-400">{task.justification}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {optimization.duplicates && optimization.duplicates.length > 0 && (
                  <div>
                    <h4 className="font-bold text-yellow-500 uppercase tracking-wider text-[10px] mb-1.5">👯 Tareas Duplicadas Detectadas</h4>
                    <div className="space-y-2">
                      {optimization.duplicates.map((dup: any, idx: number) => (
                        <div key={idx} className="rounded-xl bg-yellow-500/5 border border-yellow-500/10 p-3">
                          <p className="font-black text-white">Fusión sugerida: &quot;{dup.suggestedTitle}&quot;</p>
                          <p className="text-slate-400 mt-1 text-[11px]">Cubre {dup.taskIds.length} pendientes repetidos.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-bold text-blue-400 uppercase tracking-wider text-[10px] mb-1.5">👤 Asignación de Responsables sugerida</h4>
                  <div className="space-y-2">
                    {optimization.suggestions.map((sug: any) => {
                      const orig = data.pendings.find((p) => p.id === sug.taskId);
                      return (
                        <div key={sug.taskId} className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 space-y-1">
                          <p className="font-black text-white">{orig?.title || "Tarea"}</p>
                          <p className="text-slate-400 leading-normal">
                            Asignar a: <strong className="text-blue-400">{sug.recommendedOwnerName}</strong> · {sug.reason}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
