"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { AppFrame, AppHeader, BottomNav, Button, Card } from "@/components/ui";

type StoreRow = {
  id: string;
  name: string;
  createdAt: string;
  totalUsers: number;
  activeUsers: number;
  dataSources: number;
};

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
              <Card key={store.id} className="flex items-center gap-3 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-panel text-muted"><Building2 size={18} /></span>
                <div className="min-w-0">
                  <p className="truncate font-black text-ink">{store.name}</p>
                  <p className="text-xs font-semibold text-muted">
                    {store.activeUsers} activos de {store.totalUsers} · {store.dataSources} fuentes de datos
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
