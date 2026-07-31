"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";

/**
 * Paso 1: pedir el enlace.
 *
 * La pantalla NUNCA dice si el número existe. El mensaje de éxito es el mismo
 * en todos los casos (ver el comentario del endpoint), y por eso está redactado
 * como una condición y no como una promesa: "si el número existe y tiene correo
 * registrado". Prometer un envío que no va a ocurrir es peor que no prometer.
 */
export default function RecuperarPage() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = employeeNumber.trim();
    if (!value) {
      setError("Escribe tu número de empleado.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/pin-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeNumber: value })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "No se pudo procesar la solicitud. Intenta de nuevo."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 py-12 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center">
          <div
            className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
          >
            <ClarvexIcon size={34} />
          </div>
          <p className="text-[10px] font-semibold tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {sent ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <MailCheck className="text-blue-600" size={18} />
                <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Revisa tu correo</h1>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Si el número existe y tiene un correo registrado, te llegará un enlace en unos minutos. Caduca en 30
                minutos y sirve una sola vez.
              </p>
              <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                ¿No te llegó nada? Puede que tu cuenta no tenga un correo registrado. En ese caso, tu gerente puede
                restablecerte el PIN desde la app.
              </p>
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mb-1 flex items-center gap-2">
                <ShieldCheck className="text-blue-600" size={16} />
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Restablecer el PIN</span>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Escribe tu número de empleado y te mandamos un enlace al correo registrado en tu cuenta.
              </p>

              <label htmlFor="employeeNumber" className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Número de empleado
              </label>
              <input
                id="employeeNumber"
                name="employeeNumber"
                inputMode="numeric"
                autoComplete="username"
                autoFocus
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Ej. 2554"
              />

              {error ? <p className="mb-3 text-sm font-semibold text-red-500">{error}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Enviando…" : "Enviarme el enlace"}
              </button>
            </form>
          )}
        </div>

        {!sent ? (
          <Link
            href="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft size={15} />
            Volver al inicio de sesión
          </Link>
        ) : null}
      </motion.div>
    </main>
  );
}
