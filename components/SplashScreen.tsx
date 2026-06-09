"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(155deg, #eff6ff 0%, #dbeafe 45%, #bfdbfe 78%, #93c5fd 100%)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.84, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-5"
          >
            <div className="grid size-24 place-items-center rounded-[32px] border border-white/80 bg-white/65 shadow-[0_12px_40px_rgb(37_99_235_/_0.22)] backdrop-blur-sm">
              <Sparkles size={38} className="text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.45em] text-blue-500/80">CLARVEX</p>
              <h1 className="mt-0.5 text-3xl font-black tracking-[-0.03em] text-slate-900">TEAM</h1>
              <p className="mt-2 text-xs font-semibold text-slate-400">Tu app de tienda</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.25 }}
            className="absolute bottom-16 h-0.5 w-20 origin-left rounded-full bg-blue-400/40"
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
