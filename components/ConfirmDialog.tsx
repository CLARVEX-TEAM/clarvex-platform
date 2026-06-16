"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { DeleteButton } from "@/components/ActionButtons";

/**
 * ConfirmDialog — confirmación destructiva animada (reemplaza window.confirm).
 * El botón de confirmar es un DeleteButton: la papelera se sacude mientras
 * `loading` (borrando), así la animación SÍ se ve. Hoja inferior en móvil,
 * centrado en pantallas grandes.
 */
export function ConfirmDialog({
  open,
  title,
  description = "Esta acción no se puede deshacer.",
  confirmLabel = "Eliminar",
  loading = false,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !loading) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={loading ? undefined : onCancel}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative w-full max-w-sm rounded-3xl border border-line bg-white dark:bg-slate-900 p-6 shadow-2xl"
          >
            <motion.span
              initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 16, delay: 0.06 }}
              className="grid size-12 place-items-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
            >
              <AlertTriangle size={24} />
            </motion.span>
            <h3 className="mt-3 text-lg font-black text-ink">{title}</h3>
            <p className="mt-1.5 text-sm text-muted">{description}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="tappable min-h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-black text-ink disabled:opacity-55"
              >
                Cancelar
              </button>
              <DeleteButton type="button" variant="solid" loading={loading} onClick={onConfirm} className="min-h-12 w-full">
                {confirmLabel}
              </DeleteButton>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
