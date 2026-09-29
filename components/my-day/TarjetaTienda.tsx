"use client";

import { Store } from "lucide-react";
import { money } from "@/lib/format";
import type { VentaDeTienda } from "@/lib/venta-de-tienda";

/**
 * La venta de la TIENDA, debajo del recuadro personal. Solo gerencia.
 *
 * ⚠️ **Es una tarjeta APARTE y no un dato más del recuadro de arriba.** El
 * recuadro contesta «¿cómo voy yo?» y esta «¿cómo va la tienda?»: son dos
 * preguntas con dos dueños, y mezclarlas obligaba a elegir cuál de las dos
 * cifras es la grande. Separadas, el recuadro de arriba sigue siendo
 * exactamente el mismo que ve un asesor --una composición menos que mantener--
 * y esta puede crecer con el equipo sin apretar nada.
 *
 * ⚠️ **No se pinta si el servidor no la manda**, y no la manda a un asesor. La
 * visibilidad de verdad está en la consulta; esto solo es la pantalla.
 */
export function TarjetaTienda({ datos, esGerencia }: { datos: VentaDeTienda | null; esGerencia: boolean }) {
  /*
   * ⚠️ Sin captura NO se pinta «$0.00».
   *
   * Una tienda que todavía no ha capturado y una que lleva cero vendido se ven
   * idénticas con un cero delante, y son lo contrario: la primera no sabe nada
   * y la segunda sabe que no ha vendido. A media mañana lo normal es lo primero,
   * así que el cero mentiría casi todos los días antes de comer.
   */
  if (!datos) {
    /*
     * ⚠️ `datos` en `null` significa DOS cosas distintas y solo el rol las
     * separa: para un asesor es «esto no es para ti» --el servidor ni lo
     * consultó-- y para gerencia es «nadie ha capturado todavía». Sin el rol
     * aquí, o el asesor ve una tarjeta vacía que no le corresponde, o gerencia
     * se queda sin saber que la tienda va sin captura.
     */
    if (!esGerencia) return null;
    return (
      <section className="mt-4 rounded-[26px] border border-line bg-card px-5 py-5">
        <Encabezado />
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Todavía no hay KPIs capturados hoy. En cuanto entre la primera captura aparece aquí.
        </p>
      </section>
    );
  }

  /*
   * ⚠️ Sin meta NO hay barra ni porcentaje, igual que en el recuadro de arriba.
   * Con la meta en cero, un «0 %» sobre una barra vacía se lee como «vamos
   * malísimo» cuando lo que pasa es que no hay con qué comparar.
   */
  const hayMeta = datos.meta > 0;
  const avance = hayMeta ? datos.venta / datos.meta : null;
  const falta = Math.max(0, datos.meta - datos.venta);

  /*
   * La escala de las barras del equipo es la venta MAYOR, no la meta: sirven
   * para comparar entre personas, que es lo único que se mira en esa lista.
   * Con todo el mundo en cero no hay nada que escalar y se quedan vacías.
   */
  const mayor = Math.max(...datos.personas.map((persona) => persona.venta), 0);

  return (
    <section className="mt-4 rounded-[26px] border border-line bg-card px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <Encabezado />
        {avance !== null ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
            {Math.round(avance * 100)} %
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
        {money(datos.venta)}
      </p>
      {hayMeta ? (
        <p className="mt-1.5 text-sm font-medium text-muted">
          de {money(datos.meta)}
          {falta > 0 ? <> · faltan <span className="text-ink">{money(falta)}</span></> : null}
        </p>
      ) : (
        <p className="mt-1.5 text-sm font-medium text-muted">La meta de hoy todavía no está cargada.</p>
      )}

      {avance !== null ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-panel">
          <div
            className="h-2 rounded-full bg-volt transition-[width] duration-500"
            style={{ width: `${Math.max(0, Math.min(1, avance)) * 100}%` }}
          />
        </div>
      ) : null}

      <div className="mt-5 flex gap-7 border-t border-line pt-4">
        <Cifra valor={String(datos.tickets)} pie="tickets" />
        <Cifra valor={String(datos.piezas)} pie="piezas" />
        <Cifra valor={datos.tickets > 0 ? (datos.piezas / datos.tickets).toFixed(2) : "—"} pie="UPT" />
      </div>

      <div className="mt-5 space-y-2.5 border-t border-line pt-4">
        {datos.personas.map((persona) => (
          <div key={persona.nombre} className="flex items-center gap-3">
            <span
              className={`w-16 shrink-0 truncate text-xs ${persona.esTuyo ? "font-bold text-volt" : "font-semibold text-ink"}`}
            >
              {persona.nombre.split(" ")[0]}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
              <span
                className={`block h-1.5 rounded-full ${persona.esTuyo ? "bg-volt" : "bg-volt/45"}`}
                /* Una venta negativa no dibuja barra: no hay «menos que vacío». */
                style={{ width: mayor > 0 ? `${(Math.max(0, persona.venta) / mayor) * 100}%` : "0%" }}
              />
            </span>
            <span className="w-[86px] shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
              {money(persona.venta)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Encabezado() {
  return (
    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
      <Store size={14} className="text-volt" /> La tienda hoy
    </span>
  );
}

function Cifra({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div>
      <div className="text-[19px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{valor}</div>
      <div className="mt-0.5 text-xs text-muted">{pie}</div>
    </div>
  );
}
