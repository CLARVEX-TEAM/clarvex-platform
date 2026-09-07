"use client";

import { motion } from "framer-motion";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { PinDots } from "./PinDots";
import { NumPad } from "./NumPad";

export function ConfirmStep({
  confirmPin,
  pin,
  error,
  isDark,
  card,
  physicalKeyboard,
  onKey
}: {
  confirmPin: string;
  pin: string;
  error: string;
  isDark: boolean;
  card: string;
  physicalKeyboard: boolean;
  onKey: (k: string) => void;
}) {
  return (
    <motion.div
      key="confirm"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -48 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="pt-safe flex min-h-screen flex-col"
    >
      <div className="flex flex-1 flex-col items-center justify-center px-5 pt-10">
        <div
          className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
        >
          <ClarvexIcon size={34} />
        </div>
        <p className="mb-5 text-[10px] font-semibold tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>

        <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
          <h2 className={`mb-1 text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
            Confirma tu PIN
          </h2>
          <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Ingresa el mismo PIN de nuevo
          </p>

          <PinDots filled={confirmPin.length} />

          {confirmPin.length === 4 && confirmPin !== pin ? (
            <p className="mt-3 text-center text-sm font-semibold text-red-500">Los PIN no coinciden</p>
          ) : null}
          {error ? <p className="mt-2 text-center text-sm font-semibold text-red-500">{error}</p> : null}
        </div>
      </div>

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
