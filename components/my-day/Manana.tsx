"use client";

import { Moon, Shirt, Sunrise } from "lucide-react";

/**
 * Mañana — el cierre de «Mi día».
 *
 * ⚠️ **Sustituye a «Todo lo demás»**, la rejilla de trece enlaces que estaba
 * aquí. Existía porque al sustituir `/advisor` y `/manager` por «Mi día» nueve
 * pantallas se quedaron sin ninguna puerta; ahora esa puerta es la pestaña
 * «Todo» de la barra inferior, así que la rejilla era la misma lista dos veces
 * -- y ocupaba media pantalla al final de la única que se abre a diario.
 *
 * Lo que va en su lugar contesta la pregunta que se hace justo ahí, al cerrar:
 * **¿entro mañana, a qué hora y qué me pongo?** Sale de datos que el endpoint
 * ya traía --la semana de uniformes se consultaba entera para quedarse con la
 * de hoy-- más una consulta del turno por el mismo índice único.
 *
 * ⚠️ **Es una tarjeta de TINTA, no otro degradado.** El bloque de arriba ya usa
 * el degradado del logo; dos en la misma pantalla se restan el uno al otro.
 * Invertida se lee como «esto es otro día» sin necesidad de decirlo, y cierra
 * la pantalla en vez de competir con su cabecera.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export type MananaDatos = {
  diaSemana: number;
  turno: { status: string; start: string | null; end: string | null } | null;
  uniforme: { top: string; bottom: string } | null;
};

export function Manana({ datos }: { datos: MananaDatos | null | undefined }) {
  /*
   * ⚠️ Sin horario cargado NO se enseña nada.
   *
   * `turno: null` significa «nadie ha capturado el horario», que no es lo mismo
   * que descansar. Pintar «Mañana descansas» sobre un hueco mandaría a alguien
   * a su casa un día que le tocaba entrar, y esta app ya ha pagado caro decir
   * algo con más seguridad de la que tiene.
   */
  if (!datos?.turno) return null;

  const trabaja = datos.turno.status === "WORKING";
  const horas = datos.turno.start
    ? `${datos.turno.start}${datos.turno.end ? ` – ${datos.turno.end}` : ""}`
    : null;
  const dia = DIAS[datos.diaSemana] ?? "mañana";

  return (
    <section className="papel-elev-alta mt-6 overflow-hidden rounded-[26px] bg-ink px-6 py-6 text-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
        Mañana · {dia}
      </p>

      <div className="mt-3 flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[14px] bg-card/12">
          {trabaja ? <Sunrise size={19} /> : <Moon size={19} />}
        </span>
        <div className="min-w-0">
          <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            {trabaja ? (horas ?? "Entras") : "Descansas"}
          </p>
          {trabaja && horas ? null : (
            <p className="mt-0.5 text-sm opacity-70">
              {trabaja ? "Sin hora capturada todavía" : "No tienes turno asignado"}
            </p>
          )}
        </div>
      </div>

      {/*
        El uniforme solo si se entra: qué ponerse un día que descansas no es
        información, es ruido sobre el día libre de alguien.
      */}
      {trabaja && datos.uniforme ? (
        <div className="mt-5 flex items-start gap-3 border-t border-card/12 pt-4">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[14px] bg-card/12">
            <Shirt size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-60">Uniforme</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">
              {datos.uniforme.top}
              <span className="opacity-50"> · </span>
              {datos.uniforme.bottom}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
