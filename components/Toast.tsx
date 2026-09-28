"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };
type ToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Lanza un toast: `toast("Guardado")` o `toast("No se pudo", "error")`. */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return fn;
}

const styles: Record<ToastType, { ring: string; icon: string; Icon: typeof Check }> = {
  success: { ring: "ring-mint/30", icon: "bg-mint text-white", Icon: Check },
  error: { ring: "ring-orchid/30", icon: "bg-orchid text-white", Icon: AlertTriangle },
  info: { ring: "ring-volt/30", icon: "bg-volt text-white", Icon: Info }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastFn>((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    haptic(type === "error" ? "error" : type === "info" ? "light" : "success");
    window.setTimeout(() => remove(id), 3600);
  }, [remove]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-80 flex flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const style = styles[toast.type];
            return (
              <motion.button
                key={toast.id}
                type="button"
                layout
                initial={{ opacity: 0, y: -24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 460, damping: 30 }}
                onClick={() => remove(toast.id)}
                className={cn(
                  "liquid-glass pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-3.5 py-3 text-left shadow-[0_12px_30px_rgb(15_23_42/0.16)] ring-1",
                  style.ring
                )}
              >
                <motion.span
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 480, damping: 18, delay: 0.05 }}
                  className={cn("grid size-7 shrink-0 place-items-center rounded-full", style.icon)}
                >
                  <style.Icon size={16} />
                </motion.span>
                <span className="min-w-0 flex-1 text-[13px] font-bold leading-5 text-ink">{toast.message}</span>
                <X size={15} className="shrink-0 text-muted" />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
