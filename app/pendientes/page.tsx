"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, Plus, UserRound } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import type { Pending, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, EmptyState, FloatingActionButton, priorityTone, Skeleton, statusTone } from "@/components/ui";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { DeleteButton, SaveButton } from "@/components/ActionButtons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";

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
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [editId, setEditId] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState("");
  const [formStatusType, setFormStatusType] = useState<"neutral" | "success" | "error">("neutral");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

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
        <BottomNav />
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
  const management = data.pendings.filter((pending) => managers.includes(pending.ownerId) || pending.priority === "critica");
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const isAdvisor = session?.role === "ASESOR";
  const basePendings = isAdvisor && session ? data.pendings.filter((pending) => pending.ownerId === session.id) : data.pendings;
  const visiblePendings = basePendings.filter((pending) => {
    if (filter === "urgentes") return pending.priority === "critica" || pending.priority === "alta";
    if (filter === "hoy") return pending.dueDate.includes("2026-06-05") || pending.status !== "completado";
    return true;
  });

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("OPERACION"); setPriority("MEDIA");
    setOwnerId(""); setDueDate(new Date().toISOString().slice(0, 10)); setEditId(null);
  }

  function editPending(pending: Pending) {
    setEditId(pending.id); setTitle(pending.title); setDescription(pending.description);
    setCategory(pending.category.toUpperCase()); setPriority(pending.priority.toUpperCase());
    setOwnerId(pending.ownerId); setDueDate(pending.dueDate); setFormStatus("");
    document.getElementById("crear-pendiente")?.scrollIntoView({ behavior: "smooth" });
  }

  async function savePending(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    const wasEdit = editId;
    setSubmitting(true);
    setFormStatus("Guardando..."); setFormStatusType("neutral");
    try {
      const response = await fetch(wasEdit ? `/api/pendings/${wasEdit}` : "/api/pendings", {
        method: wasEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, priority, ownerId, dueDate })
      });
      const payload = await response.json() as { pending?: Pending; error?: string };
      if (!response.ok || !payload.pending) { setFormStatusType("error"); setFormStatus(payload.error ?? "No se pudo guardar."); return; }
      setData({ ...data, pendings: wasEdit ? data.pendings.map((item) => item.id === wasEdit ? payload.pending! : item) : [payload.pending, ...data.pendings] });
      setFormStatusType("success"); setFormStatus(wasEdit ? "Pendiente actualizado." : "Pendiente creado.");
      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      setFormStatusType("error"); setFormStatus("No se pudo guardar.");
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
      setFormStatusType("error"); setFormStatus("No se pudo eliminar el pendiente.");
    } finally {
      setDeletingPending(false);
      setDeleteTargetId(null);
    }
  }

  async function changeStatus(id: string, status: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO") {
    if (!data) return;
    const response = await fetch(`/api/pendings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json() as { pending?: Pending; error?: string };
    if (response.ok && payload.pending) setData({ ...data, pendings: data.pendings.map((item) => item.id === id ? payload.pending! : item) });
    else { setFormStatusType("error"); setFormStatus(payload.error ?? "No se pudo cambiar el estado."); }
  }

  return (
    <>
      <AppHeader title="Pendientes" subtitle={isAdvisor ? "Tus pendientes asignados." : "Handover, responsables y fechas limite."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {[
            ["todos", "Todos"],
            ["urgentes", "Urgentes"],
            ["hoy", "Hoy"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black tracking-[-0.01em] transition active:scale-95 ${filter === value ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!isAdvisor ? (
          <Card className="mb-3 border-volt/30 bg-volt/[0.055]">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-volt" size={18} />
              <h2 className="text-lg font-black">Pendientes de gerencia</h2>
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
            <h2 className="mb-4 text-lg font-black">{editId ? "Editar pendiente" : "Crear pendiente"}</h2>
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
              {formStatus ? (
                <p className={`text-sm font-semibold ${formStatusType === "success" ? "text-emerald-600 dark:text-emerald-400" : formStatusType === "error" ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
                  {formStatus}
                </p>
              ) : null}
              <SaveButton type="submit" loading={submitting} success={saved} savedLabel="¡Listo!" className="w-full">
                {editId ? "Guardar cambios" : "Crear pendiente"}
              </SaveButton>
            </form>
          </Card>
        ) : null}

        <div className="space-y-2.5">
          {visiblePendings.map((pending) => (
            <Card key={pending.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black">{pending.title}</h2>
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
                  <button onClick={() => editPending(pending)} className="min-h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-black text-ink">Editar</button>
                  <select aria-label="Cambiar estado" value={pending.status === "en proceso" ? "EN_PROCESO" : pending.status.toUpperCase()} onChange={(event) => void changeStatus(pending.id, event.target.value as "PENDIENTE" | "EN_PROCESO" | "COMPLETADO")} className="min-h-10 rounded-xl border border-line bg-panel px-3 text-sm font-black"><option value="PENDIENTE">Pendiente</option><option value="EN_PROCESO">En proceso</option><option value="COMPLETADO">Cerrar</option></select>
                  <DeleteButton onClick={() => requestDelete(pending.id)} className="w-full">Borrar</DeleteButton>
                </div>
              ) : null}
              <ResourceDiscussion target={{ pendingId: pending.id }} />
            </Card>
          ))}
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
      {!isAdvisor ? <FloatingActionButton href="#crear-pendiente" label="Crear" icon={Plus} /> : null}
      <BottomNav />
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="¿Eliminar pendiente?"
        confirmLabel="Eliminar"
        loading={deletingPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTargetId(null)}
      />
    </>
  );
}

function Info({ label, value, tone, icon }: { label: string; value: string; tone?: Parameters<typeof Badge>[0]["tone"]; icon?: React.ReactNode }) {
  return (
    <div className="border-b border-r border-white/[0.07] px-2 py-2 odd:border-l-0 even:border-r-0">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-ink">
        {icon}
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </div>
    </div>
  );
}
