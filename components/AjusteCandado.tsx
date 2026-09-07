"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { biometriaNativa, enContenedorNativo } from "@/lib/puente-nativo";
import { candadoActivado, guardarCandado } from "@/lib/candado-huella";

/**
 * El interruptor del candado de huella, en Perfil.
 *
 * ⚠️ **Solo aparece dentro de la app y con huella registrada.** En el navegador
 * y en la PWA no hay candado que ofrecer, y enseñar un interruptor que no hace
 * nada es peor que no enseñarlo.
 *
 * ⚠️ **Se activa a mano, no por omisión.** En el celular compartido de la
 * tienda, el candado lo abre CUALQUIER huella registrada en ese teléfono: si
 * dos personas tienen la suya puesta, las dos entran a la sesión de quien esté
 * dentro. Encenderlo solo es buena idea en un teléfono de una sola persona, y
 * esa es una decisión que no puede tomar el programa.
 */
export function AjusteCandado() {
  const [visible, setVisible] = useState(false);
  const [activo, setActivo] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!enContenedorNativo()) return;
    const bio = biometriaNativa();
    if (!bio) return;
    void bio
      .disponible()
      .then(({ puede, motivo }) => {
        if (puede) {
          setVisible(true);
          setActivo(candadoActivado());
          return;
        }
        // ⚠️ «No tiene lector» y «no hay huella registrada» son dos cosas
        // distintas: la primera no tiene arreglo y la segunda se resuelve en
        // los ajustes en un minuto. Callar las dos igual deja a alguien
        // pensando que su teléfono no puede, cuando sí puede.
        if (motivo === "sin-registrar") {
          setVisible(true);
          setAviso("Este teléfono no tiene ninguna huella registrada todavía. Se añade en los ajustes de Android.");
        }
      })
      .catch(() => undefined);
  }, []);

  if (!visible) return null;

  function cambiar(valor: boolean) {
    setActivo(valor);
    guardarCandado(valor);
  }

  return (
    <div className="mb-3 rounded-2xl border border-line bg-panel p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt/12 text-volt">
          <Fingerprint size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">Bloquear con huella</h2>
          <p className="text-xs text-muted">Pedirla al abrir la app.</p>
        </div>
        {!aviso && (
          <button
            role="switch"
            aria-checked={activo}
            aria-label="Bloquear con huella al abrir la app"
            onClick={() => cambiar(!activo)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${activo ? "bg-volt" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] ${activo ? "left-[22px]" : "left-0.5"}`}
            />
          </button>
        )}
      </div>

      {aviso ? (
        <p className="mt-2 text-xs text-muted">{aviso}</p>
      ) : (
        activo && (
          // ⚠️ Se dice en la pantalla, no solo en el código: quien active esto
          // en el teléfono del mostrador tiene que saber qué está aceptando.
          <p className="mt-2 text-xs text-muted">
            En un teléfono compartido, cualquier huella registrada en el aparato podrá abrirlo.
          </p>
        )
      )}
    </div>
  );
}
