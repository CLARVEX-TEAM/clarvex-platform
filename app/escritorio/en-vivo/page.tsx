"use client";

import { ArrowLeft, Expand, Minimize, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "@/components/Confetti";
import { ProfileAvatar } from "@/components/ui";
import { monterreyMinutesOfDay } from "@/lib/cron-time";
import { money } from "@/lib/format";
import type { DiaDeVenta } from "@/lib/kpi-dias";
import { APERTURA_MIN, contraElRitmo, ritmoEsperado } from "@/lib/venta-ritmo";
import styles from "./panel.module.css";

type Respuesta = {
  fecha: string;
  tienda: string | null;
  hoy: DiaDeVenta | null;
  semana: { inicio: string; venta: number; meta: number; dias: Array<{ fecha: string; venta: number; meta: number; capturado: boolean }> };
  actualizado: string | null;
};

const REFRESCO_MS = 2_000;
const ZONA = "America/Monterrey";
const FECHA = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const DIA = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const RELOJ = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const HORA = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0, minimumFractionDigits: 0 });
const PESOS_COMPACTOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 });
const limitar = (valor: number) => Math.max(0, Math.min(100, valor));
const fechaUtc = (fecha: string) => new Date(fecha + "T00:00:00Z");

function tono(alcance: number | null) {
  if (alcance === null) return "sin-dato";
  if (alcance >= 100) return "meta";
  if (alcance >= 85) return "cerca";
  return "bajo";
}

function porcentaje(valor: number | null) {
  return valor === null ? "—" : Math.round(valor) + "%";
}

