"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Cake, CircleAlert, Megaphone, Radio, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { BuenFinBanner } from "@/components/campana/BuenFinBanner";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";
import { DeskTrendChart, Sparkline } from "@/components/desktop/DeskCharts";
import { DesktopError } from "@/components/desktop/DesktopError";
import { InventoryCard } from "@/components/desktop/InventoryCard";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { useTheme } from "@/components/ThemeProvider";
import { ProfileAvatar } from "@/components/ui";
import { upcomingCelebrations } from "@/lib/celebrations";
import { completion, money } from "@/lib/format";
import { buildDesktopSummary, DESKTOP_FOLLOW_UP_THRESHOLD } from "@/lib/escritorio-resumen";
import styles from "./dashboard.module.css";

const longDate = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => shortDate.format(new Date(date + "T00:00:00Z"));
const asMoney = (value: number | null) => value === null ? "—" : money(value);
type Summary = ReturnType<typeof buildDesktopSummary>;

export default function EscritorioDashboard() {
  const { data, error, reload } = useDesktopData();
  const { user } = useDesktopChrome();
  const { isDark } = useTheme();
  const [range, setRange] = useState<7 | 14>(14);
  const summary = useMemo(() => data ? buildDesktopSummary(data) : null, [data]);

  if (error && !summary) return <DesktopError onRetry={reload} />;
  if (!summary || !data) return <DashboardSkeleton />;

  const { store } = summary;
  const name = user?.name.trim().split(/\s+/)[0];
  const trend = summary.trend.slice(-range);
  const celebrations = upcomingCelebrations(data.users, store.date)
    .filter(person => person.type === "cumple").slice(0, 4);

  return (
    <div className={styles.dashboard}>
      <div className={styles.intro}>
        <div>
          <h2>{name ? "Hola, " + name : "Hola"}</h2>
          <time dateTime={store.date}>{longDate.format(new Date(store.date + "T00:00:00Z"))}</time>
        </div>
        <div className={styles.actions}>
          {user?.platformAdmin && (
            <Link className={styles.secondary} href="/escritorio/admin"><Store size={16} aria-hidden /> Administrar tiendas</Link>
          )}
          <Link className={styles.primary} href="/escritorio/en-vivo"><Radio size={17} aria-hidden /> Venta en vivo</Link>
        </div>
      </div>

      <BuenFinBanner variante="amplia" />

      {error && <div className={styles.stale} role="status">Mostrando la última carga. <button type="button" onClick={() => void reload()}>Reintentar</button></div>}

      <div className={styles.grid}>
        <section className={styles.sales} aria-labelledby="desk-sales-today">
          <div className={styles.salesTop}>
            <div>
              <h2 id="desk-sales-today">Venta de hoy</h2>
              <p className={styles.amount}>{asMoney(summary.sales)}</p>
              {summary.sales === null && <p className={styles.muted}>Sin venta capturada</p>}
            </div>
            <SalesGoal sales={summary.sales} goal={store.dailyGoal} />
          </div>
          <dl className={styles.metrics} aria-label="Indicadores del día">
            <Metric label="Tickets" value={summary.transactions ?? "—"} />
            <Metric label="Unidades" value={summary.pieces ?? "—"} />
            <Metric label="UPT" value={summary.upt?.toFixed(2) ?? "—"} hint="Unidades por ticket" />
            <Metric label="Conversión" value={summary.conversion === null ? "—" : summary.conversion + "%"} hint={store.traffic ? store.traffic + " visitas" : undefined} />
            <Metric label="Ticket promedio" value={asMoney(summary.avgTicket)} />
            <Metric label="AUR" value={asMoney(summary.aur)} hint="Venta por unidad" />
          </dl>
        </section>

        <section className={styles.trends} aria-labelledby="desk-trends">
          <div className={styles.sectionHead}>
            <div><h2 id="desk-trends">Tendencia de ventas</h2><p>Venta frente a meta</p></div>
            {summary.trend.length > 0 && (
              <div role="group" aria-label="Días de la tendencia" className={styles.period}>
                {([7, 14] as const).map(days => (
                  <button key={days} type="button" aria-pressed={days === range} onClick={() => setRange(days)}>{days} días</button>
                ))}
              </div>
            )}
          </div>
          {trend.length ? (
            <>
              <DeskTrendChart data={trend} isDark={isDark} />
              <details className={styles.details}>
                <summary>Ver datos de la gráfica</summary>
                <table aria-label="Venta y meta por día">
                  <thead><tr><th scope="col">Día</th><th scope="col">Venta</th><th scope="col">Meta</th></tr></thead>
                  <tbody>{trend.map(day => (
                    <tr key={day.date}>
                      <th scope="row"><time dateTime={day.date}>{formatDay(day.date)}</time></th>
                      <td>{money(day.sales)}</td><td>{day.goal > 0 ? money(day.goal) : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </details>
            </>
          ) : <p className={styles.empty}>La tendencia aparecerá con la primera captura del período.</p>}
        </section>

        <Attention summary={summary} />

        <Team ranking={summary.ranking} isDark={isDark} />

        <aside className={styles.celebrations} aria-labelledby="desk-celebrations">
          <div className={styles.sectionHead}><h2 id="desk-celebrations">Próximas celebraciones</h2><Cake size={18} aria-hidden /></div>
          {celebrations.length > 0 ? <ul>{celebrations.map(person => (
            <li key={person.id}><span>{person.name}</span><span>{person.daysUntil === 0 ? "Hoy" : person.daysUntil === 1 ? "Mañana" : person.daysUntil + " días"}</span></li>
          ))}</ul> : <p className={styles.empty}>Sin cumpleaños en los próximos 30 días.</p>}
        </aside>
      </div>
      <InventoryCard />
    </div>
  );
}

function SalesGoal({ sales, goal }: { sales: number | null; goal: number }) {
  const progress = sales !== null && goal > 0 ? completion(sales, goal) : null;
  const difference = progress === null || sales === null ? null : sales - goal;
  return (
    <div className={styles.goal}>
      <div className={styles.goalHead}><span>Meta diaria</span><strong>{goal > 0 ? money(goal) : "—"}</strong></div>
      {progress !== null && (
        <div className={styles.meter} role="progressbar" aria-label="Alcance de la meta diaria" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, progress))} aria-valuetext={progress + "% de la meta"}>
          <span style={{ width: Math.min(100, Math.max(0, progress)) + "%" }} />
        </div>
      )}
      <div className={styles.goalFoot}>
        {progress === null ? <span>{goal > 0 ? "Esperando captura" : "Sin meta cargada"}</span> : <strong>{progress}% de alcance</strong>}
        {difference !== null && <span>{difference === 0 ? "Meta alcanzada" : difference < 0 ? "Faltan " + money(-difference) : "Sobre meta " + money(difference)}</span>}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div><dt>{label}</dt><dd>{value}{hint && <small>{hint}</small>}</dd></div>;
}

function Attention({ summary }: { summary: Summary }) {
  const { priority, overdueActivities, unconfirmed, names } = summary;
  const groups = [
    { title: "Pendientes prioritarios", href: "/escritorio/pendientes", icon: CircleAlert, count: priority.length,
      items: priority.slice(0, 2).map(item => ({ id: item.id, title: item.title,
        meta: [names.get(item.ownerId), item.overdue ? "Vencido" : item.priority === "critica" ? "Crítico" : "Prioridad alta"].filter(Boolean).join(" · ") })) },
    { title: "Actividades vencidas", href: "/escritorio/plan", icon: CalendarClock, count: overdueActivities.length,
      items: overdueActivities.slice(0, 1).map(item => ({ id: item.id, title: item.title, meta: [names.get(item.userId), formatDay(item.date)].filter(Boolean).join(" · ") })) },
    { title: "Comunicados sin confirmar", href: "/escritorio/comunicados", icon: Megaphone, count: unconfirmed.length,
      items: unconfirmed.slice(0, 1).map(item => ({ id: item.id, title: item.title, meta: item.remaining + (item.remaining === 1 ? " asesor por confirmar" : " asesores por confirmar") })) },
  ];
  return (
    <section className={styles.attention} aria-labelledby="desk-attention">
      <div className={styles.sectionHead}><h2 id="desk-attention">Atención prioritaria</h2></div>
      {groups.map(({ title, href, icon: Icon, count, items }) => (
        <div className={styles.queue} key={href}>
          <Link href={href}>
            <Icon size={17} aria-hidden />
            <span>{title}</span>
            <span className={styles.queueCount} data-active={count > 0}>{count}</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
          {items.length > 0 && <ul>{items.map(item => <li key={item.id}><strong>{item.title}</strong><small>{item.meta}</small></li>)}</ul>}
        </div>
      ))}
    </section>
  );
}

function Team({ ranking, isDark }: { ranking: Summary["ranking"]; isDark: boolean }) {
  const followUp = ranking.filter(row => row.followUp).length;
  return (
    <section className={styles.team} aria-labelledby="desk-team">
      <div className={styles.sectionHead}>
        <div><h2 id="desk-team">Equipo hoy</h2>{followUp > 0 && <p>{followUp} {followUp === 1 ? "asesor con" : "asesores con"} avance menor al {DESKTOP_FOLLOW_UP_THRESHOLD}%</p>}</div>
        <Link href="/escritorio/equipo" className={styles.textLink}>Ver equipo <ArrowRight size={15} aria-hidden /></Link>
      </div>
      {ranking.length === 0 ? <p className={styles.empty}>El ranking aparecerá cuando haya asesores en la tienda.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.teamTable} aria-label="Desempeño de asesores">
            <thead><tr><th scope="col">Asesor</th><th scope="col" className={styles.spark}>7 días</th><th scope="col">Venta</th><th scope="col">Meta</th><th scope="col">Alcance</th><th scope="col">Estado</th></tr></thead>
            <tbody>{ranking.map((row, index) => {
              const ranked = !row.resting && row.progress !== null;
              return (
                <tr key={row.advisor.id}>
                  <th scope="row"><span className={styles.person}>
                    <span className={styles.rank}>{ranked ? index + 1 : "—"}</span>
                    <span aria-hidden><ProfileAvatar name={row.advisor.name} photoUrl={row.advisor.photoUrl} size="sm" className={styles.avatar} /></span>
                    <span>{row.advisor.name}</span>
                  </span></th>
                  <td className={styles.spark}><Sparkline values={row.series} isDark={isDark} /></td>
                  <td>{asMoney(row.sales)}</td>
                  <td>{row.goal > 0 ? money(row.goal) : "—"}</td>
                  <td>{row.resting || row.progress === null ? "—" : row.progress + "%"}</td>
                  <td>{row.resting ? row.restText : row.followUp ? <span className={styles.follow}><ArrowDownRight size={14} aria-hidden /> Seguimiento</span> :
                    row.progress !== null && row.progress >= 100 ? <span className={styles.onGoal}><ArrowUpRight size={14} aria-hidden /> Meta lograda</span> :
                    row.sales === null ? "Sin captura" : row.progress === null ? "Sin meta" : "En curso"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.dashboard} aria-busy="true" aria-label="Cargando el resumen del día">
      <div className={styles.skeletonTitle} aria-hidden />
      <div className={styles.grid} aria-hidden>
        <div className={styles.skeletonSale} /><div className={styles.skeletonAttention} />
        <div className={styles.skeletonChart} /><div className={styles.skeletonTeam} />
      </div>
    </div>
  );
}
