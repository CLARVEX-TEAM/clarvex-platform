"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Fingerprint, KeyRound } from "lucide-react";
import type { PreAuthUser } from "@/lib/auth";

export function GreetingStep({
  user,
  greeting,
  isDark,
  busy,
  error,
  onBiometricLogin,
  onPinLogin,
  onBack
}: {
  user: PreAuthUser;
  greeting: { text: string; Icon: LucideIcon };
  isDark: boolean;
  busy: boolean;
  error: string;
  onBiometricLogin: () => void;
  onPinLogin: () => void;
  onBack: () => void;
}) {
  const GreetingIcon = greeting.Icon;
  return (
    <motion.div
      key="greeting"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -48 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col items-center px-5 pb-10 pt-16"
    >
      {/* Iniciales con glow.
          NO se muestra la foto: este saludo se pinta SIN sesión, así que la foto
          sería obtenible por cualquiera que teclee números de empleado. El rol y
          la tienda se omiten por lo mismo. Ver publicUserPreAuth en lib/security. */}
      <div className="relative mb-5">
        <div
          className="absolute inset-0 rounded-full blur-3xl"
          style={{ background: "rgba(59,130,246,0.42)", transform: "scale(1.35)" }}
        />
        <div className="relative size-[112px] overflow-hidden rounded-full ring-4 ring-white/80 shadow-2xl">
          <div
            className="flex size-full items-center justify-center text-3xl font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)" }}
          >
            {user.avatar}
          </div>
        </div>
      </div>

      {/* Saludo dinámico */}
      <p className={`inline-flex items-center gap-1.5 text-base font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
        {greeting.text} <GreetingIcon size={15} />
      </p>
      <h1 className={`mt-1 text-2xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
        {user.name}
      </h1>

      {/* Botón biometría (si tiene registrada) */}
      {user.biometricEnabled ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onBiometricLogin}
          disabled={busy}
          aria-label="Entrar con autenticación biométrica"
          className="mt-6 flex min-h-[3.5rem] w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.38)] transition disabled:opacity-60"
        >
          <Fingerprint size={19} /> Entrar con Huella
        </motion.button>
      ) : null}

      {/* Separador */}
      <div className="mt-5 flex w-full max-w-sm items-center gap-3">
        <div className={`h-px flex-1 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
        <span className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          o usa tu PIN
        </span>
        <div className={`h-px flex-1 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
      </div>

      {/* Botón PIN outline */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={onPinLogin}
        className={`mt-4 flex min-h-[3.5rem] w-full max-w-sm items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-semibold transition ${
          isDark ? "border-slate-700 text-slate-200" : "border-blue-200 text-blue-700"
        }`}
      >
        <KeyRound size={19} /> Entrar con PIN
      </motion.button>

      {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
      <button
        type="button"
        onClick={onBack}
        className="mt-5 text-xs font-semibold text-muted transition hover:text-ink"
      >
        ← No soy yo
      </button>
    </motion.div>
  );
}