export default function VentaEnVivoPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [ahora, setAhora] = useState<number | null>(null);
  const [completa, setCompleta] = useState(false);
  const [festejo, setFestejo] = useState(false);
  const [subida, setSubida] = useState<{ monto: number; en: number } | null>(null);

  useEffect(() => {
    let anterior: Respuesta | null = null;
    const yaFestejados = new Set<string>();
    let enCurso = false;
    let fiesta: number | undefined;
    const cancelacion = new AbortController();

    async function cargar() {
      if (enCurso || document.visibilityState === "hidden") return;
      enCurso = true;
      try {
        const response = await fetch("/api/en-vivo", { cache: "no-store", signal: cancelacion.signal });
        if (cancelacion.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          anterior = null;
          yaFestejados.clear();
          window.clearTimeout(fiesta);
          setFestejo(false);
          setSubida(null);
          setDatos(null);
          setReconectando(false);
          setError(response.status === 403 ? "Este panel es solo para gerencia." : "Tu sesión terminó. Vuelve a iniciar sesión.");
          return;
        }
        if (!response.ok) throw new Error("Sin conexión con Clarvex.");
        const actual: Respuesta = await response.json();
        if (cancelacion.signal.aborted) return;

        if (anterior?.fecha !== actual.fecha) {
          yaFestejados.clear();
          window.clearTimeout(fiesta);
          setFestejo(false);
          setSubida(null);
        } else if (actual.hoy?.capturado) {
          const ventaAnterior = anterior.hoy?.capturado ? anterior.hoy.venta : 0;
          if (actual.hoy.venta > ventaAnterior) {
            setSubida({ monto: actual.hoy.venta - ventaAnterior, en: Date.now() });
          } else if (actual.hoy.venta < ventaAnterior) {
            setSubida(null);
          }
        }

        const metas = [
          ...(actual.hoy?.capturado && (actual.hoy.alcance ?? 0) >= 100 ? ["tienda"] : []),
          ...(actual.hoy?.personas ?? []).filter(p => p.capturado && (p.alcance ?? 0) >= 100).map(p => p.userId)
        ];
        if (anterior?.fecha === actual.fecha && metas.some(id => !yaFestejados.has(id))) {
          setFestejo(true);
          window.clearTimeout(fiesta);
          fiesta = window.setTimeout(() => setFestejo(false), 3500);
        }
        for (const id of metas) yaFestejados.add(id);

        anterior = actual;
        setDatos(actual);
        setReconectando(false);
        setError(null);
      } catch {
        if (cancelacion.signal.aborted) return;
        setReconectando(true);
        setError("Sin conexión con Clarvex.");
      } finally {
        enCurso = false;
      }
    }

    function actualizarReloj() { setAhora(Date.now()); }
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      actualizarReloj();
      void cargar();
    }

    actualizarReloj();
    void cargar();
    const consulta = window.setInterval(cargar, REFRESCO_MS);
    const reloj = window.setInterval(actualizarReloj, 1000);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelacion.abort();
      window.clearInterval(consulta);
      window.clearInterval(reloj);
      window.clearTimeout(fiesta);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  useEffect(() => {
    let activo = true;
    let solicitando = false;
    let candado: WakeLockSentinel | null = null;

    async function pedir() {
      if (!navigator.wakeLock || solicitando || document.visibilityState !== "visible" || (candado && !candado.released)) return;
      solicitando = true;
      try {
        const nuevo = await navigator.wakeLock.request("screen");
        if (activo && document.visibilityState === "visible") candado = nuevo;
        else await nuevo.release();
      } catch { /* El navegador puede rechazar la solicitud. */ }
      finally { solicitando = false; }
    }

    void pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", pedir);
      void candado?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const cambio = () => setCompleta(Boolean(document.fullscreenElement));
    cambio();
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);

  function alternarCompleta() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  if (ahora === null) return null;

  const hoy = datos?.hoy;
  const capturado = hoy?.capturado === true;
  const venta = capturado ? hoy.venta : 0;
  const meta = hoy?.meta ?? 0;
  const minutos = monterreyMinutesOfDay(new Date(ahora));
  const ritmo = ritmoEsperado(minutos);
  const vsRitmo = capturado && minutos >= APERTURA_MIN ? contraElRitmo(venta, meta, minutos) : null;
  const subidaVisible = !error && capturado && subida && ahora - subida.en < 3 * 60_000 ? subida.monto : null;
  const estado = reconectando ? "Reconectando" : error ? "Sin acceso" : datos ? "En vivo" : "Conectando";

  return createPortal(
    <section aria-label="Venta en vivo" className={styles.panel}>
      {festejo && <Confetti show />}
      <div className={styles.layout}>
        <header className={styles.cabecera}>
          <div className={styles.identidad}>
            <Link href="/escritorio" aria-label="Volver al escritorio" className={styles.control}><ArrowLeft size={19} /></Link>
            <Image src="/icon-512.png" alt="Clarvex" width={44} height={44} priority className={styles.logo} />
            <div>
              <h1>Venta en vivo</h1>
              <p>{datos?.tienda ?? "Clarvex"}</p>
            </div>
          </div>
          <div className={styles.conexion}>
            <span className={styles.estado} data-activo={!error && !!datos} role="status">{estado}</span>
            <span>{reconectando && datos ? "Mostrando la última captura" : datos?.actualizado ? "Última captura " + HORA.format(new Date(datos.actualizado)) : datos ? "Sin captura hoy" : null}</span>
          </div>
          <div className={styles.reloj}>
            <div>
              <time dateTime={new Date(ahora).toISOString()}>{RELOJ.format(ahora)}</time>
              {datos && <p>{FECHA.format(fechaUtc(datos.fecha))}</p>}
            </div>
            {document.fullscreenEnabled && (
              <button type="button" onClick={alternarCompleta} className={styles.control} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"}>
                {completa ? <Minimize size={19} /> : <Expand size={19} />}
              </button>
            )}
          </div>
        </header>
        {datos ? (
          <div className={styles.monitor}>
            <section aria-labelledby="venta-hoy" className={styles.venta}>
              <div className={styles.frente}>
                <div className={styles.resumen}>
                  <h2 id="venta-hoy">Venta de hoy</h2>
                  <p className={styles.total} data-negativo={venta < 0}>{capturado ? money(venta) : "—"}</p>
                  {!capturado && <p className={styles.nota}>Aún no hay venta capturada hoy.</p>}
                  {subidaVisible !== null && (
                    <p className={styles.subida}><TrendingUp size={17} aria-hidden /> +{PESOS.format(subidaVisible)} desde la captura anterior</p>
                  )}
                  {meta > 0 && (
                    <div className={styles.ritmo}>
                      <div className={styles.pista} aria-hidden="true">
                        <span style={{width: limitar(capturado ? hoy.alcance ?? 0 : 0) + "%"}} />
                        <i style={{left: limitar(ritmo * 100) + "%"}} />
                      </div>
                      <div className={styles.leyendaRitmo}>
                        <span>Ritmo estimado · {porcentaje(ritmo * 100)}</span>
                        {vsRitmo !== null && (
                          <span data-tono={vsRitmo < 0 ? "bajo" : "meta"}>
                            {vsRitmo === 0 ? "En ritmo" : PESOS.format(Math.abs(vsRitmo)) + (vsRitmo > 0 ? " arriba" : " abajo")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.alcance} data-tono={tono(capturado ? hoy.alcance : null)}>
                  <dl className={styles.metas}>
                    <div><dt>Meta del día</dt><dd>{meta > 0 ? PESOS.format(meta) : "—"}</dd></div>
                    <div><dt>{meta > 0 && venta > meta ? "Sobre la meta" : "Faltan para la meta"}</dt><dd>{meta > 0 && capturado ? PESOS.format(Math.abs(meta - venta)) : "—"}</dd></div>
                  </dl>
                  <p><strong>{porcentaje(capturado ? hoy.alcance : null)}</strong><span>de la meta</span></p>
                </div>
              </div>
              <Indicadores hoy={datos.hoy} />
            </section>
            <Equipo hoy={datos.hoy} />
            <Semana semana={datos.semana} hoyIso={datos.fecha} />
          </div>
        ) : (
          <div className={styles.aviso}>
            <p>{error ?? "Conectando con la venta de hoy…"}</p>
            {error && !reconectando && <Link href="/escritorio">Volver al escritorio</Link>}
          </div>
        )}
      </div>
    </section>,
    document.body
  );
}

function Indicadores({ hoy }: { hoy: DiaDeVenta | null }) {
  const capturado = hoy?.capturado === true;
  const tickets = hoy?.tickets ?? 0;
  const piezas = hoy?.piezas ?? 0;
  const indicadores = [
    { etiqueta: "Tickets", valor: capturado ? tickets : "—" },
    { etiqueta: "Piezas", valor: capturado ? piezas : "—" },
    { etiqueta: "Conversión", valor: capturado && hoy.trafico ? ((tickets / hoy.trafico) * 100).toFixed(1) + "%" : "—" },
    { etiqueta: "Ticket promedio", valor: capturado && tickets ? PESOS.format(hoy.venta / tickets) : "—" },
    { etiqueta: "Piezas por ticket", valor: capturado && tickets ? (piezas / tickets).toFixed(2) : "—" },
  ];
  return (
    <dl className={styles.indicadores}>
      {indicadores.map(({ etiqueta, valor }) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></div>)}
    </dl>
  );
}

function Equipo({ hoy }: { hoy: DiaDeVenta | null }) {
  const personas = hoy?.personas ?? [];
  const capturadas = personas.filter(p => p.capturado);
  const filas = [...capturadas, ...personas.filter(p => !p.capturado)];

  return (
    <section className={styles.equipo} aria-labelledby="equipo-hoy">
      <div className={styles.tituloSeccion}>
        <h2 id="equipo-hoy">Equipo hoy</h2>
        {filas.length > 0 && <span>{capturadas.length} de {filas.length} con captura</span>}
      </div>
      {filas.length ? (
        <table className={styles.tabla} aria-labelledby="equipo-hoy">
          <thead><tr><th scope="col" colSpan={2}>Persona</th><th scope="col">Venta</th><th scope="col">Alcance</th></tr></thead>
          <tbody>
            {filas.map((p, indice) => (
              <tr key={p.userId} data-lider={indice === 0 && p.capturado && p.venta > 0}>
                <td className={styles.puesto}>{p.capturado ? indice + 1 : "—"}</td>
                <th scope="row">
                  <span className={styles.persona}>
                    <span aria-hidden="true"><ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="sm" className={styles.avatar} /></span>
                    <span>{p.nombre}</span>
                  </span>
                </th>
                <td>{p.capturado ? PESOS.format(p.venta) : "—"}</td>
                <td><span className={styles.porcentaje} data-tono={tono(p.capturado ? p.alcance : null)}>{porcentaje(p.capturado ? p.alcance : null)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className={styles.nota}>El equipo aparecerá con la primera captura del día.</p>}
    </section>
  );
}

function Semana({ semana, hoyIso }: { semana: Respuesta["semana"]; hoyIso: string }) {
  const dias = new Map(semana.dias.map(dia => [dia.fecha, dia]));
  const maximo = Math.max(1, ...semana.dias.map(dia => Math.max(dia.venta, dia.meta)));
  const alcance = semana.meta > 0 ? semana.venta / semana.meta * 100 : null;
  const capturado = semana.dias.some(dia => dia.capturado);

  return (
    <section className={styles.semana} aria-labelledby="semana-retail">
      <div className={styles.tituloSeccion}>
        <div><h2 id="semana-retail">Semana retail</h2><p>Acumulado hasta hoy</p></div>
        <div className={styles.totalSemana}>
          <strong>{capturado ? PESOS.format(semana.venta) : "—"}</strong>
          <span className={styles.porcentaje} data-tono={tono(capturado ? alcance : null)}>{porcentaje(capturado ? alcance : null)}</span>
        </div>
      </div>
      <div className={styles.leyendaSemana} aria-hidden="true"><span>Venta</span><span>Meta</span></div>
      <ul className={styles.grafica}>
        {Array.from({length: 7}, (_, i) => {
          const fecha = new Date(fechaUtc(semana.inicio).getTime() + i * 86_400_000).toISOString().slice(0, 10);
          const dia = dias.get(fecha);
          const etiqueta = DIA.format(fechaUtc(fecha)).replace(".", "");
          const detalle = (dia?.capturado ? "Venta " + PESOS.format(dia.venta) : fecha > hoyIso ? "Día próximo" : "Sin captura") +
            (dia && dia.meta > 0 ? ", meta " + PESOS.format(dia.meta) : "");
          return (
            <li key={fecha} aria-current={fecha === hoyIso ? "date" : undefined} aria-label={etiqueta + ", " + detalle} title={detalle}>
              <span className={styles.ventaDia} aria-hidden="true">{dia?.capturado ? PESOS_COMPACTOS.format(dia.venta) : "—"}</span>
              <div className={styles.barras} aria-hidden="true">
                {dia && dia.meta > 0 && <span style={{height: (dia.meta / maximo) * 100 + "%"}} />}
                {dia?.capturado && dia.venta > 0 && <span data-venta style={{height: (dia.venta / maximo) * 100 + "%"}} />}
              </div>
              <span className={styles.dia}>{etiqueta}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
