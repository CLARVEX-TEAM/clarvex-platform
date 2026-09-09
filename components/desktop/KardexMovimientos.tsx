"use client";

import { AlertTriangle, Check, Sigma, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DeskEmpty, deskTd, deskTdMuted, deskTh, deskThRight, deskThead, deskTr } from "@/components/desktop/DeskUI";
import { MOVEMENT_LABELS, pieces, shortDay, signedPieces, type KardexMovement } from "@/components/desktop/useKardex";
import { resumirSeleccion, rangoVisible, tiposDesconocidos } from "@/lib/kardex-seleccion";
import { cn } from "@/lib/utils";

/**
 * Los movimientos de la ronda, filtrables y sumables a mano.
 *
 * Lo pidió la tienda con estas palabras: «filtro por entregas y quiero saber
 * cuántas fueron por día; selecciono las filas de unos días específicos y ya sé
 * cuántas son». Es lo que se hacía marcando celdas en el Excel, y el resumen
 * del kardex no lo cubre: da los totales de la RONDA entera, no los de tres
 * días sueltos.
 *
 * ⚠️ **Filtrar y seleccionar no son lo mismo, y la barra suma lo SELECCIONADO.**
 * Sumar lo filtrado cuando hay filas marcadas enseñaría un total que no
 * corresponde a nada de lo que se ve en pantalla. Sin nada marcado, la barra no
 * aparece: un total que sale solo invita a leerlo sin saber de qué es.
 */

/** Los tipos que esta pantalla sabe interpretar, en el orden en que se enseñan. */
const TIPOS = [
  "RECEPCION",
  "TRANSFERENCIA_ENTRADA",
  "DEVOLUCION_CLIENTE",
  "TRANSFERENCIA_SALIDA",
  "SFS",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO"
] as const;

