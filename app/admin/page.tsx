"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ChevronDown, Percent, Plus, ScrollText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { AppFrame, AppHeader, BottomNav, Button, Card } from "@/components/ui";

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
  "target.update": "Meta interna"
};

type StoreRow = {
  id: string;
  name: string;
  createdAt: string;
  totalUsers: number;
  activeUsers: number;
  dataSources: number;
  billingExempt: boolean;
  subscriptionPaidUntil: string | null;
  commissionRules: CommissionRuleRow[];
};

function billingStatus(store: StoreRow): { label: string; tone: "ok" | "warn" | "bad" } {
  if (store.billingExempt) return { label: "Exenta", tone: "ok" };
  if (!store.subscriptionPaidUntil) return { label: "Sin pago", tone: "bad" };
  const paidUntil = new Date(`${store.subscriptionPaidUntil}T23:59:59Z`).getTime();
  if (paidUntil < Date.now()) return { label: "Vencida", tone: "bad" };
  const daysLeft = Math.ceil((paidUntil - Date.now()) / 86_400_000);
  return daysLeft <= 7 ? { label: `Vence en ${daysLeft} d`, tone: "warn" } : { label: `Al corriente`, tone: "ok" };
}

const BRACKET_ROLES = ["GERENTE", "SUBGERENTE", "ASESOR"] as const;
const BRACKET_MINS = [0, 100, 115] as const;
const BRACKET_LABELS: Record<number, string> = { 0: "≤ 99.99%", 100: "100–114.99%", 115: "≥ 115%" };
const ROLE_LABELS: Record<(typeof BRACKET_ROLES)[number], string> = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" };

