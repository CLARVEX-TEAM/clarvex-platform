"use client";

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";

/**
 * Aviso global para registrar el correo.
 *
 * Existe porque el paso del inicio de sesión solo lo ve quien vuelve a entrar, y
 * hay gente con la sesión abierta desde hace semanas. Este los alcanza a todos.
 *
 * NO aparece para:
 *  - Quien ya tiene un correo real (`needsEmail` lo decide el servidor con
 *    `hasRealEmail`, que descarta el relleno `@clarvex.local`).
 *  - Sesiones demo: son cuentas COMPARTIDAS entre visitantes, y el correo de un
 *    visitante quedaría registrado para todos los demás.
 *  - Usuarios kiosko: son el celular de la tienda, no una persona. No hay un
 *    correo personal que registrar ahí.
 *
 * El descarte va en sessionStorage y no en localStorage a propósito: "Ahora no"
 * calla el aviso mientras dure esa sesión, no para siempre. Si se pudiera cerrar
 * definitivamente, quien lo cierre sin leerlo se queda sin forma de recuperar su
 * acceso y no vuelve a enterarse.
 */

const DISMISS_KEY = "clarvex-email-banner-dismissed";

type SessionUser = { needsEmail?: boolean; demo?: boolean; checklistOnly?: boolean };

export function EmailBanner() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* sessionStorage bloqueado: mejor mostrarlo que fallar */
    }
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: SessionUser } | null) => {
        const user = data?.user;
        if (cancelled || !user) return;
        if (user.needsEmail && !user.demo && !user.checklistOnly) setVisible(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* da igual: se cierra igual en esta vista */
    }
    setVisible(false);
  }

  async function save() {
    const value = email.trim();
    if (!value.includes("@") || !value.includes(".")) {
      setError("Escribe un correo válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDone(true);
      window.setTimeout(() => setVisible(false), 2200);
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : "No se pudo guardar el correo.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[190] flex justify-center px-3 bottom-[calc(84px+env(safe-area-inset-bottom))] lg:bottom-6 lg:justify-end lg:px-6">
      {/* `desk-adopt`: el aviso vive en el layout raíz, fuera del subárbol
          [data-surface="desk"]. Sin esta clase se pintaría con la paleta del
          móvil encima del lienzo del escritorio (ver desktop.css). */}
      <div className="desk-adopt pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-panel p-4 shadow-xl">
        {done ? (
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <Mail size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Correo guardado</p>
              <p className="text-xs text-muted">Si olvidas tu PIN, ahí te llegará el enlace.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-600">
                <Mail size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Registra tu correo</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Si algún día olvidas tu PIN, es la forma de volver a entrar por tu cuenta. Sin correo, tendrás que
                  esperar a que tu gerente te lo restablezca.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar el aviso"
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-line/50 hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>

            {open ? (
              <div className="mt-3">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save();
                  }}
                  className="mb-2 w-full rounded-xl border border-line bg-void px-3 py-2.5 text-sm text-ink outline-none transition focus:border-blue-500"
                />
                {error ? <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {busy ? "Guardando…" : "Guardar mi correo"}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Agregar mi correo
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
                >
                  Ahora no
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
