"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Save } from "lucide-react";
import { AppFrame, AppHeader, Button, Card } from "@/components/ui";
import type { ResumenSemana } from "@/lib/campana";

/**
 * Tailored Help: el avance de la semana para todos y, para gerencia, la
 * captura del día (meta del corporativo + lo que juntó cada quien).
 *
 * Se captura POR DÍA y no la semana en rejilla: en el teléfono una tabla de
 * 7 días × 5 personas no cabe, y gerencia captura un día a la vez de todos
 * modos (al cierre, contando los tickets del POS).
 */

type Respuesta = {
  activa: boolean;
  tema?: { nombre: string; lema: string; causa: string };
  gerencia?: boolean;
  yo?: string;
  resumen?: ResumenSemana;
  acumulado?: { tienda: number; donativosTienda: number; propio: number | null } | null;
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const pesos = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const mover = (fecha: string, dias: number) => new Date(dia(fecha).getTime() + dias * 86_400_000).toISOString().slice(0, 10);

function hoyMonterrey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
}

export default function TailoredHelpPage() {
  const [semana, setSemana] = useState(hoyMonterrey());
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [diaSel, setDiaSel] = useState(hoyMonterrey());
  const [borrador, setBorrador] = useState<{ meta: string; montos: Record<string, string>; conteos: Record<string, string> }>({ meta: "", montos: {}, conteos: {} });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`/api/campanas/tailored-help?semana=${semana}`, { cache: "no-store" });
      const d = (await r.json()) as Respuesta & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la campaña.");
      setDatos(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la campaña.");
    }
  }, [semana]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = datos?.resumen;
  const fechas = useMemo(() => resumen?.dias.map((d) => d.fecha) ?? [], [resumen]);

  // Al cambiar de semana, el día seleccionado se queda dentro de ella.
  useEffect(() => {
    if (fechas.length && !fechas.includes(diaSel)) setDiaSel(fechas.includes(hoyMonterrey()) ? hoyMonterrey() : fechas[0]);
  }, [fechas, diaSel]);

  // El borrador del día sale de lo guardado; se rehace al cambiar de día o al guardar.
  useEffect(() => {
    if (!resumen) return;
    const delDia = resumen.dias.find((d) => d.fecha === diaSel);
    setBorrador({
      meta: delDia && delDia.meta > 0 ? String(delDia.meta) : "",
      montos: Object.fromEntries(resumen.personas.map((p) => [p.userId, p.porDia[diaSel] !== undefined ? String(p.porDia[diaSel]) : ""])),
      conteos: {}
    });
  }, [resumen, diaSel]);

  async function guardar() {
    if (!resumen) return;
    setGuardando(true);
    setAviso("");
    setError("");
    try {
      const r = await fetch("/api/campanas/tailored-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semana: diaSel,
          metas: borrador.meta.trim() ? [{ fecha: diaSel, meta: borrador.meta }] : [],
          aportes: resumen.personas.map((p) => ({
            userId: p.userId,
            fecha: diaSel,
            monto: (borrador.montos[p.userId] ?? "").trim() || null,
            donativos: borrador.conteos[p.userId] ? Number(borrador.conteos[p.userId]) || 0 : undefined
          }))
        })
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar.");
      setAviso("Guardado ✓");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const ancho = resumen && resumen.meta > 0 ? Math.min(100, (resumen.total / resumen.meta) * 100) : 0;

  return (
    <>
      <AppHeader title="Tailored Help" subtitle={datos?.tema?.causa ?? "Campaña de donativos"} backHref="/mi-dia" />
      <AppFrame>
        {error ? <p className="mb-3 rounded-xl bg-orchid/10 px-3 py-2 text-xs font-semibold text-orchid">{error}</p> : null}
        {datos && !datos.activa ? <Card className="p-5 text-sm text-muted">La campaña no está activa.</Card> : null}

        {resumen && datos?.tema ? (
          <>
            <section className="rounded-3xl border border-[#5F7464]/25 bg-[#5F7464]/10 p-5">
              <div className="flex items-center gap-2">
                <Heart size={20} className="fill-[#5F7464] text-[#5F7464]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5F7464]">{datos.tema.lema}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button type="button" aria-label="Semana anterior" onClick={() => setSemana(mover(resumen.inicio, -7))} className="tappable rounded-full p-2 text-ink">
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-semibold text-ink">
                  Semana del {dia(resumen.inicio).getUTCDate()} al {dia(mover(resumen.inicio, 6)).getUTCDate()}
                </span>
                <button type="button" aria-label="Semana siguiente" onClick={() => setSemana(mover(resumen.inicio, 7))} className="tappable rounded-full p-2 text-ink">
                  <ChevronRight size={20} />
                </button>
              </div>
              <p className="mt-3 text-4xl font-bold tracking-tight text-ink">{pesos(resumen.total)}</p>
              <p className="text-sm text-muted">
                de {pesos(resumen.meta)} · {resumen.alcance === null ? "sin meta cargada" : `${resumen.alcance} % de la meta`}
              </p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#5F7464]/15">
                <div className="h-full rounded-full bg-[#5F7464]" style={{ width: `${ancho}%` }} />
              </div>
              {datos.acumulado ? (
                <p className="mt-3 text-xs text-muted">
                  Desde que arrancó: <span className="font-semibold text-ink">{pesos(datos.acumulado.tienda)}</span> la tienda
                  {datos.acumulado.propio !== null ? <> · <span className="font-semibold text-ink">{pesos(datos.acumulado.propio)}</span> tú</> : null}
                </p>
              ) : null}
            </section>

            <section className="mt-5">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Día por día</h2>
              <div className="mt-3 divide-y divide-line rounded-2xl bg-card px-4 shadow-[0_8px_22px_rgb(20_21_26/0.07)]">
                {resumen.dias.map((d) => {
                  const pct = d.meta > 0 ? Math.round((d.total / d.meta) * 100) : null;
                  return (
                    <div key={d.fecha} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                      <span className="w-16 font-semibold text-ink">{DIAS[dia(d.fecha).getUTCDay()]} {dia(d.fecha).getUTCDate()}</span>
                      <span className="flex-1 text-muted">{d.capturado ? `${pesos(d.total)} de ${pesos(d.meta)}` : `meta ${pesos(d.meta)}`}</span>
                      <span className={`text-xs font-semibold ${pct === null || !d.capturado ? "text-muted" : pct >= 100 ? "text-[#1F7A4D]" : pct >= 85 ? "text-[#946A00]" : "text-[#B4233C]"}`}>
                        {d.capturado && pct !== null ? `${pct} %` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {datos.gerencia ? (
              <section className="mt-6">
                <h2 className="text-lg font-semibold tracking-tight text-ink">Capturar</h2>
                <p className="text-xs text-muted">Lo que juntó cada quien en caja. Deja vacío para borrar.</p>
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                  {fechas.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDiaSel(f)}
                      className={`tappable min-w-12 rounded-full px-3 py-2 text-xs font-semibold ${f === diaSel ? "bg-ink text-card" : "bg-panel text-ink"}`}
                    >
                      {DIAS[dia(f).getUTCDay()]} {dia(f).getUTCDate()}
                    </button>
                  ))}
                </div>
                <Card className="mt-3 space-y-3 p-4">
                  <label className="flex items-center gap-3 text-sm">
                    <span className="flex-1 font-semibold text-ink">Meta del día (corporativo)</span>
                    <input
                      inputMode="decimal"
                      value={borrador.meta}
                      onChange={(e) => setBorrador((b) => ({ ...b, meta: e.target.value }))}
                      className="w-28 rounded-xl border border-line bg-panel px-3 py-2 text-right text-ink"
                      placeholder="$0"
                    />
                  </label>
                  {resumen.personas.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink">{p.nombre}</span>
                      <input
                        inputMode="numeric"
                        value={borrador.conteos[p.userId] ?? ""}
                        onChange={(e) => setBorrador((b) => ({ ...b, conteos: { ...b.conteos, [p.userId]: e.target.value } }))}
                        className="w-16 rounded-xl border border-line bg-panel px-2 py-2 text-right text-ink"
                        placeholder="#"
                        aria-label={`Donativos de ${p.nombre}`}
                      />
                      <input
                        inputMode="decimal"
                        value={borrador.montos[p.userId] ?? ""}
                        onChange={(e) => setBorrador((b) => ({ ...b, montos: { ...b.montos, [p.userId]: e.target.value } }))}
                        className="w-24 rounded-xl border border-line bg-panel px-3 py-2 text-right text-ink"
                        placeholder="$"
                        aria-label={`Monto de ${p.nombre}`}
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted"># = cuántos donativos (opcional) · $ = cuánto juntó</p>
                  <Button onClick={() => void guardar()} variant="primary" className="w-full" icon={<Save size={17} />} disabled={guardando}>
                    {guardando ? "Guardando…" : "Guardar el día"}
                  </Button>
                  {aviso ? <p className="text-center text-xs font-semibold text-[#1F7A4D]">{aviso}</p> : null}
                </Card>
              </section>
            ) : null}

            <section className="mt-6">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Ranking de la semana</h2>
              <p className="text-xs text-muted">Gerencia y asesores: todos pedimos donativos en caja.</p>
              <div className="mt-3 divide-y divide-line rounded-2xl bg-card px-4 shadow-[0_8px_22px_rgb(20_21_26/0.07)]">
                {resumen.personas.map((p, i) => (
                  <div key={p.userId} className={`flex min-h-12 items-center gap-3 py-2 text-sm ${p.userId === datos.yo ? "font-semibold" : ""}`}>
                    <span className="w-6 text-center text-xs font-bold text-muted">{p.total > 0 && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{p.nombre}{p.userId === datos.yo ? " (tú)" : ""}</span>
                    {p.donativos > 0 ? <span className="text-xs text-muted">{p.donativos} don.</span> : null}
                    <span className="font-semibold text-ink">{pesos(p.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </AppFrame>
    </>
  );
}
