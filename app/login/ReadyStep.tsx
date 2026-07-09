"use client";

import { motion } from "framer-motion";
import { BadgeCheck, LogIn } from "lucide-react";
import { Button } from "@/components/ui";

export function ReadyStep({
  error,
  isDark,
  card,
  onEnter
}: {
  error: string;
  isDark: boolean;
  card: string;
  onEnter: () => void;
}) {
  return (
    <motion.div
      key="ready"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col items-center justify-center px-5"
    >
      <div className={`w-full max-w-sm rounded-3xl p-8 text-center ${card}`}>
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-[1.35rem] border border-green-500/30 bg-green-500/15 text-green-500">
          <BadgeCheck size={28} />
        </div>
        <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>
          Listo para operar
        </h2>
        <p className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Tu PIN está guardado y tu sesión está activa.
        </p>
        {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
        <Button
          className="mt-6 w-full rounded-2xl"
          variant="primary"
          icon={<LogIn size={17} />}
          onClick={onEnter}
        >
          Entrar a CLARVEX
        </Button>
      </div>
    </motion.div>
  );
}
