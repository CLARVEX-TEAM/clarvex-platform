"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { DeleteButton } from "@/components/ActionButtons";

/**
 * ConfirmDialog — confirmación destructiva animada (reemplaza window.confirm).
 *
 * Construido sobre Base UI. La versión anterior era propia y, aunque tenía
 * `role="alertdialog"`, `aria-modal` y cierre con Escape, le faltaba lo que no
 * se ve pero se nota:
 *
 *  - Atrapar el foco: con Tab se salía al contenido de detrás, que sigue ahí.
 *  - Devolver el foco al elemento que abrió el diálogo al cerrarse.
 *  - Bloquear el scroll del fondo.
 *  - Marcar el resto de la página como inerte para lectores de pantalla.
 *
 * Base UI aporta las cuatro. El ASPECTO no cambia: mismas clases, mismos
 * colores, misma animación de framer-motion. Base UI es headless — no trae
 * ninguna opinión visual, que es justo por lo que se eligió frente a shadcn.
 *
 * `render` sustituye el nodo por defecto de Base UI por el de framer-motion,
 * conservando accesibilidad y animación a la vez.
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
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Mientras borra no se puede cerrar: evita dejar la operación a medias
        // por un Escape o un toque fuera.
        if (!next && !loading) onCancel();
      }}
    >
      <AnimatePresence>
        {open ? (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-70 bg-black/50 backdrop-blur-xs"
                />
              }
            />
            <div className="fixed inset-0 z-70 flex items-end justify-center p-4 sm:items-center pointer-events-none">
              <Dialog.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, y: 28, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="pointer-events-auto relative w-full max-w-sm rounded-3xl border border-line bg-white p-6 shadow-2xl dark:bg-panel"
                  />
                }
              >
                <motion.span
                  initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 16, delay: 0.06 }}
                  className="grid size-12 place-items-center rounded-2xl bg-orchid/10 text-orchid"
                >
                  <AlertTriangle size={24} />
                </motion.span>

                <Dialog.Title className="mt-3 text-lg font-semibold text-ink">{title}</Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm text-muted">{description}</Dialog.Description>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="tappable min-h-12 rounded-2xl bg-panel text-sm font-semibold text-ink disabled:opacity-55"
                  >
                    Cancelar
                  </button>
                  <DeleteButton type="button" variant="solid" loading={loading} onClick={onConfirm} className="min-h-12 w-full">
                    {confirmLabel}
                  </DeleteButton>
                </div>
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
