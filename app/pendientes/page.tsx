"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ClipboardCheck, Plus, Sparkles, UserRound, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isOpenPending, type Pending, type User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Card, EmptyState, FloatingActionButton, priorityTone, Skeleton, statusTone } from "@/components/ui";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { DeleteButton, SaveButton } from "@/components/ActionButtons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { PullToRefresh } from "@/components/PullToRefresh";
import { RippleButton } from "@/components/magic/RippleButton";

type Filter = "todos" | "urgentes" | "hoy";

export default function PendientesPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OPERACION");
  const [priority, setPriority] = useState("MEDIA");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState(dashboardDateKey());
  const [editId, setEditId] = useState<string | null>(null);
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);
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

  const load = useCallback(() => fetchAppData().then(setData).catch(() => setData(null)), []);

  useEffect(() => {
    getSession().then(setSession);
    void load();
  }, [load]);

  if (!data) {
    return (
      <>
        <AppHeader title="Pendientes" subtitle="Cargando handover desde PostgreSQL." backHref="/manager" />
        <AppFrame>
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-full" />
            <Skeleton className="h-40 rounded-[28px]" />
            <Skeleton className="h-32 rounded-[28px]" />
            <Skeleton className="h-32 rounded-[28px]" />
          </div>
        </AppFrame>
      </>
    );
  }

  const categoryOptions: SelectOption[] = [
    { value: "OPERACION", label: "Operación" },
    { value: "EQUIPO", label: "Equipo" },
    { value: "COMERCIAL", label: "Comercial" },
    { value: "CLIENTE", label: "Cliente" },
    { value: "INVENTARIO", label: "Inventario" },
    { value: "MANTENIMIENTO", label: "Mantenimiento" },
  ];
  const priorityOptions: SelectOption[] = [
    { value: "MEDIA", label: "Media" },
    { value: "ALTA", label: "Alta" },
    { value: "CRITICA", label: "Crítica" },
    { value: "BAJA", label: "Baja" },
  ];
  const userOptions: SelectOption[] = data.users.map((u) => ({
    value: u.id,
    label: u.name,
    description: u.role === "ASESOR" ? "Asesor" : u.role === "GERENTE" ? "Gerente" : "Subgerente",
    photoUrl: u.photoUrl ?? null,
  }));

  const managers = data.users.filter((user) => user.role === "GERENTE" || user.role === "SUBGERENTE").map((user) => user.id);
  // isOpenPending: sin filtrar por estado, un pendiente ya cerrado seguía
  // apareciendo en la tarjeta de gerencia. La lista completa de abajo sí
  // muestra los completados a propósito, pero este resumen es de lo que queda
  // por hacer.
  const management = data.pendings.filter((pending) =>
    isOpenPending(pending) && (managers.includes(pending.ownerId) || pending.priority === "critica")
  );
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const isAdvisor = session?.role === "ASESOR";
  const basePendings = isAdvisor && session ? data.pendings.filter((pending) => pending.ownerId === session.id) : data.pendings;
  // El filtro "Hoy" traía una fecha FIJA de junio ("2026-06-05") con un OR que
  // dejaba pasar todo lo no completado: la pestaña nunca mostró los de hoy.
  const todayKey = dashboardDateKey();
  const visiblePendings = basePendings.filter((pending) => {
    if (filter === "urgentes") return pending.priority === "critica" || pending.priority === "alta";
    if (filter === "hoy") return isOpenPending(pending) && pending.dueDate === todayKey;
    return true;
  });

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("OPERACION"); setPriority("MEDIA");
    setOwnerId(""); setDueDate(dashboardDateKey()); setEditId(null);
  }

  function editPending(pending: Pending) {
    setEditId(pending.id); setTitle(pending.title); setDescription(pending.description);
    setCategory(pending.category.toUpperCase()); setPriority(pending.priority.toUpperCase());
    setOwnerId(pending.ownerId); setDueDate(pending.dueDate);
    document.getElementById("crear-pendiente")?.scrollIntoView({ behavior: "smooth" });
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
      setData({ ...data, pendings: wasEdit ? data.pendings.map((item) => item.id === wasEdit ? payload.pending! : item) : [payload.pending, ...data.pendings] });
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

  function requestDelete(id: string) { setDeleteTargetId(id); }

  async function confirmDelete() {
    if (!deleteTargetId || !data) return;
    const id = deleteTargetId;
    setDeletingPending(true);
    const previous = data.pendings;
    setData({ ...data, pendings: data.pendings.filter((item) => item.id !== id) });
    try {
      const response = await fetch(`/api/pendings/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
    } catch {
      setData({ ...data, pendings: previous });
      toast("No se pudo eliminar el pendiente.", "error");
    } finally {
      setDeletingPending(false);
      setDeleteTargetId(null);
    }
  }

  async function changeStatus(id: string, status: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO") {
    if (!data) return;
    const response = await fetch(`/api/pendings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json() as { pending?: Pending; error?: string };
    if (response.ok && payload.pending) {
      setData({ ...data, pendings: data.pendings.map((item) => item.id === id ? payload.pending! : item) });
      if (status === "COMPLETADO") toast("Pendiente cerrado.", "success");
    } else {
      toast(payload.error ?? "No se pudo cambiar el estado.", "error");
    }
  }

  return (
    <>
      <AppHeader title="Pendientes" subtitle={isAdvisor ? "Tus pendientes asignados." : "Handover, responsables y fechas limite."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <PullToRefresh onRefresh={load}>
      <AppFrame>
        {!isAdvisor && (
          <RippleButton
            onClick={() => void fetchTaskOptimization()}
            disabled={loadingOpt}
            className="mb-3 w-full flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-card text-sm font-semibold text-ink/80 transition hover:border-volt active:scale-95 disabled:opacity-50"
          >
            <Sparkles size={16} className="text-volt" />
            {loadingOpt ? "Optimizando Handover..." : "Optimizar Pendientes con IA"}
          </RippleButton>
        )}

        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {[
            ["todos", "Todos"],
            ["urgentes", "Urgentes"],
            ["hoy", "Hoy"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-semibold tracking-[-0.01em] transition active:scale-95 ${filter === value ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!isAdvisor ? (
          <Card className="mb-3 border-volt/30 bg-volt/[0.055]">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-volt" size={18} />
              <h2 className="text-lg font-semibold">Pendientes de gerencia</h2>
            </div>
            <div className="divide-y divide-white/[0.07]">
              {management.slice(0, 3).map((pending) => (
                <div key={pending.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{pending.title}</p>
                    <Badge tone={priorityTone(pending.priority)}>{pending.priority}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{pending.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {!isAdvisor ? (
          <Card className="mb-3" id="crear-pendiente">
            <h2 className="mb-4 text-lg font-semibold">{editId ? "Editar pendiente" : "Crear pendiente"}</h2>
            <form className="grid gap-3" onSubmit={savePending}>
              <AppInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <AppTextarea label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <AppSelect
                  label="Categoría"
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                />
                <AppSelect
                  label="Prioridad"
                  value={priority}
                  onChange={setPriority}
                  options={priorityOptions}
                />
              </div>
              <AppSelect
                label="Responsable"
                value={ownerId}
                onChange={setOwnerId}
                options={userOptions}
                placeholder="Selecciona responsable"
              />
              <AppDatePicker label="Fecha límite" value={dueDate} onChange={setDueDate} required />
              <SaveButton type="submit" loading={submitting} success={saved} savedLabel="¡Listo!" className="w-full" shimmer>
                {editId ? "Guardar cambios" : "Crear pendiente"}
              </SaveButton>
            </form>
          </Card>
        ) : null}

        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
          {visiblePendings.map((pending) => (
            <Card key={pending.id} layout exit={{ opacity: 0, scale: 0.9, x: 60 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{pending.title}</h2>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{pending.description}</p>
                </div>
                <Badge tone={priorityTone(pending.priority)}>{pending.priority}</Badge>
              </div>
              <div className="mt-2.5 grid grid-cols-2 border-y border-white/[0.07]">
                <Info label="Categoria" value={pending.category} />
                <Info label="Estado" value={pending.status} tone={statusTone(pending.status)} />
                <Info label="Responsable" value={userName(pending.ownerId)} icon={<UserRound size={14} />} />
                <Info label="Limite" value={pending.dueDate} />
              </div>
              {!isAdvisor ? (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <button onClick={() => editPending(pending)} className="min-h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-semibold text-ink">Editar</button>
                  <select aria-label="Cambiar estado" value={pending.status === "en proceso" ? "EN_PROCESO" : pending.status.toUpperCase()} onChange={(event) => void changeStatus(pending.id, event.target.value as "PENDIENTE" | "EN_PROCESO" | "COMPLETADO")} className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-semibold"><option value="PENDIENTE">Pendiente</option><option value="EN_PROCESO">En proceso</option><option value="COMPLETADO">Cerrar</option></select>
                  <DeleteButton onClick={() => requestDelete(pending.id)} className="w-full">Borrar</DeleteButton>
                </div>
              ) : null}
              <ResourceDiscussion target={{ pendingId: pending.id }} />
            </Card>
          ))}
          </AnimatePresence>
          {visiblePendings.length === 0 ? (
            <Card>
              <EmptyState
                icon={ClipboardCheck}
                title="Sin pendientes"
                description="Cambia el filtro o espera nuevas asignaciones."
              />
            </Card>
          ) : null}
        </div>
      </AppFrame>
      </PullToRefresh>
      {!isAdvisor ? <FloatingActionButton href="#crear-pendiente" label="Crear" icon={Plus} /> : null}
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="¿Eliminar pendiente?"
        confirmLabel="Eliminar"
        loading={deletingPending}
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-lg rounded-t-[32px] bg-[#0A0A0A] border border-white/10 p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-[#2563EB]" size={20} />
                  <h3 className="text-sm font-semibold text-white">Priorización & Handover IA</h3>
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
                  <h4 className="font-bold text-[#2563EB] uppercase tracking-wider text-[10px] mb-1.5">⚡ Prioridades Recomendadas</h4>
                  <div className="space-y-2">
                    {optimization.prioritizedTasks.map((task: any) => {
                      const orig = data.pendings.find((p) => p.id === task.id);
                      return (
                        <div key={task.id} className="rounded-xl bg-white/5 border border-white/5 p-3 space-y-1">
                          <p className="font-semibold text-white">{orig?.title || "Tarea"}</p>
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
                          <p className="font-semibold text-white">Fusión sugerida: &quot;{dup.suggestedTitle}&quot;</p>
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
                          <p className="font-semibold text-white">{orig?.title || "Tarea"}</p>
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
    </>
  );
}

function Info({ label, value, tone, icon }: { label: string; value: string; tone?: Parameters<typeof Badge>[0]["tone"]; icon?: React.ReactNode }) {
  return (
    <div className="border-b border-r border-white/[0.07] px-2 py-2 odd:border-l-0 even:border-r-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-ink">
        {icon}
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </div>
    </div>
  );
}