export default function AdminPage() {
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
  const [savingBilling, setSavingBilling] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[] | null>(null);

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
      if (!current.platformAdmin) { router.replace(current.role === "ASESOR" ? "/advisor" : "/manager"); return; }
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
        body: JSON.stringify({
          name: storeName,
          manager: { name: managerName, employeeNumber: managerNumber }
        })
      });
      const payload = await response.json() as { store?: { name: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la tienda.");
      setCreated(`Tienda "${payload.store?.name}" creada. ${managerName} puede iniciar sesión con su número de empleado y crear su PIN.`);
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
    if (expandedStoreId === store.id) {
      setExpandedStoreId(null);
      return;
    }
    const next: Record<string, string> = {};
    for (const rule of store.commissionRules) {
      next[`${rule.role}:${rule.minAchievement}`] = String(rule.commissionPercent);
    }
    setDraft(next);
    setBillingExempt(store.billingExempt);
    setPaidUntil(store.subscriptionPaidUntil ?? "");
    setSavedStoreId(null);
    setExpandedStoreId(store.id);
  }

  async function saveBilling(store: StoreRow) {
    setSavingBilling(true);
    setError("");
    setSavedStoreId(null);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingExempt, subscriptionPaidUntil: paidUntil || null })
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
        role,
        minAchievement: min,
        commissionPercent: Number(draft[`${role}:${min}`])
      })));
      if (rules.some((rule) => !Number.isFinite(rule.commissionPercent) || rule.commissionPercent < 0 || rule.commissionPercent > 100)) {
        throw new Error("Todos los porcentajes deben ser números entre 0 y 100.");
      }
      const response = await fetch(`/api/admin/stores/${store.id}/commissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules })
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

  const inputClass = "min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <>
      <AppHeader title="Administración" subtitle="Tiendas de la plataforma" backHref="/manager" />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {created ? (
          <Card className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} className="shrink-0" />{created}
          </Card>
        ) : null}

        <Card className="mb-4 p-3.5">
          <p className="mb-3 flex items-center gap-2 font-black text-ink"><Plus size={16} />Nueva tienda</p>
          <form onSubmit={(event) => void createStore(event)} className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Nombre de la tienda</span>
              <input value={storeName} onChange={(event) => setStoreName(event.target.value)} required minLength={2} maxLength={80} placeholder="MARCA · Centro Comercial" className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Nombre del gerente</span>
              <input value={managerName} onChange={(event) => setManagerName(event.target.value)} required minLength={2} maxLength={120} placeholder="NOMBRE COMPLETO" className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Número de empleado del gerente</span>
              <input value={managerNumber} onChange={(event) => setManagerNumber(event.target.value.replace(/\D/g, ""))} required inputMode="numeric" pattern="\d{1,30}" placeholder="102259" className={inputClass} />
            </label>
            <Button type="submit" variant="primary" disabled={creating} className="mt-1 min-h-10">
              {creating ? "Creando..." : "Crear tienda"}
            </Button>
          </form>
        </Card>

        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando tiendas...</Card>
        ) : (
          <div className="space-y-2.5">
            {stores.map((store) => (
              <Card key={store.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-panel text-muted"><Building2 size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-ink">{store.name}</p>
                    <p className="text-xs font-semibold text-muted">
                      {store.activeUsers} activos de {store.totalUsers} · {store.dataSources} fuentes de datos
                      {(() => { const s = billingStatus(store); return (
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${s.tone === "ok" ? "bg-success/10 text-success" : s.tone === "warn" ? "bg-ember/10 text-ember" : "bg-orchid/10 text-orchid"}`}>{s.label}</span>
                      ); })()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCommissions(store)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-panel px-3 text-xs font-bold text-ink transition hover:bg-line"
                  >
                    <Percent size={13} />Comisiones
                    <ChevronDown size={13} className={`transition-transform ${expandedStoreId === store.id ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {expandedStoreId === store.id ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-2 text-xs font-bold text-muted">Suscripción</p>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBillingExempt((current) => !current)}
                        className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${billingExempt ? "bg-success/10 text-success ring-1 ring-success/30" : "bg-panel text-muted ring-1 ring-line"}`}
                      >
                        {billingExempt ? "Exenta de cobro ✓" : "Tienda de pago"}
                      </button>
                      <input
                        type="date"
                        value={paidUntil}
                        onChange={(event) => setPaidUntil(event.target.value)}
                        disabled={billingExempt}
                        aria-label="Pagado hasta"
                        className="min-h-9 flex-1 rounded-xl border border-line bg-panel px-2 text-xs font-bold text-ink outline-none focus:border-volt disabled:opacity-40"
                      />
                      <Button type="button" variant="primary" onClick={() => void saveBilling(store)} disabled={savingBilling} className="min-h-9 px-3 text-xs">
                        {savingBilling ? "..." : "Guardar"}
                      </Button>
                    </div>
                    <p className="mb-3 text-[11px] leading-4 text-muted">
                      Una tienda de pago con fecha vencida queda suspendida: sus usuarios ven la pantalla de reactivación al abrir la app.
                    </p>

                    <p className="mb-2 text-xs font-bold text-muted">% de comisión por alcance (zonificación de esta tienda)</p>
                    <div className="space-y-2.5">
                      {BRACKET_ROLES.map((role) => (
                        <div key={role}>
                          <p className="mb-1 text-xs font-bold text-ink">{ROLE_LABELS[role]}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {BRACKET_MINS.map((min) => (
                              <label key={`${role}:${min}`} className="grid min-w-0 gap-1">
                                <span className="truncate text-center text-[10px] font-bold text-muted">{BRACKET_LABELS[min]}</span>
                                <input
                                  value={draft[`${role}:${min}`] ?? ""}
                                  onChange={(event) => setDraft((current) => ({ ...current, [`${role}:${min}`]: event.target.value.replace(/[^\d.]/g, "") }))}
                                  inputMode="decimal"
                                  className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-panel px-1 text-center text-sm font-bold text-ink outline-none focus:border-volt"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Button type="button" variant="primary" onClick={() => void saveCommissions(store)} disabled={savingCommissions} className="min-h-10 px-4">
                        {savingCommissions ? "Guardando..." : "Guardar comisiones"}
                      </Button>
                      {savedStoreId === store.id ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} />Guardado</span> : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-4 p-3.5">
          <button type="button" onClick={() => void toggleAudit()} className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2 font-black text-ink"><ScrollText size={16} className="text-volt" />Auditoría</span>
            <ChevronDown size={15} className={`text-muted transition-transform ${showAudit ? "rotate-180" : ""}`} />
          </button>
          {showAudit ? (
            <div className="mt-3 divide-y divide-line border-t border-line">
              {auditEntries === null ? (
                <p className="pt-3 text-sm font-semibold text-muted">Cargando...</p>
              ) : auditEntries.length === 0 ? (
                <p className="pt-3 text-sm font-semibold text-muted">Sin movimientos registrados todavía.</p>
              ) : auditEntries.map((entry) => (
                <div key={entry.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-black text-ink">{entry.actorName}{entry.storeName ? ` · ${entry.storeName}` : ""}</p>
                    <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[10px] font-bold text-muted ring-1 ring-line">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                  </div>
                  {entry.detail ? <p className="mt-0.5 text-xs font-semibold text-muted">{entry.detail}</p> : null}
                  <p className="mt-0.5 text-[10px] font-semibold text-muted/70">{new Date(entry.createdAt).toLocaleString("es-MX", { timeZone: "America/Monterrey", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}
