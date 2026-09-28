"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EstadoPendiente } from "@/components/pendientes/EstadoPendiente";
import { AlertTriangle, ClipboardCheck, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { useSession } from "@/lib/use-session";
import { isOpenPending, type Pending, type User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Card, EmptyState, FloatingActionButton, priorityTone, Skeleton, statusTone } from "@/components/ui";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { SaveButton } from "@/components/ActionButtons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { PullToRefresh } from "@/components/PullToRefresh";
import { RippleButton } from "@/components/magic/RippleButton";


/** El filete de color de la izquierda, por prioridad. */
function filetePrioridad(prioridad: string): string {
  const p = prioridad.toLowerCase();
  if (p.startsWith("crit")) return "bg-orchid";
  if (p.startsWith("alta")) return "bg-ember";
  if (p.startsWith("baja")) return "bg-line";
  return "bg-volt";
}

/**
 * La fecha límite, dicha como la diría una persona.
 *
 * ⚠️ `2026-08-02` obliga a hacer la cuenta mentalmente para saber si eso es
 * tarde. «Vencida hace 56 días» no.
 */
function vencimiento(limite: string, hoy: string): { texto: string; clase: string } {
  if (!limite) return { texto: "sin fecha", clase: "" };
  const dias = Math.round(
    (Date.parse(limite + "T12:00:00Z") - Date.parse(hoy + "T12:00:00Z")) / 86400000
  );
  if (!Number.isFinite(dias)) return { texto: limite, clase: "" };
  if (dias < 0) return { texto: `vencida hace ${-dias} ${-dias === 1 ? "día" : "días"}`, clase: "font-semibold text-orchid" };
  if (dias === 0) return { texto: "vence hoy", clase: "font-semibold text-ember" };
  if (dias === 1) return { texto: "vence mañana", clase: "font-medium text-ink/70" };
  return { texto: `vence en ${dias} días`, clase: "" };
}


type Filter = "todos" | "urgentes" | "hoy";

export default function PendientesPage() {
  const { session } = useSession();
  const [data, setData] = useState<AppData | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  /*
   * ⚠️ El formulario de crear nace CERRADO, y ese es el cambio que importa de
   * esta pantalla. Antes se pintaba siempre y ocupaba media pantalla encima de
   * la lista: uno entra a ver QUÉ HAY PENDIENTE y lo primero que veía era un
   * formulario vacío. Además había dos puertas para lo mismo --el formulario
   * abierto y el botón flotante, que solo era un ancla hacia él--.
   */
  const [creando, setCreando] = useState(false);
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
  /*
   * Las tres cifras del encabezado. Salen de lo que ya está cargado: ni una
   * petición más por enseñarlas.
   *
   * ⚠️ Usan `isOpenPending`, el mismo criterio que la lista y que el filtro
   * «Hoy». Escribir aquí otra versión de «qué cuenta como abierto» es cómo el
   * resumen acaba diciendo cinco mientras debajo se ven seis.
   */
  const abiertos = basePendings.filter(isOpenPending).length;
  const criticos = basePendings.filter((pending) => isOpenPending(pending) && pending.priority === "critica").length;
  const venceHoy = basePendings.filter((pending) => isOpenPending(pending) && pending.dueDate === todayKey).length;

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
        {/*
          Lo primero: en qué estado está la cosa, en una línea.

          ⚠️ No lleva el bloque de degradado. Ese está reservado para las
          pantallas de UNA cifra --Conteos, Checklist, Mi día--; repetido en
          todas dejaría de señalar cuál manda. Aquí lo que se viene a ver es la
          LISTA, así que el resumen ocupa un renglón y cede el sitio.
        */}
        <div className="mb-4 flex items-end justify-between gap-3 px-1">
          <div className="flex items-baseline gap-5">
            <div>
              <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{abiertos}</div>
              <div className="text-xs text-muted">abiertos</div>
            </div>
            {criticos > 0 ? (
              <div>
                <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-orchid">{criticos}</div>
                <div className="text-xs text-muted">críticos</div>
              </div>
            ) : null}
            {venceHoy > 0 ? (
              <div>
                <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{venceHoy}</div>
                <div className="text-xs text-muted">vencen hoy</div>
              </div>
            ) : null}
          </div>
        </div>
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
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-semibold tracking-[-0.01em] transition active:scale-95 ${filter === value ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235/0.2)]" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!isAdvisor ? (
          <Card className="mb-3 border-volt/30 bg-volt/5.5">
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

        {!isAdvisor && (creando || editId) ? (
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
            <Card key={pending.id} layout exit={{ opacity: 0, scale: 0.9, x: 60 }} className="relative overflow-hidden !p-0">
              {/*
                ⚠️ Un FILETE de color a la izquierda, por prioridad.

                Antes la prioridad era una insignia arriba a la derecha, al
                final del título. Con ocho pendientes en pantalla, para saber
                cuál urge había que leer ocho veces hasta la esquina. El filete
                se ve sin leer, y --esto importa-- la palabra sigue estando
                abajo: el color NUNCA lo dice solo.
              */}
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${filetePrioridad(pending.priority)}`} />

              <div className="py-4 pl-6 pr-4">
                <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">{pending.title}</h2>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{pending.description}</p>

                {/*
                  Una sola línea de contexto, en vez de una rejilla de cuatro
                  campos con sus rótulos. «CATEGORIA / ESTADO / RESPONSABLE /
                  LIMITE» era un formulario de solo lectura: ocupaba más que el
                  pendiente en sí.
                */}
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="font-medium text-ink/70">{pending.priority}</span>
                  <span aria-hidden>·</span>
                  <span>{userName(pending.ownerId)}</span>
                  <span aria-hidden>·</span>
                  <span className={vencimiento(pending.dueDate, todayKey).clase}>
                    {vencimiento(pending.dueDate, todayKey).texto}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="lowercase">{pending.category}</span>
                </div>
              </div>


              {!isAdvisor ? (
                <div className="border-t border-line px-6 py-3">
                  {/*
                    ⚠️ El estado, en TRES pastillas en vez de un `<select>`.

                    El desplegable nativo escondía el estado detrás de un toque,
                    pintaba el menú del sistema --que no se parece a nada de la
                    app-- y hacía falta leerlo para saber en qué punto estaba el
                    pendiente. Aquí el estado se VE, y cambiarlo es un toque en
                    vez de tres.
                  */}
                  <EstadoPendiente
                    id={pending.id}
                    estado={pending.status}
                    onCambiar={(valor) => void changeStatus(pending.id, valor)}
                  />

                  {/* Editar y borrar bajan a iconos: se tocan una vez cada
                      muchas, y ocupaban un tercio de la tarjeta cada uno. */}
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => editPending(pending)}
                      aria-label="Editar pendiente"
                      className="tappable grid size-11 place-items-center rounded-xl text-muted transition hover:text-ink"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(pending.id)}
                      aria-label="Borrar pendiente"
                      className="tappable grid size-11 place-items-center rounded-xl text-muted transition hover:text-orchid"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="px-6 pb-3">
                <ResourceDiscussion target={{ pendingId: pending.id }} />
              </div>
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
      {!isAdvisor && !creando && !editId ? <FloatingActionButton onClick={() => setCreando(true)} label="Crear pendiente" icon={Plus} /> : null}
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-lg papel-elev-alta rounded-t-[26px] bg-card border border-line p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-volt" size={20} />
                  <h3 className="text-sm font-semibold text-ink">Priorización & Handover IA</h3>
                </div>
                <button
                  onClick={() => setShowOptModal(false)}
                  className="rounded-full bg-panel p-1.5 text-muted hover:text-ink transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-muted leading-relaxed">
                <div>
                  <h4 className="font-bold text-volt uppercase tracking-wider text-[10px] mb-1.5">⚡ Prioridades Recomendadas</h4>
                  <div className="space-y-2">
                    {optimization.prioritizedTasks.map((task: any) => {
                      const orig = data.pendings.find((p) => p.id === task.id);
                      return (
                        <div key={task.id} className="rounded-xl bg-white/5 border border-line p-3 space-y-1">
                          <p className="font-semibold text-ink">{orig?.title || "Tarea"}</p>
                          <p className="text-muted">{task.justification}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {optimization.duplicates && optimization.duplicates.length > 0 && (
                  <div>
                    <h4 className="font-bold text-ember uppercase tracking-wider text-[10px] mb-1.5">👯 Tareas Duplicadas Detectadas</h4>
                    <div className="space-y-2">
                      {optimization.duplicates.map((dup: any, idx: number) => (
                        <div key={idx} className="rounded-xl bg-ember/5 border border-ember/30 p-3">
                          <p className="font-semibold text-ink">Fusión sugerida: &quot;{dup.suggestedTitle}&quot;</p>
                          <p className="text-muted mt-1 text-[11px]">Cubre {dup.taskIds.length} pendientes repetidos.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-bold text-volt uppercase tracking-wider text-[10px] mb-1.5">👤 Asignación de Responsables sugerida</h4>
                  <div className="space-y-2">
                    {optimization.suggestions.map((sug: any) => {
                      const orig = data.pendings.find((p) => p.id === sug.taskId);
                      return (
                        <div key={sug.taskId} className="rounded-xl bg-volt/5 border border-volt/30 p-3 space-y-1">
                          <p className="font-semibold text-ink">{orig?.title || "Tarea"}</p>
                          <p className="text-muted leading-normal">
                            Asignar a: <strong className="text-volt">{sug.recommendedOwnerName}</strong> · {sug.reason}
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
