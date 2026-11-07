import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { firstName } from "@/lib/weekly-close";
import {
  analizarSemana,
  entradaSalida,
  etiquetaTurno,
  rangoSemana,
  totalMetas,
  trabajaEseDia,
  type DiaHorario,
  type DiaMeta,
  type DiaVenta
} from "@/lib/whatsapp-mensajes";
import { pesos, porcentaje } from "@/lib/whatsapp-formato";

/**
 * Las tarjetas en imagen de las metas y del cierre de semana: claras,
 * minimalistas, en pastel y con el logo de Clarvex.
 *
 * ⚠️ **Las cifras las dibuja el código, nunca un modelo de imagen.** Un modelo
 * escribe «$9,15S» con toda la confianza del mundo, y esto es dinero.
 *
 * ⚠️ Sin emojis: el motor de imagen no los trae y los dejaría como cuadros.
 */

const ANCHO = 1080;
const ALTO = 1350;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const C = {
  fondo: "#F7F6F2",
  tinta: "#1E2433",
  suave: "#6B7280",
  tenue: "#A8AEBB",
  linea: "#EEEDE8",
  blanco: "#FFFFFF",
  lavanda: "#E8E3FF",
  lavandaTinta: "#5B4BC4",
  cielo: "#DCEBFF",
  cieloTinta: "#2F6FD6",
  menta: "#D7F2E4",
  mentaTinta: "#1F7A4D",
  durazno: "#FFE5D6",
  duraznoTinta: "#B5562A",
  limon: "#FFF1C7",
  limonTinta: "#946A00",
  rosa: "#FDDDE1",
  rosaTinta: "#B4233C"
};

/** Pastel del estado: el mismo corte del semáforo de la app (100 % y 85 %). */
function estado(pct: number | null): { fondo: string; tinta: string; barra: string } {
  if (pct === null) return { fondo: C.linea, tinta: C.tenue, barra: "#E5E7EB" };
  if (pct >= 100) return { fondo: C.menta, tinta: C.mentaTinta, barra: "#9EDDBE" };
  if (pct >= 85) return { fondo: C.limon, tinta: C.limonTinta, barra: "#F3D37A" };
  return { fondo: C.rosa, tinta: C.rosaTinta, barra: "#F4B3BE" };
}

type Recursos = { fuentes: Array<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 700 }>; logo: string };
let recursos: Promise<Recursos> | null = null;

/** Se leen una vez por proceso. */
function cargarRecursos(): Promise<Recursos> {
  recursos ??= (async () => {
    const raiz = process.cwd();
    const fuente = (archivo: string) => readFile(path.join(raiz, "lib/assets/fuentes", archivo));
    const [r, m, s, b, logo] = await Promise.all([
      fuente("Geist-Regular.ttf"),
      fuente("Geist-Medium.ttf"),
      fuente("Geist-SemiBold.ttf"),
      fuente("Geist-Bold.ttf"),
      readFile(path.join(raiz, "public/branding/retool-logo-horizontal.png"))
    ]);
    return {
      fuentes: [
        { name: "Geist", data: r, weight: 400 },
        { name: "Geist", data: m, weight: 500 },
        { name: "Geist", data: s, weight: 600 },
        { name: "Geist", data: b, weight: 700 }
      ],
      logo: `data:image/png;base64,${logo.toString("base64")}`
    };
  })();
  return recursos;
}

async function aPng(dibujar: (logo: string) => React.ReactElement): Promise<Buffer> {
  const { fuentes, logo } = await cargarRecursos();
  const respuesta = new ImageResponse(dibujar(logo), { width: ANCHO, height: ALTO, fonts: fuentes });
  return Buffer.from(await respuesta.arrayBuffer());
}

/** Manchas pastel difuminadas: degradados radiales, sin imagen de fondo. */
function Manchas(props: { tonos: [string, string, string] }) {
  const mancha = (color: string, top: number, left: number, size: number) => (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: size,
        height: size,
        borderRadius: size,
        backgroundImage: `radial-gradient(circle, ${color} 0%, rgba(247,246,242,0) 70%)`
      }}
    />
  );
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: ANCHO, height: ALTO }}>
      {mancha(props.tonos[0], -260, 520, 900)}
      {mancha(props.tonos[1], 820, -320, 860)}
      {mancha(props.tonos[2], 980, 640, 640)}
    </div>
  );
}

