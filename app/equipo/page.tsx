"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2, UserPlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { AppFrame, AppHeader, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";

type Row = {
  id: string; name: string; photoUrl?: string | null; birthDate: string; hireDate: string;
  hoursOwed: string;
  /** Lo que se edita: el saldo capturado a mano (el punto de partida). */
  vacationDays: string;
  /** Lo que se muestra: el saldo real y de dónde sale. No se editan. */
  vacationAvailable: number; vacationEarned: number; vacationTaken: number; vacationPlanned: number;
  paidDays: string; active: boolean; checklistOnly: boolean;
};

export default function TeamDatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    fetchAppData({ includeInactive: true })
      .then((data) => setRows(data.users.map((u) => ({
        id: u.id, name: u.name, photoUrl: u.photoUrl, birthDate: u.birthDate ?? "", hireDate: u.hireDate ?? "",
        hoursOwed: String(u.hoursOwed ?? 0),
        // El input edita el saldo CAPTURADO, no el calculado: si se llenara con el
        // saldo real, guardar sin tocar nada movería la fecha de corte sola.
        vacationDays: String(u.vacationBaseline ?? u.vacationDays ?? 0),
        vacationAvailable: u.vacationDays ?? 0,
        vacationEarned: u.vacationEarned ?? 0,
        vacationTaken: u.vacationTaken ?? 0,
        vacationPlanned: u.vacationPlanned ?? 0,
        paidDays: String(u.paidDays ?? 0), active: u.active ?? true, checklistOnly: u.checklistOnly ?? false
      }))))
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

  async function toggleChecklistOnly(row: Row) {
    const next = !row.checklistOnly;
    const message = next
      ? `¿Poner a ${row.name} en modo kiosko? Solo verá el checklist (para el celular de la tienda). Su sesión actual se cerrará.`
      : `¿Quitar el modo kiosko de ${row.name}? Volverá a ver la app normal según su rol.`;
    if (!window.confirm(message)) return;
    setTogglingId(row.id);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, checklistOnly: next })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setRows((current) => current.map((r) => r.id === row.id ? { ...r, checklistOnly: next } : r));
    } catch (toggleError) {
      setError(toggleError instanceof Error && toggleError.message ? toggleError.message : `No se pudo cambiar el modo de ${row.name}.`);
    } finally {
      setTogglingId(null);
    }
  }

  async function removeMember(row: Row) {
    if (!window.confirm(`¿Eliminar definitivamente a ${row.name}? Esta acción no se puede deshacer.`)) return;
    setDeletingId(row.id);
    setError("");
    try {
      const response = await fetch(`/api/team/${row.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo eliminar la cuenta.");
      setRows((current) => current.filter((r) => r.id !== row.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la cuenta.");
    } finally {
      setDeletingId(null);
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
      setRows((current) => [...current, { id: payload.user!.id, name: payload.user!.name, photoUrl: null, birthDate: "", hireDate: "", hoursOwed: "0", vacationDays: "0", vacationAvailable: 0, vacationEarned: 0, vacationTaken: 0, vacationPlanned: 0, paidDays: "0", active: true, checklistOnly: false }]);
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
          <p className="mb-3 flex items-center gap-2 font-semibold text-ink"><UserPlus size={16} />Agregar integrante</p>
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
                  <p className={`font-semibold ${row.active ? "text-ink" : "text-muted line-through"}`}>{row.name}</p>
                  {!row.active ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Desactivado</span> : null}
                  {row.checklistOnly ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">Kiosko</span> : null}
                  {row.id !== currentUserId ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      {!row.active ? (
                        <button
                          type="button"
                          onClick={() => void removeMember(row)}
                          disabled={deletingId === row.id}
                          aria-label={`Eliminar definitivamente a ${row.name}`}
                          className="grid size-8 place-items-center rounded-full bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          {deletingId === row.id ? "..." : <Trash2 size={14} />}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void toggleChecklistOnly(row)}
                        disabled={togglingId === row.id}
                        title="Modo kiosko: solo checklist (celular de la tienda)"
                        className={`min-h-8 rounded-full px-3 text-xs font-bold transition ${row.checklistOnly ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-200" : "bg-panel text-muted hover:text-blue-700"} disabled:opacity-50`}
                      >
                        {row.checklistOnly ? "Quitar kiosko" : "Kiosko"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(row)}
                        disabled={togglingId === row.id}
                        className={`min-h-8 rounded-full px-3 text-xs font-bold transition ${row.active ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"} disabled:opacity-50`}
                      >
                        {togglingId === row.id ? "..." : row.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
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
                    <span className="text-xs font-bold text-muted">Vacaciones (saldo inicial)</span>
                    <input type="number" step="1" min="0" inputMode="numeric" value={row.vacationDays} onChange={(event) => update(row.id, "vacationDays", event.target.value)} className={inputClass} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-muted">Días de pago de día</span>
                    <input type="number" step="1" min="0" inputMode="numeric" value={row.paidDays} onChange={(event) => update(row.id, "paidDays", event.target.value)} className={inputClass} />
                  </label>
                  {/* El saldo que de verdad manda. Se muestra aquí para que no se
                      confunda con el campo de arriba, que es solo el punto de partida. */}
                  <div className="col-span-2 rounded-lg bg-surface-2 px-3 py-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold text-muted">Vacaciones disponibles hoy</span>
                      <span className="text-lg font-semibold">{row.vacationAvailable} {row.vacationAvailable === 1 ? "día" : "días"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.vacationDays} iniciales
                      {row.vacationEarned > 0 ? ` + ${row.vacationEarned} de antigüedad` : ""}
                      {row.vacationTaken > 0 ? ` − ${row.vacationTaken} tomados` : ""}
                      {!row.hireDate ? " · falta la fecha de ingreso para calcular su derecho de ley" : ""}
                    </p>
                    {/* Se avisan aparte para que no parezca que el saldo "no baja":
                        un día programado todavía no se descuenta. */}
                    {row.vacationPlanned > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {row.vacationPlanned} {row.vacationPlanned === 1 ? "día programado" : "días programados"} en Horarios · se descuentan al pasar
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Button type="button" variant="primary" onClick={() => void save(row)} disabled={savingId === row.id} className="min-h-10 px-4">
                    {savingId === row.id ? "Guardando..." : "Guardar"}
                  </Button>
                  {savedId === row.id ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} />Guardado</span> : null}
                </div>
                {row.id !== currentUserId ? <PinSetter userId={row.id} name={row.name} /> : null}
                <EmailSetter userId={row.id} name={row.name} />
              </Card>
            ))}
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}

/**
 * Gerencia configura un PIN de acceso para un integrante (temporal). Es la forma
 * de dar de alta el PIN de un usuario nuevo —sobre todo el "kiosko" del celular
 * de la tienda—: ese usuario no puede ponérselo solo (el setup del PIN exige
 * autorización de gerencia). Con esto entra con el número de empleado + este PIN,
 * y puede cambiarlo después desde su perfil.
 */
function PinSetter({ userId, name }: { userId: string; name: string }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!/^\d{4}$/.test(pin)) { setError("El PIN debe ser de 4 dígitos."); return; }
    setBusy(true); setError(""); setDone(false);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pin })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDone(true); setPin("");
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "No se pudo configurar el PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-line/70 p-3">
      <p className="text-xs font-bold text-muted">PIN de acceso (temporal)</p>
      <p className="mb-2 text-[11px] text-muted">Con este PIN {name.split(" ")[0]} entra a la app con su número de empleado. Puede cambiarlo después.</p>
      <div className="flex items-center gap-2">
        <input
          value={pin}
          onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setDone(false); }}
          inputMode="numeric"
          maxLength={4}
          placeholder="4 dígitos"
          className="min-h-11 w-28 rounded-2xl border border-line bg-panel px-3 text-center text-sm font-bold tracking-[0.3em] text-ink outline-none focus:border-volt"
        />
        <Button type="button" variant="primary" onClick={() => void save()} disabled={busy || pin.length !== 4} className="min-h-10 px-4">
          {busy ? "..." : "Configurar PIN"}
        </Button>
        {done ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} />Listo</span> : null}
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}