export function KardexMovimientos({
  movements,
  truncated
}: {
  movements: KardexMovement[];
  truncated: boolean;
}) {
  const [tipo, setTipo] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  // El ancla de shift+clic. En una ref y no en estado: cambiarla no tiene que
  // repintar nada, y dentro del estado provocaría un render por cada clic.
  const ancla = useRef<string | null>(null);

  const visibles = useMemo(
    () => (tipo === null ? movements : movements.filter((m) => m.type === tipo)),
    [movements, tipo]
  );

  // ⚠️ Solo se resume lo que está marcado Y visible. Al cambiar de filtro, una
  // fila marcada que deja de verse no puede seguir contando: el total hablaría
  // de algo que no está en la tabla.
  const seleccionados = useMemo(() => visibles.filter((m) => marcados.has(m.id)), [visibles, marcados]);
  const resumen = useMemo(() => resumirSeleccion(seleccionados), [seleccionados]);
  const desconocidos = useMemo(() => tiposDesconocidos(seleccionados, [...TIPOS]), [seleccionados]);

  const conteoPorTipo = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const movimiento of movements) cuenta.set(movimiento.type, (cuenta.get(movimiento.type) ?? 0) + 1);
    return cuenta;
  }, [movements]);

  const todosMarcados = visibles.length > 0 && visibles.every((m) => marcados.has(m.id));

  function alternar(id: string, conShift: boolean) {
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      const ids = conShift && ancla.current ? rangoVisible(visibles.map((m) => m.id), ancla.current, id) : [id];
      // Un rango PONE; un clic suelto alterna. Es lo que hace una hoja de
      // cálculo, y alternar cada fila del rango dejaría el tramo a cuadros.
      const encender = conShift && ancla.current ? true : !previo.has(id);
      for (const cada of ids) {
        if (encender) siguiente.add(cada);
        else siguiente.delete(cada);
      }
      return siguiente;
    });
    ancla.current = id;
  }

  function alternarTodos() {
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      for (const movimiento of visibles) {
        if (todosMarcados) siguiente.delete(movimiento.id);
        else siguiente.add(movimiento.id);
      }
      return siguiente;
    });
    ancla.current = null;
  }

  function limpiar() {
    setMarcados(new Set());
    ancla.current = null;
  }

  if (movements.length === 0) return <DeskEmpty title="Todavía no hay movimientos en esta ronda" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip activo={tipo === null} onClick={() => setTipo(null)}>
          Todos <span className="tabular-nums opacity-60">{movements.length}</span>
        </Chip>
        {TIPOS.filter((cada) => conteoPorTipo.has(cada)).map((cada) => (
          <Chip key={cada} activo={tipo === cada} onClick={() => setTipo(tipo === cada ? null : cada)}>
            {MOVEMENT_LABELS[cada] ?? cada} <span className="tabular-nums opacity-60">{conteoPorTipo.get(cada)}</span>
          </Chip>
        ))}
      </div>

      {truncated ? (
        <p className="flex items-start gap-2 rounded-xl border border-warn/40 px-3 py-2 text-caption text-muted">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          Esta ronda tiene más movimientos de los que caben en la pantalla, así que lo que se marque aquí
          no suma la ronda entera. El total completo va en el kardex que se exporta.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem]">
          <thead className={deskThead}>
            <tr>
              <th className={cn(deskTh, "w-8")}>
                <Casilla
                  marcada={todosMarcados}
                  onChange={alternarTodos}
                  etiqueta={todosMarcados ? "Quitar la marca de todo lo visible" : "Marcar todo lo visible"}
                />
              </th>
              <th className={deskTh}>Día</th>
              <th className={deskTh}>Movimiento</th>
              <th className={deskThRight}>Piezas</th>
              <th className={deskTh}>Folio</th>
              <th className={deskTh}>Contraparte</th>
              <th className={deskTh}>Quién</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((movimiento) => {
              const marcada = marcados.has(movimiento.id);
              return (
                <tr
                  key={movimiento.id}
                  className={cn(deskTr, "cursor-pointer", marcada && "bg-accent/5")}
                  onClick={(evento) => alternar(movimiento.id, evento.shiftKey)}
                >
                  <td className={deskTd}>
                    <Casilla
                      marcada={marcada}
                      onChange={() => alternar(movimiento.id, false)}
                      etiqueta={`Marcar el movimiento del ${shortDay(movimiento.date)}`}
                    />
                  </td>
                  <td className={marcada ? deskTd : deskTdMuted}>{shortDay(movimiento.date)}</td>
                  <td className={deskTd}>{MOVEMENT_LABELS[movimiento.type] ?? movimiento.type}</td>
                  <td className={cn(deskTd, "text-right tabular-nums")}>{pieces(movimiento.quantity)}</td>
                  <td className={deskTdMuted}>{movimiento.reference ?? "—"}</td>
                  <td className={deskTdMuted}>{movimiento.counterpart ?? "—"}</td>
                  <td className={deskTdMuted}>{movimiento.createdBy ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibles.length === 0 ? (
        <p className="py-6 text-center text-caption text-muted">No hay movimientos de ese tipo en esta ronda.</p>
      ) : null}

      {resumen.filas > 0 ? (
        <BarraSuma resumen={resumen} desconocidos={desconocidos} onLimpiar={limpiar} />
      ) : (
        <p className="text-caption text-muted">
          Marca las filas que quieras sumar. Con <kbd className="rounded border border-line px-1">Shift</kbd> se
          marca un tramo entero.
        </p>
      )}
    </div>
  );
}

/**
 * El total de lo marcado.
 *
 * ⚠️ **Cuando la selección mezcla entradas y salidas NO se enseña una sola
 * cifra.** Las piezas se guardan siempre en positivo y el sentido lo pone el
 * tipo, así que una recepción de 40 con un traspaso de salida de 10 daría «50
 * piezas»: ni lo que entró, ni lo que salió, ni el saldo. Ahí van las tres.
 */
function BarraSuma({
  resumen,
  desconocidos,
  onLimpiar
}: {
  resumen: ReturnType<typeof resumirSeleccion>;
  desconocidos: string[];
  onLimpiar: () => void;
}) {
  const soloSalidas = resumen.entradas === 0 && resumen.salidas > 0;
  return (
    <div className="sticky bottom-3 rounded-xl border border-accent/40 bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-ui text-ink">
          <Sigma size={14} className="text-accent" aria-hidden />
          <span className="tabular-nums font-medium">{resumen.filas}</span>
          <span className="text-muted">{resumen.filas === 1 ? "movimiento" : "movimientos"} en</span>
          <span className="tabular-nums font-medium">{resumen.porDia.length}</span>
          <span className="text-muted">{resumen.porDia.length === 1 ? "día" : "días"}</span>
        </p>
        <div className="flex items-center gap-4">
          {resumen.mezcla ? (
            <>
              <Cifra etiqueta="Entraron" valor={pieces(resumen.entradas)} />
              <Cifra etiqueta="Salieron" valor={pieces(resumen.salidas)} />
              <Cifra etiqueta="Saldo" valor={signedPieces(resumen.neto)} fuerte />
            </>
          ) : (
            <Cifra
              etiqueta={soloSalidas ? "Piezas que salieron" : "Piezas"}
              valor={pieces(soloSalidas ? resumen.salidas : resumen.entradas)}
              fuerte
            />
          )}
          <button
            type="button"
            onClick={onLimpiar}
            className="flex items-center gap-1 text-caption text-muted hover:text-ink"
          >
            <X size={13} aria-hidden />
            Quitar
          </button>
        </div>
      </div>

      {resumen.mezcla ? (
        <p className="mt-2 text-caption text-muted">
          La selección mezcla entradas y salidas. Se enseñan por separado porque sumarlas daría un número que no
          es ninguna de las dos cosas.
        </p>
      ) : null}

      {desconocidos.length > 0 ? (
        <p className="mt-2 flex items-start gap-2 text-caption text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          Hay movimientos de un tipo que esta pantalla no conoce ({desconocidos.join(", ")}) y se están contando
          como entradas. Confírmalo contra el kardex exportado.
        </p>
      ) : null}

      {resumen.porDia.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
          {resumen.porDia.map((dia) => (
            <span key={dia.date} className="text-caption text-muted">
              {shortDay(dia.date)}{" "}
              <span className="tabular-nums text-ink">
                {dia.entradas > 0 && dia.salidas > 0
                  ? signedPieces(dia.neto)
                  : pieces(dia.salidas > 0 ? dia.salidas : dia.entradas)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Cifra({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <span className="text-right">
      <span className="block text-caption text-muted">{etiqueta}</span>
      <span className={cn("block tabular-nums text-ink", fuerte ? "text-lg font-semibold" : "text-ui")}>{valor}</span>
    </span>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors",
        activo ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/**
 * La casilla.
 *
 * ⚠️ Detiene la propagación: la fila entera también alterna al hacer clic, y sin
 * esto un clic en la casilla dispararía las dos cosas y se quedaría igual que
 * estaba — que se lee como que la pantalla está rota.
 */
function Casilla({ marcada, onChange, etiqueta }: { marcada: boolean; onChange: () => void; etiqueta: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={marcada}
      aria-label={etiqueta}
      tabIndex={0}
      onClick={(evento) => {
        evento.stopPropagation();
        onChange();
      }}
      onKeyDown={(evento) => {
        if (evento.key !== " " && evento.key !== "Enter") return;
        evento.preventDefault();
        evento.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex h-4 w-4 cursor-pointer items-center justify-center rounded border transition-colors",
        marcada ? "border-accent bg-accent text-on-accent" : "border-line"
      )}
    >
      {marcada ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
    </span>
  );
}