function Marco(props: { logo: string; tienda: string; chip: string; chipFondo: string; chipTinta: string; tonos: [string, string, string]; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: ANCHO, height: ALTO, position: "relative", background: C.fondo, fontFamily: "Geist", color: C.tinta }}>
      <Manchas tonos={props.tonos} />
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "64px 72px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- motor de imagen, no una página */}
          <img src={props.logo} width={320} height={80} alt="" />
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 1.5,
              padding: "12px 24px",
              borderRadius: 999,
              background: props.chipFondo,
              color: props.chipTinta
            }}
          >
            {props.chip}
          </span>
        </div>
        {props.children}
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", fontSize: 22, color: C.tenue, letterSpacing: 1 }}>
          <span>team.clarvex.tech</span>
          <span>{props.tienda}</span>
        </div>
      </div>
    </div>
  );
}

function Titulo(props: { texto: string; nombre: string; rango: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
      <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1 }}>{props.texto}</span>
      <span style={{ fontSize: 32, color: C.suave, marginTop: 16 }}>
        {props.nombre} · {props.rango}
      </span>
    </div>
  );
}

function Tarjeta(props: { children: React.ReactNode; margenArriba?: number; relleno?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: props.margenArriba ?? 36,
        padding: props.relleno ?? "28px 36px",
        borderRadius: 40,
        background: C.blanco,
        border: `1px solid ${C.linea}`,
        boxShadow: "0 18px 50px rgba(30,36,51,0.06)"
      }}
    >
      {props.children}
    </div>
  );
}

function Barra(props: { fraccion: number; color: string; ancho?: number }) {
  const total = props.ancho ?? 240;
  const f = Math.max(0, Math.min(1, props.fraccion));
  return (
    <div style={{ display: "flex", width: total, height: 14, borderRadius: 999, background: "#F1F0EB" }}>
      <div style={{ display: "flex", width: f > 0 ? Math.max(f * total, 14) : 0, height: 14, borderRadius: 999, background: props.color }} />
    </div>
  );
}

function Fila(props: { primera: boolean; dia: Date; apagada: boolean; children: React.ReactNode; alto?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: props.alto ?? 72,
        borderTop: props.primera ? "none" : `1px solid ${C.linea}`
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", width: 260 }}>
        <span style={{ fontSize: 31, fontWeight: 600, color: props.apagada ? C.tenue : C.tinta }}>{DIAS[props.dia.getUTCDay()]}</span>
        <span style={{ fontSize: 26, color: C.tenue, marginLeft: 10 }}>{props.dia.getUTCDate()}</span>
      </div>
      {props.children}
    </div>
  );
}

function Pastilla(props: { texto: string; fondo: string; tinta: string }) {
  return (
    <span style={{ fontSize: 24, fontWeight: 600, padding: "8px 18px", borderRadius: 999, background: props.fondo, color: props.tinta }}>
      {props.texto}
    </span>
  );
}

// ── Metas de la semana ──────────────────────────────────────────────────────

export async function tarjetaMetas(opciones: {
  nombre: string;
  tienda: string;
  semana: number;
  inicio: Date;
  fin: Date;
  dias: DiaMeta[];
  actualizacion: boolean;
}): Promise<Buffer> {
  const total = totalMetas(opciones.dias);
  const mayor = Math.max(1, ...opciones.dias.filter((d) => !d.descansa).map((d) => d.meta));
  return aPng((logo) => (
    <Marco
      logo={logo}
      tienda={opciones.tienda}
      chip={`Semana ${opciones.semana}${opciones.actualizacion ? " · actualizada" : ""}`}
      chipFondo={C.lavanda}
      chipTinta={C.lavandaTinta}
      tonos={["#E4DEFF", "#D6E8FF", "#FFE2D2"]}
    >
      <Titulo texto="Tus metas" nombre={firstName(opciones.nombre)} rango={rangoSemana(opciones.inicio, opciones.fin)} />
      <Tarjeta margenArriba={40} relleno="30px 40px">
        <span style={{ fontSize: 24, color: C.suave, fontWeight: 500 }}>Meta de la semana</span>
        <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1, color: C.cieloTinta }}>{pesos(total)}</span>
      </Tarjeta>
      <Tarjeta margenArriba={24}>
        {opciones.dias.map((d, i) => (
          <Fila key={i} primera={i === 0} dia={d.fecha} apagada={d.descansa} alto={80}>
            {d.descansa ? (
              <Pastilla texto="Descanso" fondo="#F1F0EB" tinta={C.tenue} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", flexGrow: 1, justifyContent: "space-between" }}>
                <Barra fraccion={d.meta / mayor} color="#B9D4FF" />
                <span style={{ fontSize: 34, fontWeight: 600 }}>{pesos(d.meta)}</span>
              </div>
            )}
          </Fila>
        ))}
      </Tarjeta>
    </Marco>
  ));
}

