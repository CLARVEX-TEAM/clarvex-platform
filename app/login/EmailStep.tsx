"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";

/**
 * Captura del correo, justo después de entrar con el PIN.
 *
 * ¿Por qué aquí y no en la pantalla de recuperación? Porque aquí HAY SESIÓN.
 * Pedirlo en `/recuperar` significaría aceptar el correo que teclee cualquiera
 * que sepa un número de empleado, y esos números no son secretos: se los saben
 * entre compañeros. Quien lo escribiera recibiría el enlace y se quedaría con
 * la cuenta ajena.
 *
 * El momento correcto es este: se captura mientras la persona TODAVÍA puede
 * entrar, para que el día que olvide su PIN el correo ya esté ahí.
 *
 * Se puede posponer. Obligar bloquearía el acceso a alguien que solo quiere
 * fichar su checklist, y volverá a aparecer en el siguiente inicio de sesión.
 */
export function EmailStep({
  name,
  isDark,
  card,
  onSave,
  onSkip
}: {
  name: string;
  isDark: boolean;
  card: string;
  onSave: (email: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value.includes("@") || !value.includes(".")) {
      setError("Escribe un correo válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(value);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "No se pudo guardar el correo.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      key="email"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -48 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col items-center justify-center px-5"
    >
      <div
        className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
        style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
      >
        <ClarvexIcon size={34} />
      </div>
      <p className="mb-5 text-[10px] font-semibold tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>

      <form onSubmit={submit} className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
        <div className="mb-1 flex items-center gap-2">
          <Mail className="text-blue-600" size={16} />
          <span className="text-sm font-semibold text-blue-700">Tu correo</span>
        </div>
        <p className={`mb-5 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {name ? `${name}, ` : ""}déjanos tu correo. Es la única forma de recuperar tu acceso solo si algún día
          olvidas tu PIN. Sin él tendrás que pedirle a tu gerente que te lo restablezca.
        </p>

        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tucorreo@ejemplo.com"
          className={`mb-4 w-full rounded-xl border px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
            isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-300 bg-white text-slate-900"
          }`}
        />

        {error ? <p className="mb-3 text-sm font-semibold text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mb-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Guardar y entrar"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${
            isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Ahora no
        </button>
      </form>
    </motion.div>
  );
}
