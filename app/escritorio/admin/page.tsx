"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ChevronDown, KeyRound, Percent, ScrollText, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DeskButton, DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskRule,
  DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

type CommissionRuleRow = {
  id: string;
  role: "GERENTE" | "SUBGERENTE" | "ASESOR";
  minAchievement: number;
  maxAchievement: number | null;
  commissionPercent: number;
};

type AuditEntry = {
  id: string;
  createdAt: string;
  storeName: string | null;
  actorName: string;
  action: string;
  detail: string | null;
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "store.create": "Tienda creada",
  "user.create": "Alta de usuario",
  "commission.update": "Comisiones",
  "billing.update": "Cobro",
  "target.update": "Meta interna",
  "user.role": "Cambio de rol",
  "user.delete": "Cuenta eliminada",
  "user.pin_reset_link": "Enlace de PIN emitido"
};

type StoreRow = {
  id: string;
  name: string;
  createdAt: string;
  totalUsers: number;
  activeUsers: number;
  members: Array<{ id: string; name: string; employeeNumber: string; role: "GERENTE" | "SUBGERENTE" | "ASESOR"; active: boolean }>;
  dataSources: number;
  billingExempt: boolean;
  subscriptionPaidUntil: string | null;
  pricePerUserMxn: number | null;
  weekSales: number;
  weekGoal: number;
  lastSyncAt: string | null;
  lastSyncStatus: "SUCCESS" | "ERROR" | "RUNNING" | null;
  commissionRules: CommissionRuleRow[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** El mapa ya armado. Llega firmado: el bucket de R2 es privado. */
  mapaUrl: string | null;
};

function syncBadge(store: StoreRow): { label: string; ok: boolean } {
  if (!store.lastSyncAt) return { label: "Sin sync", ok: false };
  const hours = Math.floor((Date.now() - new Date(store.lastSyncAt).getTime()) / 3_600_000);
  const ago = hours < 1 ? "hace <1 h" : hours < 48 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
  if (store.lastSyncStatus === "ERROR") return { label: `Sync con error (${ago})`, ok: false };
  return { label: `Sync ${ago}`, ok: hours <= 26 };
}

function billingStatus(store: StoreRow): { label: string; tone: "ok" | "warn" | "bad" } {
  if (store.billingExempt) return { label: "Exenta", tone: "ok" };
  if (!store.subscriptionPaidUntil) return { label: "Sin pago", tone: "bad" };
  const paidUntil = new Date(`${store.subscriptionPaidUntil}T23:59:59Z`).getTime();
  if (paidUntil < Date.now()) return { label: "Vencida", tone: "bad" };
  const daysLeft = Math.ceil((paidUntil - Date.now()) / 86_400_000);
  return daysLeft <= 7 ? { label: `Vence en ${daysLeft} d`, tone: "warn" } : { label: "Al corriente", tone: "ok" };
}

const BRACKET_ROLES = ["GERENTE", "SUBGERENTE", "ASESOR"] as const;
const BRACKET_MINS = [0, 100, 115] as const;
const BRACKET_LABELS: Record<number, string> = { 0: "≤ 99.99%", 100: "100–114.99%", 115: "≥ 115%" };
const ROLE_LABELS: Record<(typeof BRACKET_ROLES)[number], string> = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" };

export default function EscritorioAdmin() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState("");
  const [storeName, setStoreName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerNumber, setManagerNumber] = useState("");
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingCommissions, setSavingCommissions] = useState(false);
  const [savedStoreId, setSavedStoreId] = useState<string | null>(null);
  const [billingExempt, setBillingExempt] = useState(true);
  const [paidUntil, setPaidUntil] = useState("");
  const [priceMxn, setPriceMxn] = useState("");
  const [savingBilling, setSavingBilling] = useState(false);
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [savingUbicacion, setSavingUbicacion] = useState(false);
  /**
   * ⚠️ El aviso del mapa va SEPARADO del error.
   *
   * Que OpenStreetMap no conteste no significa que la dirección no se haya
   * guardado: se guarda igual y solo se queda sin imagen. Metiéndolo en `error`
   * parecería que no se guardó nada y alguien volvería a teclearlo todo.
   */
  const [avisoMapa, setAvisoMapa] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[] | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [pinLinkUserId, setPinLinkUserId] = useState<string | null>(null);
  // El enlace vive SOLO en memoria y se borra al cerrar la tienda o recargar:
  // vale por sí solo para fijar el PIN, así que no debe quedarse en pantalla.
  const [pinLink, setPinLink] = useState<{ userId: string; url: string; minutes: number } | null>(null);
  const [pinLinkCopied, setPinLinkCopied] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  async function toggleAudit() {
    const next = !showAudit;
    setShowAudit(next);
    if (next && auditEntries === null) {
      try {
        const response = await fetch("/api/admin/audit", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json() as { entries: AuditEntry[] };
        setAuditEntries(payload.entries);
      } catch {
        setAuditEntries([]);
      }
    }
  }

  useEffect(() => {
    getSession().then((current) => {
      if (!current) { router.replace("/login"); return; }
      if (!current.platformAdmin) { router.replace(current.role === "ASESOR" ? "/advisor" : "/escritorio"); return; }
      void loadStores();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadStores() {
    try {
      const response = await fetch("/api/admin/stores", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { stores: StoreRow[] };
      setStores(data.stores);
    } catch {
      setError("No se pudieron cargar las tiendas.");
    } finally {
      setLoading(false);
    }
  }

  async function createStore(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setCreated("");
    try {
      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName, manager: { name: managerName, employeeNumber: managerNumber } })
      });
      const payload = await response.json() as { store?: { name: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la tienda.");
      setCreated(`Tienda “${payload.store?.name}” creada. ${managerName} puede iniciar sesión con su número de empleado y crear su PIN.`);
      setStoreName("");
      setManagerName("");
      setManagerNumber("");
      await loadStores();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear la tienda.");
    } finally {
      setCreating(false);
    }
  }

  function toggleCommissions(store: StoreRow) {
    if (expandedStoreId === store.id) { setExpandedStoreId(null); return; }
    const next: Record<string, string> = {};
    for (const rule of store.commissionRules) next[`${rule.role}:${rule.minAchievement}`] = String(rule.commissionPercent);
    setDraft(next);
    setBillingExempt(store.billingExempt);
    setPaidUntil(store.subscriptionPaidUntil ?? "");
    setPriceMxn(store.pricePerUserMxn !== null ? String(store.pricePerUserMxn) : "");
    setAddress(store.address ?? "");
    setLat(store.latitude !== null ? String(store.latitude) : "");
    setLng(store.longitude !== null ? String(store.longitude) : "");
    setAvisoMapa("");
    setSavedStoreId(null);
    setExpandedStoreId(store.id);
  }

  async function saveUbicacion(store: StoreRow) {
    setSavingUbicacion(true);
    setError("");
    setAvisoMapa("");
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/ubicacion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim() || null,
          // Vacío es `null`, no cero: un cero se guardaría como una coordenada
          // del golfo de Guinea, que es válida y está mal.
          latitude: lat.trim() ? Number(lat) : null,
          longitude: lng.trim() ? Number(lng) : null
        })
      });
      const payload = await response.json() as { error?: string; avisoMapa?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la ubicación.");
      if (payload.avisoMapa) setAvisoMapa(payload.avisoMapa);
      await loadStores();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la ubicación.");
    } finally {
      setSavingUbicacion(false);
    }
  }

  async function changeRole(store: StoreRow, userId: string, role: "GERENTE" | "SUBGERENTE" | "ASESOR") {
    setError("");
    setSavingRoleId(userId);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cambiar el rol.");
      await loadStores();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "No se pudo cambiar el rol.");
    } finally {
      setSavingRoleId(null);
    }
  }

  /**
   * Emite el enlace con el que esa persona fija su PROPIO PIN.
   *
   * Es la salida al bloqueo circular de una tienda nueva: su gerente no tiene
   * PIN y `employee-login` solo deja crear uno con una sesión de gerencia de esa
   * misma tienda ya iniciada, que en una tienda recién creada no existe.
   */
  async function issuePinLink(store: StoreRow, userId: string) {
    setError("");
    setPinLink(null);
    setPinLinkCopied(false);
    setPinLinkUserId(userId);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/users/${userId}/pin-reset`, { method: "POST" });
      const payload = await response.json() as { url?: string; expiresInMinutes?: number; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "No se pudo generar el enlace.");
      setPinLink({ userId, url: payload.url, minutes: payload.expiresInMinutes ?? 0 });
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "No se pudo generar el enlace.");
    } finally {
      setPinLinkUserId(null);
    }
  }

  async function copyPinLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setPinLinkCopied(true);
    } catch {
      // Sin permiso de portapapeles el enlace sigue visible y seleccionable a
      // mano: no vale la pena interrumpir con un error por esto.
      setPinLinkCopied(false);
    }
  }

  async function deleteMember(store: StoreRow, userId: string, name: string) {
    if (!window.confirm(`¿Eliminar definitivamente a ${name}? Esta acción no se puede deshacer.`)) return;
    setError("");
    setDeletingUserId(userId);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/users/${userId}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo eliminar la cuenta.");
      await loadStores();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la cuenta.");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function saveBilling(store: StoreRow) {
    setSavingBilling(true);
    setError("");
    setSavedStoreId(null);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/billing`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingExempt, subscriptionPaidUntil: paidUntil || null, pricePerUserMxn: priceMxn ? Number(priceMxn) : null })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la suscripción.");
      setSavedStoreId(store.id);
      await loadStores();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la suscripción.");
    } finally {
      setSavingBilling(false);
    }
  }

  async function saveCommissions(store: StoreRow) {
    setSavingCommissions(true);
    setError("");
    setSavedStoreId(null);
    try {
      const rules = BRACKET_ROLES.flatMap((role) => BRACKET_MINS.map((min) => ({
        role, minAchievement: min, commissionPercent: Number(draft[`${role}:${min}`])
      })));
      if (rules.some((rule) => !Number.isFinite(rule.commissionPercent) || rule.commissionPercent < 0 || rule.commissionPercent > 100)) {
        throw new Error("Todos los porcentajes deben ser números entre 0 y 100.");
      }
      const response = await fetch(`/api/admin/stores/${store.id}/commissions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron guardar las comisiones.");
      setSavedStoreId(store.id);
      await loadStores();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar las comisiones.");
    } finally {
      setSavingCommissions(false);
    }
  }

  const totalSales = stores.reduce((total, store) => total + store.weekSales, 0);
  const totalGoal = stores.reduce((total, store) => total + store.weekGoal, 0);
  const totalActive = stores.reduce((total, store) => total + store.activeUsers, 0);

  return (
    <div className="space-y-9">
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-ui text-danger">{error}</p>
      ) : null}
      {created ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-ok/30 bg-ok/8 px-4 py-3 text-ui text-ok">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />{created}
        </p>
      ) : null}

      {/* Franja partida: la venta agregada de la plataforma y su volumen. */}
      <DeskReveal index={0} className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 className="text-ui font-medium text-muted">Venta de la semana · todas las tiendas</h2>
          <p className="mt-2 text-metric font-semibold text-ink">{loading ? "—" : money(totalSales)}</p>
          {totalGoal > 0 ? (
            <p className="mt-2 text-ui text-ink-2">
              <span className={cn("font-semibold", totalSales >= totalGoal ? "text-ok" : "text-ink")}>
                {Math.round((totalSales / totalGoal) * 100)}%
              </span>
              {" de "}{money(totalGoal)}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-3 gap-4 lg:border-l lg:border-line lg:pl-12">
          <div>
            <dt className="text-caption text-muted">Tiendas</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{stores.length || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Usuarios activos</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{totalActive || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Con cobro vencido</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">
              {loading ? "—" : stores.filter((s) => billingStatus(s).tone === "bad").length}
            </dd>
          </div>
        </dl>
      </DeskReveal>

      <DeskRule />

      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Nueva tienda */}
        <DeskReveal index={1}>
          <div className="xl:sticky xl:top-20">
            <DeskSection title="Nueva tienda" hint="Al crearla, el gerente entra con su número de empleado y define su PIN.">
              <DeskPanel>
                <form onSubmit={(event) => void createStore(event)} className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-caption font-medium text-muted">Nombre de la tienda</span>
                    <input value={storeName} onChange={(event) => setStoreName(event.target.value)} required minLength={2} maxLength={80} placeholder="MARCA · Centro Comercial" className={deskInput} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-caption font-medium text-muted">Nombre del gerente</span>
                    <input value={managerName} onChange={(event) => setManagerName(event.target.value)} required minLength={2} maxLength={120} placeholder="Nombre completo" className={deskInput} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-caption font-medium text-muted">Número de empleado</span>
                    <input value={managerNumber} onChange={(event) => setManagerNumber(event.target.value.replace(/\D/g, ""))} required inputMode="numeric" pattern="\d{1,30}" placeholder="102259" className={deskInput} />
                  </label>
                  <DeskPrimaryButton type="submit" disabled={creating} className="w-full">
                    {creating ? "Creando…" : "Crear tienda"}
                  </DeskPrimaryButton>
                </form>
              </DeskPanel>
            </DeskSection>
          </div>
        </DeskReveal>

        {/* Tiendas */}
        <DeskReveal index={2}>
          <div className="space-y-8">
            <DeskSection title={`Tiendas · ${stores.length}`}>
              {loading ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-24" />)}</div>
              ) : stores.length === 0 ? (
                <DeskEmpty icon={Building2} title="Sin tiendas todavía" hint="Crea la primera desde el panel de la izquierda." />
              ) : (
                <div className="space-y-3">
                  {stores.map((store) => {
                    const billing = billingStatus(store);
                    const sync = syncBadge(store);
                    const open = expandedStoreId === store.id;
                    return (
                      <article key={store.id} className="rounded-xl border border-line bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted">
                              <Building2 size={17} />
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-ui font-semibold text-ink">{store.name}</h3>
                              <p className="text-caption text-muted">
                                {store.activeUsers} activos de {store.totalUsers} · {store.dataSources} fuentes
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ui tabular-nums text-ink">
                              {money(store.weekSales)}
                              {store.weekGoal > 0 ? <span className="ml-1.5 text-caption text-muted">{Math.round((store.weekSales / store.weekGoal) * 100)}%</span> : null}
                            </span>
                            <StateChip label={billing.label} tone={billing.tone} />
                            <StateChip label={sync.label} tone={sync.ok ? "ok" : "warn"} />
                            <DeskButton onClick={() => toggleCommissions(store)} aria-expanded={open} className="min-h-9 px-3 text-caption">
                              <Percent size={13} /> Ajustes
                              <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
                            </DeskButton>
                          </div>
                        </div>

                        {open ? (
                          <div className="mt-4 grid gap-6 border-t border-line pt-4 2xl:grid-cols-2">
                            {/* Equipo */}
                            <section>
                              <h4 className="text-caption font-medium text-muted">Equipo y roles</h4>
                              {store.members.length === 0 ? (
                                <p className="mt-2 text-caption text-muted">Sin miembros activos todavía.</p>
                              ) : (
                                <ul className="mt-2">
                                  {store.members.map((member) => (
                                    <li key={member.id} className="border-b border-line py-2 last:border-b-0">
                                      <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className={cn("truncate text-ui", member.active ? "text-ink" : "text-muted line-through")}>{member.name}</p>
                                        <p className="text-caption tabular-nums text-muted">
                                          #{member.employeeNumber}{member.active ? "" : " · desactivado"}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <label className="sr-only" htmlFor={`rol-${member.id}`}>Rol de {member.name}</label>
                                        <select
                                          id={`rol-${member.id}`}
                                          value={member.role}
                                          disabled={savingRoleId === member.id || !member.active}
                                          onChange={(event) => void changeRole(store, member.id, event.target.value as "GERENTE" | "SUBGERENTE" | "ASESOR")}
                                          className={`${deskInput} min-h-9 w-auto text-caption disabled:opacity-40`}
                                        >
                                          <option value="GERENTE">Gerente</option>
                                          <option value="SUBGERENTE">Subgerente</option>
                                          <option value="ASESOR">Asesor</option>
                                        </select>
                                        {member.active ? (
                                          <button
                                            type="button"
                                            onClick={() => void issuePinLink(store, member.id)}
                                            disabled={pinLinkUserId === member.id}
                                            title="Generar enlace para que fije su PIN"
                                            aria-label={`Generar enlace de PIN para ${member.name}`}
                                            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40"
                                          >
                                            <KeyRound size={14} />
                                          </button>
                                        ) : null}
                                        {!member.active ? (
                                          <button
                                            type="button"
                                            onClick={() => void deleteMember(store, member.id, member.name)}
                                            disabled={deletingUserId === member.id}
                                            aria-label={`Eliminar definitivamente a ${member.name}`}
                                            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        ) : null}
                                      </div>
                                      </div>
                                      {pinLink?.userId === member.id ? (
                                        <div className="mt-2 rounded-lg border border-line bg-panel p-2.5">
                                          <p className="text-caption text-muted">
                                            Pásale este enlace a {member.name}. Ella elige su PIN; tú no lo verás.
                                            {pinLink.minutes > 0 ? ` Caduca en ${pinLink.minutes} minutos y solo sirve una vez.` : ""}
                                          </p>
                                          <div className="mt-1.5 flex items-center gap-2">
                                            <code className="min-w-0 flex-1 truncate rounded-sm bg-surface-3 px-2 py-1.5 text-caption text-ink">{pinLink.url}</code>
                                            <button
                                              type="button"
                                              onClick={() => void copyPinLink(pinLink.url)}
                                              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-caption font-semibold text-on-accent"
                                            >
                                              {pinLinkCopied ? "Copiado" : "Copiar"}
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </section>

                            {/*
                              Ubicación de la tienda: lo que dibuja el mapa de
                              Horarios.

                              ⚠️ La DIRECCIÓN es lo que la hace exacta; el
                              nombre de la tienda no sirve para buscarla --«TH
                              SAN AGUSTIN» casa con cualquier cosa en un mapa--.
                              Las coordenadas se capturan a mano porque no hay
                              servicio de geocodificación: salen de cualquier
                              mapa, botón derecho sobre el local.

                              ⚠️ Y vive AQUÍ además de en `/admin` porque esta
                              es la pantalla de escritorio, que es donde se
                              administra de verdad. Estaba solo en la otra, y
                              desde aquí no había forma de llegar: el campo
                              existía y nadie podía usarlo.
                            */}
                            <section>
                              <h4 className="text-caption font-medium text-muted">Ubicación</h4>
                              <input
                                value={address}
                                onChange={(event) => setAddress(event.target.value)}
                                maxLength={240}
                                placeholder="Calle, número, centro comercial, ciudad"
                                aria-label="Dirección de la tienda"
                                className="mt-2 min-h-9 w-full rounded-lg border border-line bg-panel px-3 text-caption text-ink outline-hidden focus:border-accent"
                              />
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  value={lat}
                                  onChange={(event) => setLat(event.target.value)}
                                  inputMode="decimal"
                                  placeholder="Latitud"
                                  aria-label="Latitud"
                                  className="min-h-9 w-32 rounded-lg border border-line bg-panel px-3 text-caption text-ink outline-hidden focus:border-accent"
                                />
                                <input
                                  value={lng}
                                  onChange={(event) => setLng(event.target.value)}
                                  inputMode="decimal"
                                  placeholder="Longitud"
                                  aria-label="Longitud"
                                  className="min-h-9 w-32 rounded-lg border border-line bg-panel px-3 text-caption text-ink outline-hidden focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveUbicacion(store)}
                                  disabled={savingUbicacion}
                                  className="min-h-9 rounded-lg bg-accent px-3 text-caption font-medium text-white transition-colors disabled:opacity-60"
                                >
                                  {savingUbicacion ? "Guardando..." : "Guardar ubicación"}
                                </button>
                              </div>
                              <p className="mt-1.5 text-caption text-muted">
                                Las coordenadas salen de cualquier mapa: botón derecho sobre el local. La longitud
                                aquí va negativa.
                              </p>
                              {avisoMapa ? (
                                <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-caption text-warn">
                                  {avisoMapa}
                                </p>
                              ) : null}
                              {/* El mapa ya armado, para comprobar de un vistazo que apunta a
                                  la tienda y no a la calle de al lado. */}
                              {store.mapaUrl ? (
                                // `<img>` y no `NextImage`: la URL viene firmada y caduca, así
                                // que no puede pasar por el optimizador.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={store.mapaUrl}
                                  alt={`Mapa de ${store.name}`}
                                  className="mt-2 h-28 w-full rounded-lg border border-line object-cover"
                                />
                              ) : null}
                            </section>

                            {/* Suscripción */}
                            <section>
                              <h4 className="text-caption font-medium text-muted">Suscripción</h4>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setBillingExempt((current) => !current)}
                                  aria-pressed={billingExempt}
                                  className={cn(
                                    "min-h-9 rounded-lg border px-3 text-caption font-medium transition-colors",
                                    billingExempt ? "border-ok/40 bg-ok/10 text-ok" : "border-line bg-panel text-muted"
                                  )}
                                >
                                  {billingExempt ? "Exenta de cobro" : "Tienda de pago"}
                                </button>
                                <label className="sr-only" htmlFor={`pago-${store.id}`}>Pagado hasta</label>
                                <input
                                  id={`pago-${store.id}`}
                                  type="date"
                                  value={paidUntil}
                                  onChange={(event) => setPaidUntil(event.target.value)}
                                  disabled={billingExempt}
                                  className={`${deskInput} min-h-9 w-auto flex-1 text-caption disabled:opacity-40`}
                                />
                                <DeskButton type="button" onClick={() => void saveBilling(store)} disabled={savingBilling} className="min-h-9 px-3 text-caption">
                                  {savingBilling ? "Guardando…" : "Guardar"}
                                </DeskButton>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="text-caption text-muted" htmlFor={`precio-${store.id}`}>Precio por usuario</label>
                                <input
                                  id={`precio-${store.id}`}
                                  type="number" min="0" step="1" inputMode="decimal"
                                  value={priceMxn}
                                  onChange={(event) => setPriceMxn(event.target.value.replace(/[^\d.]/g, ""))}
                                  placeholder="80"
                                  className={`${deskInput} min-h-9 w-24 text-caption`}
                                />
                                <span className="text-caption text-muted">
                                  × {store.activeUsers} activos = ${((Number(priceMxn) || 80) * store.activeUsers).toLocaleString("es-MX")} / mes
                                </span>
                              </div>

                              <p className="mt-2 max-w-prose text-caption leading-5 text-muted">
                                Una tienda de pago con fecha vencida queda suspendida: sus usuarios ven la pantalla de reactivación al abrir la app.
                              </p>
                            </section>

                            {/* Comisiones */}
                            <section className="2xl:col-span-2">
                              <h4 className="text-caption font-medium text-muted">
                                Porcentaje de comisión por alcance
                              </h4>
                              <div className="mt-2 grid gap-4 sm:grid-cols-3">
                                {BRACKET_ROLES.map((role) => (
                                  <div key={role}>
                                    <p className="text-ui font-medium text-ink">{ROLE_LABELS[role]}</p>
                                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                                      {BRACKET_MINS.map((min) => (
                                        <label key={`${role}:${min}`} className="grid min-w-0 gap-1">
                                          <span className="truncate text-center text-caption text-muted">{BRACKET_LABELS[min]}</span>
                                          <input
                                            value={draft[`${role}:${min}`] ?? ""}
                                            onChange={(event) => setDraft((current) => ({ ...current, [`${role}:${min}`]: event.target.value.replace(/[^\d.]/g, "") }))}
                                            inputMode="decimal"
                                            aria-label={`Comisión de ${ROLE_LABELS[role]} en el rango ${BRACKET_LABELS[min]}`}
                                            className={`${deskInput} text-center`}
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 flex items-center gap-3">
                                <DeskPrimaryButton type="button" onClick={() => void saveCommissions(store)} disabled={savingCommissions}>
                                  {savingCommissions ? "Guardando…" : "Guardar comisiones"}
                                </DeskPrimaryButton>
                                {savedStoreId === store.id ? (
                                  <span className="flex items-center gap-1 text-caption font-medium text-ok">
                                    <CheckCircle2 size={15} /> Guardado
                                  </span>
                                ) : null}
                              </div>
                            </section>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </DeskSection>

            <DeskRule />

            <DeskSection title="Auditoría">
              <DeskButton type="button" onClick={() => void toggleAudit()} aria-expanded={showAudit}>
                <ScrollText size={15} className="text-accent" />
                {showAudit ? "Ocultar movimientos" : "Ver movimientos"}
                <ChevronDown size={14} className={cn("transition-transform", showAudit && "rotate-180")} />
              </DeskButton>

              {showAudit ? (
                <div className="mt-4 max-w-3xl">
                  {auditEntries === null ? (
                    <div className="space-y-2">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-12" />)}</div>
                  ) : auditEntries.length === 0 ? (
                    <p className="text-ui text-muted">Sin movimientos registrados todavía.</p>
                  ) : (
                    <ul>
                      {auditEntries.map((entry) => (
                        <li key={entry.id} className="border-b border-line py-3 last:border-b-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-ui text-ink">
                              {entry.actorName}{entry.storeName ? ` · ${entry.storeName}` : ""}
                            </p>
                            <span className="shrink-0 rounded-lg border border-line bg-panel px-2 py-0.5 text-caption text-muted">
                              {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                            </span>
                          </div>
                          {entry.detail ? <p className="mt-0.5 text-caption text-muted">{entry.detail}</p> : null}
                          <p className="mt-0.5 text-caption text-muted">
                            {new Date(entry.createdAt).toLocaleString("es-MX", { timeZone: "America/Monterrey", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </DeskSection>
          </div>
        </DeskReveal>
      </div>
    </div>
  );
}

function StateChip({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" }) {
  return (
    <span className={cn(
      "rounded-lg border px-2 py-0.5 text-caption",
      tone === "ok" ? "border-ok/30 bg-ok/10 text-ok"
        : tone === "warn" ? "border-warn/30 bg-warn/10 text-warn"
        : "border-danger/30 bg-danger/10 text-danger"
    )}>
      {label}
    </span>
  );
}
