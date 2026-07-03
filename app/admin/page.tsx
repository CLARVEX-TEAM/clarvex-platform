"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ChevronDown, Percent, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { AppFrame, AppHeader, BottomNav, Button, Card } from "@/components/ui";

type CommissionRuleRow = {
  id: string;
  role: "GERENTE" | "SUBGERENTE" | "ASESOR";
  minAchievement: number;
  maxAchievement: number | null;
  commissionPercent: number;
};

type StoreRow = {
  id: string;
  name: string;
  createdAt: string;
  totalUsers: number;
  activeUsers: number;
  dataSources: number;
  commissionRules: CommissionRuleRow[];
};

const BRACKET_ROLES = ["GERENTE", "SUBGERENTE", "ASESOR"] as const;
const BRACKET_MINS = [0, 100, 115] as const;
const BRACKET_LABELS: Record<number, string> = { 0: "≤ 99.99%", 100: "100 – 114.99%", 115: "≥ 115%" };
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
    setSavedStoreId(null);
    setExpandedStoreId(store.id);
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
                    <p className="mb-2 text-xs font-bold text-muted">% de comisión por alcance (zonificación de esta tienda)</p>
                    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-1.5">
                      <span />
                      {BRACKET_MINS.map((min) => (
                        <span key={min} className="text-center text-[11px] font-bold text-muted">{BRACKET_LABELS[min]}</span>
                      ))}
                      {BRACKET_ROLES.map((role) => (
                        <Fragment key={role}>
                          <span className="pr-1 text-xs font-bold text-ink">{ROLE_LABELS[role]}</span>
                          {BRACKET_MINS.map((min) => (
                            <input
                              key={`${role}:${min}`}
                              value={draft[`${role}:${min}`] ?? ""}
                              onChange={(event) => setDraft((current) => ({ ...current, [`${role}:${min}`]: event.target.value.replace(/[^\d.]/g, "") }))}
                              inputMode="decimal"
                              className="min-h-10 rounded-xl border border-line bg-panel px-2 text-center text-sm font-bold text-ink outline-none focus:border-volt"
                            />
                          ))}
                        </Fragment>
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
      </AppFrame>
      <BottomNav />
    </>
  );
}