// ── Cierre de semana ────────────────────────────────────────────────────────

export async function tarjetaCierre(opciones: {
  nombre: string;
  tienda: string;
  semana: number;
  inicio: Date;
  fin: Date;
  dias: DiaVenta[];
  ventaAnterior: number | null;
}): Promise<Buffer> {
  const a = analizarSemana(opciones.dias, opciones.ventaAnterior);
  const total = estado(a.pct);
  const datos: Array<{ etiqueta: string; valor: string; fondo: string; tinta: string }> = [
    { etiqueta: "Días en meta", valor: `${a.diasEnMeta} de ${a.diasTrabajados}`, fondo: C.menta, tinta: C.mentaTinta },
    { etiqueta: "Mejor día", valor: a.mejor ? DIAS[a.mejor.fecha.getUTCDay()] : "—", fondo: C.lavanda, tinta: C.lavandaTinta },
    {
      etiqueta: "Vs. semana pasada",
      valor: a.vsAnterior === null ? "—" : `${a.vsAnterior > 0 ? "+" : ""}${a.vsAnterior} %`,
      fondo: C.durazno,
      tinta: C.duraznoTinta
    }
  ];
  return aPng((logo) => (
    <Marco
      logo={logo}
      tienda={opciones.tienda}
      chip={`Cierre · semana ${opciones.semana}`}
      chipFondo={C.durazno}
      chipTinta={C.duraznoTinta}
      tonos={["#FFE0CF", "#DDF3E7", "#E6E0FF"]}
    >
      <Titulo texto="Tu semana" nombre={firstName(opciones.nombre)} rango={rangoSemana(opciones.inicio, opciones.fin)} />
      <Tarjeta margenArriba={30} relleno="28px 40px">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, color: C.suave, fontWeight: 500 }}>Vendiste</span>
            <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{pesos(a.venta)}</span>
            <span style={{ fontSize: 26, color: C.suave }}>de {pesos(a.meta)}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 200,
              height: 200,
              borderRadius: 200,
              background: total.fondo,
              color: total.tinta,
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: -2
            }}
          >
            {a.pct === null ? "—" : `${a.pct}%`}
          </div>
        </div>
      </Tarjeta>
      <Tarjeta margenArriba={22} relleno="18px 36px">
        {opciones.dias.map((d, i) => {
          const apagada = d.descansa || !d.capturado;
          const pct = apagada ? null : porcentaje(d.venta, d.meta);
          const e = estado(pct);
          return (
            <Fila key={i} primera={i === 0} dia={d.fecha} apagada={apagada} alto={60}>
              {apagada ? (
                <Pastilla texto={d.descansa ? "Descanso" : "Sin captura"} fondo="#F1F0EB" tinta={C.tenue} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", flexGrow: 1, justifyContent: "space-between" }}>
                  <Barra fraccion={d.meta > 0 ? d.venta / d.meta : 0} color={e.barra} ancho={200} />
                  <span style={{ fontSize: 30, fontWeight: 600, width: 170, display: "flex", justifyContent: "flex-end" }}>{pesos(d.venta)}</span>
                  <div style={{ display: "flex", width: 120, justifyContent: "flex-end" }}>
                    {pct === null ? null : <Pastilla texto={`${pct}%`} fondo={e.fondo} tinta={e.tinta} />}
                  </div>
                </div>
              )}
            </Fila>
          );
        })}
      </Tarjeta>
      <div style={{ display: "flex", marginTop: 22, gap: 16 }}>
        {datos.map((dato) => (
          <div
            key={dato.etiqueta}
            style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, padding: "20px 24px", borderRadius: 30, background: dato.fondo }}
          >
            <span style={{ fontSize: 21, color: dato.tinta, fontWeight: 500 }}>{dato.etiqueta}</span>
            <span style={{ fontSize: 34, fontWeight: 700, marginTop: 4, color: dato.tinta }}>{dato.valor}</span>
          </div>
        ))}
      </div>
    </Marco>
  ));
}

