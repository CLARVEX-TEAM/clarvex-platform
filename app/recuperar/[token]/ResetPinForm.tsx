"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";

/**
 * Formulario del PIN nuevo.
 *
 * Pide el PIN dos veces a propósito. Es un campo enmascarado de 4 a 6 dígitos y
 * quien lo teclea acaba de quedarse fuera: un dedazo aquí lo dejaría fuera otra
 * vez, y ya sin enlace válido porque se consumió al enviarlo.
 */
export function ResetPinForm({ token, name }: { token: string; name: string }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const firstName = name.split(" ")[0] || "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("El PIN debe tener de 4 a 6 dígitos.");
      return;
    }
    if (pin !== confirmation) {
      setError("Los dos PIN no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/pin-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDone(true);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error && confirmError.message
          ? confirmError.message
          : "No se pudo cambiar el PIN. Intenta de nuevo."
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="text-mint" size={18} />
          <h1 className="text-base font-semibold text-ink dark:text-slate-100">PIN actualizado</h1>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Ya puedes entrar con tu número de empleado y tu PIN nuevo. Si tenías la sesión abierta en otro dispositivo,
          se cerró por seguridad.
        </p>
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white transition hover:bg-volt/12"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="text-volt" size={16} />
        <span className="text-sm font-semibold text-volt">Elige tu PIN nuevo</span>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted">
        {firstName ? `${firstName}, escribe` : "Escribe"} un PIN de 4 a 6 dígitos. Lo usarás junto con tu número de
        empleado para entrar.
      </p>

      <label htmlFor="pin" className="mb-2 block text-xs font-semibold text-ink">
        PIN nuevo
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        autoFocus
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
        className="mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 text-base tracking-[0.4em] text-ink outline-hidden transition focus:border-volt/30 focus:ring-2 focus:ring-volt/30 dark:border-line dark:bg-panel dark:text-slate-100"
        placeholder="••••"
      />

      <label htmlFor="confirmation" className="mb-2 block text-xs font-semibold text-ink">
        Repite el PIN
      </label>
      <input
        id="confirmation"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ""))}
        className="mb-4 w-full rounded-xl border border-line bg-white px-4 py-3 text-base tracking-[0.4em] text-ink outline-hidden transition focus:border-volt/30 focus:ring-2 focus:ring-volt/30 dark:border-line dark:bg-panel dark:text-slate-100"
        placeholder="••••"
      />

      {error ? <p className="mb-3 text-sm font-semibold text-orchid">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white transition hover:bg-volt/12 disabled:opacity-60"
      >
        {busy ? "Guardando…" : "Guardar mi PIN nuevo"}
      </button>
    </form>
  );
}