/**
 * Gerencia registra el correo real de un integrante.
 *
 * Es el prerrequisito del restablecimiento por correo: la app inventa un
 * `@clarvex.local` al dar de alta a alguien, y a ese dominio no llega nada.
 * Sin un correo de verdad aquí, esa persona depende siempre de que gerencia le
 * restablezca el PIN a mano.
 */
function EmailSetter({ userId, name }: { userId: string; name: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const value = email.trim();
    if (!value.includes("@")) { setError("Escribe un correo válido."); return; }
    setBusy(true); setError(""); setDone(false);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: value })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDone(true); setEmail("");
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "No se pudo guardar el correo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-line/70 p-3">
      <p className="text-xs font-bold text-muted">Correo</p>
      <p className="mb-2 text-[11px] text-muted">Aquí le llega el enlace si {name.split(" ")[0]} olvida su PIN. Sin correo, tendrás que restablecérselo tú.</p>
      <div className="flex items-center gap-2">
        <input
          value={email}
          onChange={(event) => { setEmail(event.target.value); setDone(false); }}
          type="email"
          inputMode="email"
          placeholder="correo@ejemplo.com"
          className="min-h-11 flex-1 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt"
        />
        <Button type="button" variant="primary" onClick={() => void save()} disabled={busy || !email.trim()} className="min-h-10 px-4">
          {busy ? "..." : "Guardar"}
        </Button>
        {done ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} />Listo</span> : null}
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