// ── Horarios de la semana ───────────────────────────────────────────────────

/** Pastel por tipo de día: Laborando en cielo, Conteo en lavanda, Vacaciones y Pago día en durazno. */
function tonoTurno(status: string): { fondo: string; tinta: string } {
  if (status === "WORKING") return { fondo: C.cielo, tinta: C.cieloTinta };
  if (status === "INVENTORY") return { fondo: C.lavanda, tinta: C.lavandaTinta };
  if (status === "VACATION" || status === "PAID_DAY") return { fondo: C.durazno, tinta: C.duraznoTinta };
  return { fondo: "#F1F0EB", tinta: C.tenue };
}

/**
 * Como la hoja de horarios de la tienda: día, Entrada y Salida, y en los días
 * que no se trabaja la palabra de la hoja (Descanso, Vacaciones, Pago día…).
 */
export async function tarjetaHorarios(opciones: {
  nombre: string;
  tienda: string;
  semana: number;
  inicio: Date;
  fin: Date;
  dias: DiaHorario[];
  actualizacion: boolean;
}): Promise<Buffer> {
  const trabaja = opciones.dias.filter(trabajaEseDia).length;
  const COL = 190;
  return aPng((logo) => (
    <Marco
      logo={logo}
      tienda={opciones.tienda}
      chip={`Semana ${opciones.semana}${opciones.actualizacion ? " · actualizada" : ""}`}
      chipFondo={C.menta}
      chipTinta={C.mentaTinta}
      tonos={["#D8F1E5", "#DCEBFF", "#E8E3FF"]}
    >
      <Titulo texto="Tus horarios" nombre={firstName(opciones.nombre)} rango={rangoSemana(opciones.inicio, opciones.fin)} />
      <Tarjeta margenArriba={36} relleno="26px 40px">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 26, color: C.suave, fontWeight: 500 }}>Días laborando</span>
          <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, color: C.mentaTinta }}>{`${trabaja} de 7`}</span>
        </div>
      </Tarjeta>
      <Tarjeta margenArriba={22} relleno="16px 36px 22px">
        <div style={{ display: "flex", alignItems: "center", height: 54, fontSize: 22, fontWeight: 600, color: C.tenue, letterSpacing: 1.5 }}>
          <span style={{ width: 260 }}>DÍA</span>
          <div style={{ display: "flex", flexGrow: 1, justifyContent: "flex-end" }}>
            <span style={{ width: COL, display: "flex", justifyContent: "center" }}>ENTRADA</span>
            <span style={{ width: COL, display: "flex", justifyContent: "center" }}>SALIDA</span>
          </div>
        </div>
        {opciones.dias.map((d, i) => {
          const tono = tonoTurno(d.status);
          const es = entradaSalida(d);
          const pastilla = (texto: string, ancho: number) => (
            <span
              style={{
                display: "flex",
                justifyContent: "center",
                width: ancho,
                fontSize: 30,
                fontWeight: 600,
                padding: "10px 0",
                borderRadius: 999,
                background: tono.fondo,
                color: tono.tinta
              }}
            >
              {texto}
            </span>
          );
          return (
            <Fila key={i} primera={false} dia={d.fecha} apagada={!es} alto={78}>
              <div style={{ display: "flex", flexGrow: 1, justifyContent: "flex-end", gap: 14 }}>
                {es ? (
                  <>
                    {pastilla(es.entrada, COL - 14)}
                    {pastilla(es.salida, COL - 14)}
                  </>
                ) : (
                  pastilla(etiquetaTurno(d), COL * 2 - 14)
                )}
              </div>
            </Fila>
          );
        })}
        {opciones.dias.some((d) => d.status === "INVENTORY") ? (
          <span style={{ fontSize: 22, color: C.lavandaTinta, marginTop: 14 }}>Los días en lavanda son de Conteo.</span>
        ) : null}
      </Tarjeta>
    </Marco>
  ));
}

