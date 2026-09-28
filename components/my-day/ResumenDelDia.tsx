"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Shirt } from "lucide-react";
import { ShineBorder } from "@/components/externos/shine-border";
import { ClimaChip } from "@/components/my-day/ClimaIntro";
import type { Clima } from "@/lib/clima";
import { money } from "@/lib/format";
import {
  avanceDelTurno,
  duracionCorta,
  faltanParaEntrar,
  momentoDelDia,
  type EntradaMomento
} from "@/lib/mi-dia-momento";

const ZONA_TIENDA = "America/Monterrey";

/**
 * Lo primero que se ve al abrir «Mi día»: UN número, y cuál es depende de la
 * hora.
 *
 * ⚠️ **La pantalla anterior enseñaba seis cifras a la vez y siempre las mismas.**
 * A las nueve de la mañana la venta del día valía `$0.00` --la tienda ni había
 * abierto-- y a las diez de la noche «te faltan $9,840» era un reproche sobre
 * una jornada terminada. El dato no estaba mal; estaba fuera de momento.
 *
 * Qué manda en cada uno lo decide `lib/mi-dia-momento.ts`, que se prueba solo:
 * una regla que depende del reloj no la comprueba nadie a mano.
 */

type Turno = { start: string | null; end: string | null; summary: string } | null;
type Asistencia = { status: string; leftAt: string | null } | null;
type Rendimiento = { sales: number; goal: number; transactions: number; pieces: number };
type Uniforme = { top: string; bottom: string } | null;

/** Minutos desde la medianoche EN MONTERREY, no en la zona del teléfono. */
function minutosEnLaTienda(fecha: Date): number {
  const partes = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ZONA_TIENDA
  }).formatToParts(fecha);
  const hora = Number(partes.find((parte) => parte.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((parte) => parte.type === "minute")?.value ?? 0);
  return hora * 60 + minuto;
}

/**
 * ⚠️ Un divisor en cero se enseña como «—», nunca como 0.
 *
 * Es la regla de los KPIs de toda la app: cero tickets no significa que el UPT
 * sea cero, significa que todavía no hay UPT. Pintar un cero inventa un dato
 * malo donde no hay dato.
 */
function razon(arriba: number, abajo: number, decimales = 2): string {
  if (!abajo) return "—";
  return (arriba / abajo).toFixed(decimales);
}

/**
 * El titular, SIN centavos.
 *
 * ⚠️ Es la única excepción a la regla de importes con centavos de este
 * proyecto, y conviene ver por qué no la contradice: esa regla existe porque
 * al redondear, **una columna dejaba de sumar su total** --se veía $31,356
 * donde el real era $31,355--. Aquí no hay columna que cuadrar: es una cifra
 * suelta a 58 px, donde `$32,620.00` no cabe en un teléfono de 360. Los
 * importes exactos siguen justo debajo, con sus centavos, y esos sí son los
 * que se comparan contra el Excel y el POS.
 */
function grande(valor: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(valor));
}

/**
 * Una cifra secundaria —tickets, piezas, UPT—.
 *
 * ⚠️ Va en BLANCO porque vive dentro del bloque de marca. Se definió con
 * `text-ink` cuando el resumen se pintaba sobre papel, y al meterlo en el
 * degradado se quedó en tinta oscura sobre azul: legible a duras penas, y solo
 * se vio al mirar la pantalla. Este helper está fuera del bloque, así que el
 * repaso de colores que hice ahí dentro no lo alcanzó.
 */
function Cifra({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div>
      <div className="text-[19px] font-semibold tabular-nums tracking-[-0.02em] text-white">{valor}</div>
      <div className="mt-0.5 text-xs text-white/70">{pie}</div>
    </div>
  );
}

/** El número grande, con su moneda en pequeño al lado. */
function Titular({ etiqueta, moneda, valor }: { etiqueta: string; moneda?: boolean; valor: string }) {
  return (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">{etiqueta}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {moneda ? <span className="text-[25px] font-semibold opacity-70">$</span> : null}
        <span className="text-[58px] font-bold leading-[0.95] tracking-[-0.035em] tabular-nums">
          {valor}
        </span>
      </div>
    </>
  );
}

