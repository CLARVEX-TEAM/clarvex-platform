"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserPlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { AppFrame, AppHeader, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";

type Row = { id: string; name: string; photoUrl?: string | null; birthDate: string; hireDate: string; hoursOwed: string; vacationDays: string; paidDays: string; active: boolean };

export default function TeamDatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newRole, setNewRole] = useState<"ASESOR" | "SUBGERENTE" | "GERENTE">("ASESOR");
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState("");

  useEffect(() => {
    getSession().then((current) => {
      if (!current) { router.replace("/login"); return; }
      if (current.role === "ASESOR") { router.replace("/advisor"); return; }
      setCurrentUserId(current.id);
    });
  }, [router]);

  useEffect(() => {
    fetchAppData()
      .then((data) => setRows(data.users.map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl, birthDate: u.birthDate ?? "", hireDate: u.hireDate ?? "", hoursOwed: String(u.hoursOwed ?? 0), vacationDays: String(u.vacationDays ?? 0), paidDays: String(u.paidDays ?? 0), active: u.active ?? true }))))
      .catch(() => setError("No se pudo cargar el equipo."))
      .finally(() => setLoading(false));
  }, []);

  function update(id: string, field: "birthDate" | "hireDate" | "hoursOwed" | "vacationDays" | "paidDays", value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setSavedId(null);
  }

  async function toggleActive(row: Row) {
    const next = !row.active;
    if (!next && !window.confirm(`¿Desactivar la cuenta de ${row.name}? No podrá iniciar sesión y su sesión actual dejará de funcionar.`)) return;
    setTogglingId(row.id);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, active: next })
      });
      if (!response.ok) throw new Error();
      setRows((current) => current.map((r) => r.id === row.id ? { ...r, active: next } : r));
    } catch {
      setError(`No se pudo ${next ? "activar" : "desactivar"} a ${row.name}.`);
    } finally {
      setTogglingId(null);
    }
  }

  async function save(row: Row) {
    setSavingId(row.id);
    setSavedId(null);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, birthDate: row.birthDate || null, hireDate: row.hireDate || null, hoursOwed: Number(row.hoursOwed) || 0, vacationDays: Number(row.vacationDays) || 0, paidDays: Number(row.paidDays) || 0 })
      });
      if (!response.ok) throw new Error();
      setSavedId(row.id);
    } catch {
      setError(`No se pudo guardar ${row.name}.`);
    } finally {
      setSavingId(null);
    }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError("");
    setAddedMessage("");
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, employeeNumber: newNumber, role: newRole })
      });
      const payload = await response.json() as { user?: { id: string; name: string }; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error ?? "No se pudo agregar al integrante.");
      setRows((current) => [...current, { id: payload.user!.id, name: payload.user!.name, photoUrl: null, birthDate: "", hireDate: "", hoursOwed: "0", vacationDays: "0", paidDays: "0", active: true }]);
      setAddedMessage(`${payload.user.name} ya puede iniciar sesión con el número ${newNumber} y crear su PIN.`);
      setNewName("");
      setNewNumber("");
      setNewRole("ASESOR");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar al integrante.");
    } finally {
      setAdding(false);
    }
  }

  const inputClass = "min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <>
      <AppHeader title="Fechas del equipo" subtitle="Cumpleaños y aniversarios" backHref="/manager" />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {addedMessage ? (
          <Card className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} className="shrink-0" />{addedMessage}
          </Card>
        ) : null}

        <Card className="mb-4 p-3.5">
          <p className="mb-3 flex items-center gap-2 font-black text-ink"><UserPlus size={16} />Agregar integrante</p>
          <form onSubmit={(event) => void addMember(event)} className="grid grid-cols-2 gap-2">
            <label className="col-span-2 grid gap-1">
              <span className="text-xs font-bold text-muted">Nombre completo</span>
              <input value={newName} onChange={(event) => setNewName(event.target.value)} required minLength={2} maxLength={120} placeholder="NOMBRE COMPLETO" className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Número de empleado</span>
              <input value={newNumber} onChange={(event) => setNewNumber(event.target.value.replace(/\D/g, ""))} required inputMode="numeric" pattern="\d{1,30}" placeholder="95739" className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Puesto</span>
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as typeof newRole)} className={inputClass}>
                <option value="ASESOR">Asesor</option>
                <option value="SUBGERENTE">Subgerente</option>
                <option value="GERENTE">Gerente</option>
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={adding} className="col-span-2 mt-1 min-h-10">
              {adding ? "Agregando..." : "Agregar al equipo"}
            </Button>
          </form>
        </Card>

        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando equipo...</Card>
        ) : (
          <div className="space-y-2.5">
            {rows.map((row) => (
              <Card key={row.id} className="p-3.5">
                <div className="mb-3 flex items-center gap-3">
                  <ProfileAvatar name={row.name} photoUrl={row.photoUrl} size="sm" />
                  <p className={`font-black ${row.active ? "text-ink" : "text-muted line-through"}`}>{row.name}</p>
                  {!row.active ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Desactivado</span> : null}
                  {row.id !== currentUserId ? (
                    <button
                      type="button"
                      onClick={() => void toggleActive(row)}
                      disabled={togglingId === row.id}
                      className={`ml-auto min-h-8 rounded-full px-3 text-xs font-bold transition ${row.active ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"} disabled:opacity-50`}
                    >
                      {togglingId === row.id ? "..." : row.active ? "Desactivar" : "Activar"}
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-muted">Cumpleaños</span>
                    <input type="date" value={row.birthDate} onChange={(event) => update(row.id, "birthDate", event.target.value)} className={inputClass} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-muted">Ingreso</span>
                    <input type="date" value={row.hireDate} onChange={(event) => update(row.id, "hireDate", event.target.value)} className={inputClass} />
                  </label>
                  <label className="col-span-2 grid gap-1">
                    <span className="text-xs font-bold text-muted">Horas que se le deben (saldo)</span>
                    <input type="number" step="0.5" inputMode="decimal" value={row.hoursOwed} onChange={(event) => update(row.id, "hoursOwed", event.target.value)} className={inputClass} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-muted">Días de vacaciones</span>
                    <input type="number" step="1" min="0" inputMode="numeric" value={row.vacationDays} onChange={(event) => update(row.id, "vacationDays", event.target.value)} className={inputClass} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-muted">Días de pago de día</span>
                    <input type="number" step="1" min="0" inputMode="numeric" value={row.paidDays} onChange={(event) => update(row.id, "paidDays", event.target.value)} className={inputClass} />
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Button type="button" variant="primary" onClick={() => void save(row)} disabled={savingId === row.id} className="min-h-10 px-4">
                    {savingId === row.id ? "Guardando..." : "Guardar"}
                  </Button>
                  {savedId === row.id ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} />Guardado</span> : null}
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