// ── Tailored Help (al grupo) ────────────────────────────────────────────────

/**
 * Cómo va la TIENDA en la campaña, para el grupo. Solo totales: nada de
 * nombres, porque en el grupo un ranking exhibe a quien va abajo.
 */
export async function tarjetaCampana(opciones: {
  tienda: string;
  semana: number;
  dias: Array<{ fecha: Date; meta: number; total: number; capturado: boolean }>;
  totalSemana: number;
  metaSemana: number;
  totalCampana: number;
}): Promise<Buffer> {
  const SALVIA = "#5F7464";
  const pct = opciones.metaSemana > 0 ? Math.round((opciones.totalSemana / opciones.metaSemana) * 100) : null;
  const ancho = opciones.metaSemana > 0 ? Math.min(1, opciones.totalSemana / opciones.metaSemana) : 0;
  return aPng((logo) => (
    <Marco
      logo={logo}
      tienda={opciones.tienda}
      chip={`Tailored Help · Semana ${opciones.semana}`}
      chipFondo="#E6EDE6"
      chipTinta={SALVIA}
      tonos={["#E2EBE2", "#FBF1E6", "#E6EDE6"]}
    >
      <div style={{ display: "flex", flexDirection: "column", marginTop: 46 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="34" height="30" viewBox="0 0 24 21">
            <path d="M12 21 1.7 10.6A6 6 0 0 1 12 3.1a6 6 0 0 1 10.3 7.5Z" fill={SALVIA} />
          </svg>
          <span style={{ fontSize: 30, color: SALVIA, fontWeight: 600, letterSpacing: 1 }}>¡JUNTOS CONSTRUIMOS FUTUROS!</span>
        </div>
        <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, marginTop: 14 }}>Así vamos en donativos</span>
      </div>
      <Tarjeta margenArriba={34} relleno="30px 40px">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, color: C.suave, fontWeight: 500 }}>Esta semana</span>
            <span style={{ fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05, color: SALVIA }}>{pesos(opciones.totalSemana)}</span>
            <span style={{ fontSize: 26, color: C.suave }}>de {pesos(opciones.metaSemana)}</span>
          </div>
          <span style={{ fontSize: 56, fontWeight: 700, color: SALVIA, paddingBottom: 12 }}>{pct === null ? "" : `${pct}%`}</span>
        </div>
        <div style={{ display: "flex", marginTop: 22, width: "100%", height: 22, borderRadius: 999, background: "#E6EDE6" }}>
          <div style={{ display: "flex", width: `${Math.max(ancho * 100, ancho > 0 ? 4 : 0)}%`, height: 22, borderRadius: 999, background: SALVIA }} />
        </div>
      </Tarjeta>
      <Tarjeta margenArriba={22} relleno="14px 36px">
        {opciones.dias.map((d, i) => {
          const p = d.meta > 0 ? d.total / d.meta : 0;
          return (
            <Fila key={i} primera={i === 0} dia={d.fecha} apagada={!d.capturado} alto={62}>
              <div style={{ display: "flex", alignItems: "center", flexGrow: 1, justifyContent: "space-between" }}>
                <Barra fraccion={d.capturado ? p : 0} color={p >= 1 ? "#9EDDBE" : "#B9CBB9"} ancho={220} />
                <span style={{ fontSize: 28, fontWeight: 600, color: d.capturado ? C.tinta : C.tenue }}>
                  {d.capturado ? `${pesos(d.total)} / ${pesos(d.meta)}` : `meta ${pesos(d.meta)}`}
                </span>
              </div>
            </Fila>
          );
        })}
      </Tarjeta>
      <div style={{ display: "flex", marginTop: 22, padding: "20px 28px", borderRadius: 30, background: "#E6EDE6", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 24, color: SALVIA, fontWeight: 500 }}>Desde que arrancó la campaña</span>
        <span style={{ fontSize: 38, fontWeight: 700, color: SALVIA }}>{pesos(opciones.totalCampana)}</span>
      </div>
    </Marco>
  ));
}
