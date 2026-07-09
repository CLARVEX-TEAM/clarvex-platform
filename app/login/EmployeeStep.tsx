"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { Button } from "@/components/ui";

export function EmployeeStep({
  employeeNumber,
  setEmployeeNumber,
  onSubmit,
  error,
  busy,
  isDark,
  card
}: {
  employeeNumber: string;
  setEmployeeNumber: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  error: string;
  busy: boolean;
  isDark: boolean;
  card: string;
}) {
  return (
    <motion.div
      key="employee"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
    >
      {/* Logo circular */}
      <motion.div
        initial={{ opacity: 0, scale: 0.75 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10 flex flex-col items-center"
      >
        <div
          className="flex size-[80px] items-center justify-center rounded-full shadow-[0_12px_40px_rgba(37,99,235,0.38)]"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
        >
          <ClarvexIcon size={44} />
        </div>
        <p className="mt-3 text-[11px] font-black tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-sm rounded-3xl p-6 ${card}`}
      >
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={16} />
          <span className="text-sm font-black text-blue-700">Acceso seguro</span>
        </div>
        <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Ingresa tu número de empleado
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label htmlFor="employee-number" className="sr-only">Número de empleado</label>
          <input
            id="employee-number"
            type="tel"
            value={employeeNumber}
            onChange={(e) => {
              setEmployeeNumber(e.target.value.replace(/\D/g, ""));
            }}
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            placeholder="ej. 81893"
            className={`min-h-14 w-full rounded-2xl border px-4 text-center text-xl font-black tracking-[0.18em] outline-none shadow-inner transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
              isDark
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-200 bg-slate-50 text-slate-900"
            }`}
          />
          {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
          <Button
            className="w-full rounded-2xl"
            type="submit"
            variant="primary"
            loading={busy}
            disabled={busy || !employeeNumber}
          >
            Continuar
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}
