"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { PinDots } from "./PinDots";
import { NumPad } from "./NumPad";

export function PinStep({
  pin,
  requiresPinSetup,
  error,
  isDark,
  card,
  physicalKeyboard,
  onKey
}: {
  pin: string;
  requiresPinSetup: boolean;
  error: string;
  isDark: boolean;
  card: string;
  physicalKeyboard: boolean;
  onKey: (k: string) => void;
}) {
  return (
    <motion.div
      key="pin"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -48 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col"
    >
      {/* Sección superior */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 pt-10">
        {/* Logo pequeño */}
        <div
          className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
        >
          <ClarvexIcon size={34} />
        </div>
        <p className="mb-5 text-[10px] font-semibold tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>

        {/* Card con dots */}
        <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={16} />
            <span className="text-sm font-semibold text-blue-700">Acceso seguro</span>
          </div>
          <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {requiresPinSetup ? "Crea tu PIN personal de 4 dígitos" : "Ingresa tu PIN personal"}
          </p>

          <PinDots filled={pin.length} />

          {error ? <p className="mt-3 text-center text-sm font-semibold text-red-500">{error}</p> : null}

          {!requiresPinSetup ? (
            <p className={`mt-4 text-center text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>
              ¿Olvidaste tu PIN? Contacta al administrador
            </p>
          ) : null}
        </div>
      </div>

      {/* Teclado: numérico en táctil; en escritorio se usa el teclado físico */}
      <div className="pb-10 pt-5">
        {physicalKeyboard ? (
          <p className={`text-center text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Escribe tu PIN con el teclado
          </p>
        ) : (
          <NumPad onKey={onKey} />
        )}
      </div>
    </motion.div>
  );
}
