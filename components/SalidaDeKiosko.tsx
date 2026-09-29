"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { logout } from "@/lib/auth";
import { Capa } from "@/components/Capa";

/**
 * Cerrar la sesión del celular KIOSKO, con el PIN de gerencia.
 *
 * ⚠️ **Por qué existe.** El kiosko es el aparato compartido de la tienda y su
 * sesión es la única puerta a Checklist y Conteos. Cualquiera del equipo podía
 * cerrarla y entrar con SU cuenta personal --que para eso tienen su teléfono--,
 * dejando el kiosko fuera de servicio hasta que alguien de gerencia volviera a
 * abrirlo. Y no dejaba rastro de quién lo hizo.
 *
 * ⚠️ **Esto es la PANTALLA del candado, no el candado.** Quien decide es
 * `DELETE /api/auth/session`, que exige el PIN cuando la sesión es de kiosko y
 * cuenta los intentos fallidos igual que el login. Si esta pantalla se pudiera
 * saltar, no pasaría nada: la petición se rechaza igual.
 *
 * ⚠️ **No se pide «la contraseña del kiosko» sino la de GERENCIA.** El PIN del
 * kiosko lo sabe todo el equipo --lo teclean cada día--, así que pedirlo no
 * frenaría a nadie. Y el servidor exige además que sea de ESTA tienda: si no,
 * el PIN de gerencia de cualquier sucursal abriría el kiosko de todas.
 */
export function SalidaDeKiosko({ abierto, onCancelar }: { abierto: boolean; onCancelar: () => void }) {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!abierto) return null;

  async function salir() {
    setError("");
    setEnviando(true);
    const resultado = await logout({ employeeNumber: employeeNumber.trim(), pin });
    if (resultado.ok) {
      /*
       * ⚠️ `replace`, no `push`: con `push`, el botón físico de atrás vuelve a
       * una pantalla cuya sesión ya no existe --401, y se lee como que la app
       * se rompió--.
       */
      router.replace("/login");
      return;
    }
    setError(resultado.error);
    setPin("");
    setEnviando(false);
  }

  return (
    <Capa>
      <div className="fixed inset-0 z-70 flex items-end justify-center bg-black/60 p-4 backdrop-blur-xs sm:items-center">
        <div className="w-full max-w-sm rounded-3xl border border-line bg-card p-6 shadow-2xl">
          <span className="grid size-12 place-items-center rounded-2xl bg-volt/10 text-volt"><ShieldCheck size={22} /></span>
          <h2 className="mt-4 text-lg font-semibold text-ink">Cerrar sesión del equipo</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Este es el teléfono de la tienda. Solo gerencia puede cerrarlo, con su número de empleado y su PIN.
          </p>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Número de empleado</span>
              <input
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className="min-h-12 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-hidden focus:border-volt"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">PIN</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className="min-h-12 rounded-2xl border border-line bg-panel px-3 text-lg font-bold tracking-[0.3em] text-ink outline-hidden focus:border-volt"
              />
            </label>
          </div>

          {error ? <p className="mt-3 text-xs font-semibold text-orchid">{error}</p> : null}

          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => void salir()}
              disabled={enviando || !employeeNumber.trim() || pin.length < 4}
              className="tappable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orchid text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              <LogOut size={17} /> {enviando ? "Cerrando…" : "Cerrar sesión"}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              disabled={enviando}
              className="tappable min-h-12 rounded-2xl bg-panel text-sm font-semibold text-ink transition active:scale-[0.99] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Capa>
  );
}