function Barra({ avance, tono = "volt" }: { avance: number; tono?: "volt" | "mint" }) {
  return (
    <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${tono === "mint" ? "bg-mint" : "bg-white"}`}
        style={{ width: `${Math.min(100, Math.max(0, avance * 100))}%` }}
      />
    </div>
  );
}

export function ResumenDelDia({
  nombre,
  appVersion,
  shift,
  attendance,
  performance,
  uniform,
  clima
}: {
  nombre: string;
  appVersion: string;
  shift: Turno;
  attendance: Asistencia;
  performance: Rendimiento;
  uniform: Uniforme;
  clima?: Clima | null;
}) {
  /*
   * ⚠️ `null` hasta que el efecto corra, y no `new Date()` en el estado
   * inicial. El servidor pinta sin reloj del cliente; arrancar con una hora
   * haría que el HTML del servidor y el del cliente no coincidan, que es un
   * fallo de hidratación. Mientras tanto `momentoDelDia` devuelve `null` y aquí
   * se enseña el resumen neutro.
   */
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    // Cada minuto: la cuenta atrás y la línea de la jornada se mueven solas.
    // No es un sondeo a nadie --no sale ninguna petición--, solo el reloj.
    const reloj = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(reloj);
  }, []);

  const entrada: EntradaMomento = {
    minutosAhora: ahora ? minutosEnLaTienda(ahora) : null,
    inicio: shift?.start ?? null,
    fin: shift?.end ?? null,
    estadoAsistencia: attendance?.status ?? null,
    salida: attendance?.leftAt ?? null
  };

  const momento = momentoDelDia(entrada);
  const falta = Math.max(0, performance.goal - performance.sales);
  const avance = performance.goal > 0 ? performance.sales / performance.goal : null;
  const sobrante = performance.sales - performance.goal;

  const saludo = momento === "cierre" ? "Cerraste" : momento === "antes" ? "Buen día" : "Hola";

  return (
    <header className="pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[25px] font-semibold tracking-[-0.02em] text-ink">
            {saludo}, {nombre}
          </h1>
          {clima ? <div className="mt-1.5"><ClimaChip clima={clima} /></div> : null}
        </div>
      </div>

      {/*
        El bloque que manda, con el degradado del LOGOTIPO y su marca de agua.
        Es la MISMA pieza que abre Conteos y Checklist: tres pantallas, un solo
        sitio donde vive la cifra del día, así que el ojo no tiene que
        aprenderse una composición por pantalla.
      */}
      <div className="papel-hero papel-elev-alta relative mt-6 overflow-hidden rounded-[26px] px-6 py-6">
        <svg
          aria-hidden
          viewBox="0 0 512 512"
          className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.07]"
        >
          <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
        </svg>
        <ShineBorder borderWidth={2} duration={13} shineColor={["#FFFFFF", "#8BB8FF", "#FFFFFF"]} />
        <div className="relative">
        {momento === null ? (
          /*
           * ⚠️ El primer pintado de CADA carga pasa por aquí, así que no puede
           * ser un hueco vacío que salte: ocupa el mismo alto que el titular
           * real. Sin esto la pantalla da un tirón al llegar el reloj.
           */
          <div aria-hidden className="h-[104px] animate-pulse rounded-2xl bg-white/15" />
        ) : momento === "libre" ? (
          <>
            {/*
              ⚠️ Aquí NO se usa el titular grande. Los 58 px están medidos para
              dígitos --`9,840`, `1 h 20 m`--; una PALABRA a ese tamaño se sale
              de un teléfono de 412 px. Y además no hace falta gritar: quien
              descansa no tiene ninguna cifra que perseguir.
            */}
            <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">Hoy</div>
            <p className="mt-2 text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">Descansas</p>
            <p className="mt-3 text-sm opacity-80">
              {shift?.summary ?? "No tienes turno cargado para hoy."}
            </p>
          </>
        ) : momento === "antes" ? (
          <>
            <Titular etiqueta="Entras en" valor={duracionCorta(faltanParaEntrar(entrada) ?? 0)} />
            <p className="mt-3 text-sm opacity-80">
              Turno de <span className="font-semibold">{shift?.start} a {shift?.end}</span>
            </p>
            {/*
              ⚠️ Antes de salir de casa lo único accionable es qué ponerse. La
              venta del día todavía vale $0 y enseñarla en grande no informa de
              nada: parece que se va perdiendo desde antes de abrir.
            */}
            {uniform ? (
              <Link
                href="/uniformes"
                className="tappable mt-5 flex min-h-16 items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Shirt size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs opacity-80">Uniforme de hoy</span>
                  <span className="mt-0.5 block truncate text-sm font-semibold">
                    {uniform.top} · {uniform.bottom}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 opacity-80" />
              </Link>
            ) : null}
            {performance.goal > 0 ? (
              <div className="mt-5 flex items-baseline justify-between border-t border-white/20 pt-4 text-sm">
                <span className="opacity-80">Meta de la tienda</span>
                <span className="font-semibold tabular-nums">{money(performance.goal)}</span>
              </div>
            ) : null}
          </>
        ) : momento === "turno" ? (
          <>
            {/*
              ⚠️ Sin meta NO se pinta ni barra ni porcentaje. Con meta en cero,
              la versión anterior enseñaba «0 %» y una barra vacía, que se lee
              como «vas malísimo» cuando lo que pasa es que no hay con qué
              comparar.
            */}
            {performance.goal > 0 ? (
              <>
                <Titular etiqueta="Te faltan hoy" moneda valor={grande(falta)} />
                <Barra avance={avance ?? 0} />
                <div className="mt-2.5 flex items-baseline justify-between text-sm">
                  <span className="font-medium tabular-nums">{money(performance.sales)}</span>
                  <span className="tabular-nums opacity-80">meta {money(performance.goal)}</span>
                </div>
              </>
            ) : (
              <>
                <Titular etiqueta="Llevas hoy" moneda valor={grande(performance.sales)} />
                <p className="mt-3 text-sm opacity-80">La meta de hoy todavía no está cargada.</p>
              </>
            )}

            {/* La jornada como una línea: dónde estoy del día, sin leer números. */}
            {shift?.start && shift.end && avanceDelTurno(entrada) !== null ? (
              <div className="mt-6">
                <div className="relative h-[3px] rounded-full bg-white/25">
                  <div
                    className="absolute left-0 top-0 h-[3px] rounded-full bg-white/70"
                    style={{ width: `${(avanceDelTurno(entrada) ?? 0) * 100}%` }}
                  />
                  <div
                    className="absolute top-[-4px] size-[11px] -translate-x-1/2 rounded-full bg-white ring-4 ring-[#1458BD]"
                    style={{ left: `${(avanceDelTurno(entrada) ?? 0) * 100}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between text-xs tabular-nums opacity-80">
                  <span>{shift.start}</span>
                  <span>{shift.end}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex gap-7">
              <Cifra valor={String(performance.transactions)} pie="tickets" />
              <Cifra valor={String(performance.pieces)} pie="piezas" />
              <Cifra valor={razon(performance.pieces, performance.transactions)} pie="UPT" />
            </div>
          </>
        ) : (
          <>
            {/*
              Al cerrar, el número deja de ser «cuánto falta» y pasa a ser
              «cuánto se hizo». El verde aparece SOLO aquí, y solo si de verdad
              se pasó la meta: usado en todas partes deja de significar algo.
            */}
            <Titular etiqueta="Vendieron hoy" moneda valor={grande(performance.sales)} />
            {performance.goal > 0 ? (
              <>
                <Barra avance={avance ?? 0} tono={sobrante >= 0 ? "mint" : "volt"} />
                <div className="mt-2.5 flex items-baseline justify-between text-sm">
                  <span className={sobrante >= 0 ? "font-medium text-mint" : "opacity-80"}>
                    {sobrante >= 0
                      ? `Pasaron la meta por ${money(sobrante)}`
                      : `Faltaron ${money(-sobrante)} para la meta`}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.round((performance.sales / performance.goal) * 100)}%
                  </span>
                </div>
              </>
            ) : null}
            <div className="mt-6 flex gap-7">
              <Cifra valor={String(performance.transactions)} pie="tickets" />
              <Cifra valor={String(performance.pieces)} pie="piezas" />
              <Cifra valor={razon(performance.pieces, performance.transactions)} pie="UPT" />
            </div>
          </>
        )}
        </div>
      </div>

      {/* La versión, al pie y en pequeño: solo sirve al dar soporte. */}
      <p className="mt-6 text-[11px] text-muted">Clarvex {appVersion}</p>
    </header>
  );
}
