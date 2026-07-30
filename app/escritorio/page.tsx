"use client";

import Link from "next/link";
import { Cake, ChevronRight } from "lucide-react";
import { completion, money } from "@/lib/format";
import { buildDailySeries, buildSalesTrend } from "@/lib/trend";
import { cn } from "@/lib/utils";
import { isRestingToday, restLabel, scheduleStatusByUser } from "@/lib/working-today";
import { ProfileAvatar } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { DeskTrendChart, Sparkline } from "@/components/desktop/DeskCharts";
import { DeskMeter, DeskReveal } from "@/components/desktop/DeskUI";

/** Días hasta el próximo cumpleaños (para ordenar por más cercano). */
function daysUntilBirthday(birthDate?: string | null): number {
  if (!birthDate) return 9999;
  const d = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Regla del proyecto: si un divisor es 0, null o undefined se muestra “—”.
 * Nunca 0, porque un cero se lee como un dato real y aquí significa "sin dato".
 */
function ratio(numerator?: number | null, denominator?: number | null) {
  if (!numerator || !denominator) return null;
  return numerator / denominator;
}

/** "2026-08-01" → "1 ago". Sin esto la fecha cruda parte la fila en dos renglones. */
function shortDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
}


export default function EscritorioDashboard() {
  const { data, error, reload } = useDesktopData();
  const { isDark } = useTheme();

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) return <DashboardSkeleton />;

  const store = data.dashboardDaily;
  const sales = store?.dailySales ?? 0;
  const goal = store?.dailyGoal ?? 0;
  const progress = completion(sales, goal);
  const remaining = Math.max(0, goal - sales);
  const todayKey = store.date;

  const advisors = data.users.filter((u) => u.role === "ASESOR");
  const statusToday = scheduleStatusByUser(data.schedules, todayKey);

  const ranking = advisors
    .map((advisor) => {
      const kpi = data.kpis.find((k) => k.userId === advisor.id && k.date === todayKey);
      const status = statusToday.get(advisor.id);
      const resting = isRestingToday(status, kpi);
      return {
        advisor,
        sales: kpi?.dailySales ?? 0,
        goal: kpi?.dailyGoal ?? 0,
        progress: completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0),
        resting,
        restText: restLabel(status),
        // Forma de sus últimos 7 días: el alcance de hoy no dice si viene
        // subiendo o cayendo, y eso es justo lo que decide a quién empujar.
        series: buildDailySeries(
          data.kpis.filter((k) => k.userId === advisor.id).map((k) => ({ date: k.date, value: k.dailySales })),
          todayKey,
          7
        )
      };
    })
    .sort((a, b) => Number(a.resting) - Number(b.resting) || b.progress - a.progress || b.sales - a.sales);

  // Cola de atención: lo crítico y lo alto que sigue abierto, lo vencido primero.
  const attention = data.pendings
    .filter((p) => (p.priority === "critica" || p.priority === "alta") && p.status !== "completado")
    .map((p) => ({ ...p, overdue: Boolean(p.dueDate) && p.dueDate < todayKey }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";

  const celebrations = [...data.users]
    .filter((u) => u.birthDate)
    .map((u) => ({ ...u, days: daysUntilBirthday(u.birthDate) }))
    .filter((u) => u.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);

  const trend = buildSalesTrend(
    data.kpis.map((k) => ({ date: k.date, dailySales: k.dailySales, dailyGoal: k.dailyGoal })),
    todayKey
  );

  // Fórmulas del proyecto: UPT = piezas / tickets, AUR = venta / piezas.
  // DashboardDailyKpi no las trae precalculadas, solo los crudos.
  const upt = ratio(store?.pieces, store?.transactions);
  const aur = ratio(sales, store?.pieces);

  return (
    <div className="space-y-9">
      {/* ─── Franja partida: la cifra del día y lo que requiere acción, mismo peso ──
           Las entradas van escalonadas por bandas, no por elemento: escalonar
           cada fila de la tabla se percibiría como lentitud, no como pulido. */}
      <DeskReveal index={0} className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 className="text-ui font-medium text-muted">Venta de hoy</h2>
          <p className="mt-2 text-metric font-semibold text-ink">{money(sales)}</p>
          <p className="mt-2 text-ui text-ink-2">
            {goal > 0 ? (
              <>
                <span className={cn("font-semibold", progress >= 100 ? "text-ok" : "text-ink")}>{progress}%</span>
                {" de la meta · "}
                {remaining > 0 ? `faltan ${money(remaining)}` : `superada por ${money(sales - goal)}`}
              </>
            ) : (
              "Sin meta cargada para hoy"
            )}
          </p>
          <DeskMeter value={progress} className="mt-4" />
          <p className="mt-2 text-caption text-muted">Meta {goal > 0 ? money(goal) : "—"}</p>

          {/* La tendencia vive aquí y no en su propia banda: separada dejaba
              ~200px de vacío bajo la cifra, porque esta columna se estira para
              igualar la altura de la cola de atención. */}
          {/* Sin días sincronizados no se pinta la gráfica: dejaba 180px vacíos
              bajo el título "Tendencia · últimos 0 días", que además no
              significa nada. */}
          {trend.length === 0 ? (
            <p className="mt-8 text-caption text-muted">
              La tendencia aparece en cuanto el RDV sincroniza el primer día del período.
            </p>
          ) : (
            <div className="mt-8">
              <DeskTrendChart data={trend} isDark={isDark} />
            </div>
          )}
        </div>

        <div className="lg:border-l lg:border-line lg:pl-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-ui font-medium text-muted">Requiere atención</h2>
            <Link
              href="/escritorio/pendientes"
              className="flex items-center gap-1 text-caption font-medium text-accent hover:underline"
            >
              Ver pendientes <ChevronRight size={13} />
            </Link>
          </div>

          {attention.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <p className="text-ui font-medium text-ink">Nada crítico abierto</p>
              <p className="mt-1 text-caption text-muted">
                Los pendientes de prioridad alta y crítica aparecen aquí en cuanto se crean.
              </p>
            </div>
          ) : (
            <ul className="mt-3">
              {attention.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Link
                    href="/escritorio/pendientes"
                    className="desk-row flex items-center gap-3 rounded-lg py-2.5 pl-2 pr-1"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        item.overdue ? "bg-danger" : item.priority === "critica" ? "bg-warn" : "bg-muted"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-ui text-ink">{item.title}</span>
                    <span className="shrink-0 text-caption text-muted">{userName(item.ownerId)}</span>
                    {/* El color nunca es la única señal: lo vencido lleva palabra. */}
                    <span
                      className={cn(
                        "w-16 shrink-0 whitespace-nowrap text-right text-caption",
                        item.overdue ? "font-medium text-danger" : "text-muted"
                      )}
                    >
                      {item.overdue ? "Vencido" : shortDate(item.dueDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DeskReveal>

      <hr className="desk-rule" />

      {/* ─── Indicadores secundarios: una fila separada por reglas, no cuatro
           tarjetas de cuatro colores distintos. ─────────────────────────────── */}
      <DeskReveal index={1}>
        <section aria-label="Indicadores del día">
        <dl className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 xl:grid-cols-5 xl:gap-y-0">
          <Metric label="Tickets" value={store?.transactions ? String(store.transactions) : "—"} />
          <Metric label="Piezas" value={store?.pieces ? String(store.pieces) : "—"} />
          <Metric label="UPT" value={upt ? upt.toFixed(2) : "—"} hint="Piezas por ticket" />
          <Metric label="AUR" value={aur ? money(aur) : "—"} hint="Venta por pieza" />
          <Metric
            label="Conversión"
            value={store?.conversion == null ? "—" : `${store.conversion}%`}
            hint={store?.traffic ? `${store.traffic} de tráfico` : "Sin tráfico registrado"}
          />
        </dl>
        </section>
      </DeskReveal>

      <hr className="desk-rule" />

      {/* ─── Equipo + celebraciones ─────────────────────────────────────────── */}
      <DeskReveal index={2} className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-ui font-medium text-muted">Equipo hoy</h2>
            <Link
              href="/escritorio/equipo"
              className="flex items-center gap-1 text-caption font-medium text-accent hover:underline"
            >
              Ver equipo <ChevronRight size={13} />
            </Link>
          </div>

          {ranking.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-10 text-center">
              <p className="text-ui font-medium text-ink">Todavía no hay asesores con datos de hoy</p>
              <p className="mt-1 text-caption text-muted">
                Los números aparecen en cuanto el RDV sincroniza la venta del día.
              </p>
            </div>
          ) : (
            <table className="mt-3 w-full">
              <caption className="sr-only">Venta, meta y alcance de cada asesor el día de hoy</caption>
              <thead>
                <tr className="border-b border-line text-caption font-medium text-muted">
                  <th scope="col" className="py-2 text-left font-medium">Asesor</th>
                  <th scope="col" className="hidden py-2 pl-3 text-left font-medium xl:table-cell">7 días</th>
                  <th scope="col" className="py-2 text-right font-medium">Venta</th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">Meta</th>
                  {/* pl-8: sin esa separación "Meta" y "Alcance" se tocan y se
                      leen como una sola etiqueta. */}
                  <th scope="col" className="w-48 py-2 pl-8 text-left font-medium">Alcance</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.advisor.id} className="desk-row border-b border-line last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProfileAvatar
                          name={row.advisor.name}
                          photoUrl={row.advisor.photoUrl}
                          size="sm"
                          className="size-7 shrink-0 rounded-lg text-[10px] shadow-none"
                        />
                        <span className="truncate text-ui text-ink">{row.advisor.name}</span>
                      </div>
                    </td>
                    <td className="hidden py-2.5 pl-3 xl:table-cell">
                      <Sparkline values={row.series} isDark={isDark} />
                    </td>
                    <td className="py-2.5 text-right text-ui font-medium text-ink">{money(row.sales)}</td>
                    <td className="hidden py-2.5 text-right text-ui text-muted sm:table-cell">
                      {row.goal > 0 ? money(row.goal) : "—"}
                    </td>
                    <td className="py-2.5 pl-8">
                      {row.resting ? (
                        <span className="text-caption text-muted">{row.restText}</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <DeskMeter value={row.progress} className="flex-1" />
                          <span className="w-10 shrink-0 text-right text-caption font-medium text-ink">
                            {row.goal > 0 ? `${row.progress}%` : "—"}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="min-w-0">
          <h2 className="text-ui font-medium text-muted">Próximas celebraciones</h2>
          {celebrations.length === 0 ? (
            <p className="mt-3 text-caption text-muted">Sin cumpleaños en los próximos 30 días.</p>
          ) : (
            <ul className="mt-3">
              {celebrations.map((person) => (
                <li key={person.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                  <ProfileAvatar
                    name={person.name}
                    photoUrl={person.photoUrl}
                    size="sm"
                    className="size-7 shrink-0 rounded-lg text-[10px] shadow-none"
                  />
                  <span className="min-w-0 flex-1 truncate text-ui text-ink">{person.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-caption text-muted">
                    <Cake size={13} />
                    {person.days === 0 ? "Hoy" : person.days === 1 ? "Mañana" : `${person.days} d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </DeskReveal>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="xl:border-l xl:border-line xl:pl-5 xl:first:border-l-0 xl:first:pl-0">
      <dt className="text-caption font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{value}</dd>
      {hint ? <p className="mt-0.5 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}

/** Esqueleto que calca la maqueta real, no un spinner en medio del contenido. */
function DashboardSkeleton() {
  return (
    <div className="space-y-9" aria-busy="true" aria-label="Cargando el resumen del día">
      <section className="grid animate-pulse gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="h-4 w-24 rounded bg-panel" />
          <div className="mt-3 h-11 w-56 rounded bg-panel" />
          <div className="mt-3 h-4 w-64 rounded bg-panel" />
          <div className="mt-4 h-1.5 rounded-full bg-panel" />
        </div>
        <div className="lg:border-l lg:border-line lg:pl-12">
          <div className="h-4 w-32 rounded bg-panel" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-panel" />)}
          </div>
        </div>
      </section>
      <hr className="desk-rule" />
      <section className="grid animate-pulse grid-cols-2 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="h-3 w-16 rounded bg-panel" />
            <div className="mt-2 h-6 w-20 rounded bg-panel" />
          </div>
        ))}
      </section>
      <hr className="desk-rule" />
      <div className="h-56 animate-pulse rounded-xl bg-panel" />
    </div>
  );
}
