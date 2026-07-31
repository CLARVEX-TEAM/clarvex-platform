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
          <CheckCircle2 className="text-emerald-600" size={18} />
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">PIN actualizado</h1>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Ya puedes entrar con tu número de empleado y tu PIN nuevo. Si tenías la sesión abierta en otro dispositivo,
          se cerró por seguridad.
        </p>
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="text-blue-600" size={16} />
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Elige tu PIN nuevo</span>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {firstName ? `${firstName}, escribe` : "Escribe"} un PIN de 4 a 6 dígitos. Lo usarás junto con tu número de
        empleado para entrar.
      </p>

      <label htmlFor="pin" className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
        className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base tracking-[0.4em] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        placeholder="••••"
      />

      <label htmlFor="confirmation" className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
        className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base tracking-[0.4em] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        placeholder="••••"
      />

      {error ? <p className="mb-3 text-sm font-semibold text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Guardando…" : "Guardar mi PIN nuevo"}
      </button>
    </form>
  );
}
