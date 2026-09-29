"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { addWeeks, dateKey, startOfWeek } from "@/lib/schedule-week";
import { SHIFT_TYPE_LABELS } from "@/lib/shift-requests";
import type { Role, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Card, ProfileAvatar, Skeleton } from "@/components/ui";
import { SegmentedTabs } from "@/components/animate-ui/SegmentedTabs";
import { PullToRefresh } from "@/components/PullToRefresh";
import { AppSelect } from "@/components/forms";
import { TiraSemana } from "@/components/horarios/TiraSemana";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { HorariosWeb } from "./HorariosWeb";

type ScheduleStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED" | "UNKNOWN";
type ScheduleItem = {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  photoUrl: string | null;
  date: string;
  day: string;
  status: ScheduleStatus;
  statusRaw: string | null;
  startTime: string | null;
  endTime: string | null;
  zone: string | null;
};
/** Quién más entra ese día. Ver el comentario del campo en la API. */
type Companero = {
  date: string;
  userId: string;
  userName: string;
  photoUrl: string | null;
  startTime: string | null;
  endTime: string | null;
};
type ScheduleResponse = {
  weekStart: string;
  weekEnd: string;
  availableWeeks: string[];
  schedules: ScheduleItem[];
  companeros?: Companero[];
  tienda?: { nombre: string | null; direccion: string | null; mapaUrl: string | null };
};

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const statusConfig: Record<ScheduleStatus, { label: string; tone: "success" | "default" | "warn" | "danger" | "info"; className: string }> = {
  WORKING: { label: "Laborando", tone: "success", className: "bg-mint/10 text-mint" },
  OFF: { label: "Descanso", tone: "default", className: "bg-panel text-muted" },
  VACATION: { label: "Vacaciones", tone: "info", className: "bg-sky/10 text-sky" },
  PAID_DAY: { label: "Pago dia", tone: "warn", className: "bg-ember/10 text-ember" },
  INVENTORY: { label: "Conteo", tone: "warn", className: "bg-purple/10 text-purple" },
  TERMINATED: { label: "Baja", tone: "danger", className: "bg-orchid/10 text-orchid" },
  UNKNOWN: { label: "Sin horario", tone: "default", className: "bg-panel text-muted" }
};

/*
 * ⚠️ El rediseño de Horarios es SOLO de la APK. Fuera de ella --navegador,
 * PWA, iPhone-- se pinta la pantalla de antes, `HorariosWeb`.
 *
 * No se decide en el render por lo mismo que `LiquidBottomNav`: el servidor no
 * sabe si es la APK, y decidirlo ahí rompería la hidratación. Mientras no se
 * sabe, no se pinta nada: pintar una y cambiar a la otra sería un salto peor.
 */
export default function HorariosPage() {
  const [enApk, setEnApk] = useState<boolean | null>(null);
  useEffect(() => { setEnApk(enContenedorNativo()); }, []);
  if (enApk === null) return null;
  return enApk ? <HorariosApk /> : <HorariosWeb />;
}

function HorariosApk() {
  const { session } = useSession();
  const [weekStart, setWeekStart] = useState(() => dateKey(startOfWeek(new Date())));
  const [view, setView] = useState<"mine" | "team">("mine");
  const [payload, setPayload] = useState<ScheduleResponse | null>(null);
  const [shiftRequests, setShiftRequests] = useState<Array<{ date: string; type: string; status: string; requester: { name: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const isManager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/shift-requests", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ requests?: Array<{ date: string; type: string; status: string; requester: { name: string } }> }>)
      .then((data) => setShiftRequests((data.requests ?? []).filter((request) => request.status !== "RECHAZADO")))
      .catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ weekStart });
    if (session.role === "ASESOR" || view === "mine") params.set("userId", session.id);
    /*
     * ⚠️ `companeros=1` lo pide SOLO esta pantalla, y solo en la vista propia.
     *
     * Es la única excepción a la regla de que un asesor ve únicamente sus
     * horarios, y está acotada a propósito: contesta «¿con quién me toca?» y
     * nada más -- nombre, foto y horas del día. En la vista de equipo sobra,
     * porque ahí ya se ven todos.
     */
    if (view === "mine") params.set("companeros", "1");
    setLoading(true);
    setError("");
    fetch(`/api/schedules?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ScheduleResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la semana.");
        setPayload(data);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la semana.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [session, view, weekStart, refreshTick]);

  const days = useMemo(() => {
    const firstDay = new Date(`${weekStart}T00:00:00Z`);
    return dayNames.map((name, index) => {
      const date = new Date(firstDay.getTime() + index * 86_400_000);
      const key = dateKey(date);
      return { name, key, date, schedules: payload?.schedules.filter((item) => item.date === key) ?? [] };
    });
  }, [payload, weekStart]);

  const summary = useMemo(() => ({
    working: payload?.schedules.filter((item) => item.status === "WORKING").length ?? 0,
    off: payload?.schedules.filter((item) => item.status === "OFF").length ?? 0,
    vacation: payload?.schedules.filter((item) => item.status === "VACATION").length ?? 0,
    paid: payload?.schedules.filter((item) => item.status === "PAID_DAY").length ?? 0
  }), [payload]);

  /*
   * El mes que se enseña es el del día CENTRAL, no el del primero.
   *
   * ⚠️ Una semana puede caer a caballo entre dos meses --la del 27 de
   * septiembre termina el 3 de octubre-- y tomando el primer día diría
   * «Septiembre» aunque la semana fuera casi toda de octubre.
   *
   * ⚠️ Y el central es el ÍNDICE 3, no el jueves. El jueves es la regla de ISO
   * y vale para semanas que empiezan en lunes; estas empiezan en DOMINGO, así
   * que ahí el jueves es el quinto día. Con la semana del 27 de septiembre
   * --cuatro días de septiembre y tres de octubre-- el jueves daba «Octubre»
   * para una semana mayoritariamente de septiembre. El índice 3 es el centro
   * real de siete días, así que siempre cae del lado que tiene más.
   */
  const diaCentral = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 3 * 86_400_000);
  const mesDeLaSemana = diaCentral.toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" })
    .replace(/^./, (letra) => letra.toUpperCase());
  const anioDeLaSemana = diaCentral.getUTCFullYear();

  const currentWeek = dateKey(startOfWeek(new Date()));
  const today = localDateKey(new Date());

  /*
   * El día que se está mirando. Arranca en hoy si hoy cae dentro de la semana
   * abierta, y si no en su primer día -- al cambiar de semana con las flechas,
   * quedarse en un día que ya no existe dejaría el detalle vacío.
   */
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  const diaVisible = diaElegido && days.some((d) => d.key === diaElegido)
    ? diaElegido
    : (days.some((d) => d.key === today) ? today : days[0]?.key ?? today);
  const detalle = days.find((d) => d.key === diaVisible) ?? null;

  /*
   * Con quién me toca el día que estoy mirando.
   *
   * ⚠️ Solo si YO entro ese día. Si descanso, los demás no son «compañeros de
   * turno»: es simplemente quién trabaja, y eso ya no es la pregunta.
   */
  const entroEseDia = Boolean(detalle?.schedules.some((item) => item.status === "WORKING"));
  const companerosDelDia = entroEseDia
    ? (payload?.companeros ?? []).filter((persona) => persona.date === diaVisible)
    : [];
  const rangeLabel = formatWeekRange(weekStart);

  function moveWeek(amount: number) {
    setWeekStart(dateKey(addWeeks(new Date(`${weekStart}T00:00:00Z`), amount)));
  }

  return (
    <>
      <AppHeader title="Horarios" subtitle={isManager && view === "team" ? "Agenda semanal del equipo." : "Tu agenda semanal."} backHref={isManager ? "/manager" : "/advisor"} />
      <PullToRefresh onRefresh={() => { setRefreshTick((t) => t + 1); return new Promise((r) => setTimeout(r, 700)); }}>
      <AppFrame>
        {/*
          ⚠️ Era una CUARTA forma de pestaña escrita a mano en esta app. Ahora
          usa `SegmentedTabs`, el mismo control que el Semana/Mes de KPIs y el
          Día a día/Incidencias de Asistencia.
        */}
        {isManager ? (
          <SegmentedTabs
            ariaLabel="Vista de horarios"
            className="mb-3"
            value={view}
            onChange={setView}
            options={[
              { value: "mine", label: "Mi agenda" },
              { value: "team", label: "El equipo" }
            ]}
          />
        ) : null}

        {/*
          ⚠️ Una semana es una FORMA, y apilada en vertical la forma desaparece.
          Aquí va entera en una franja: el año y el mes de contexto, y debajo
          los siete días, con el elegido levantado como una tarjeta blanca --el
          único elemento claro de la franja, así que se ve cuál estás mirando
          sin ninguna etiqueta que lo diga.

          ⚠️ El degradado es `.papel-hero`, el mismo de Conteos, Checklist,
          Uniformes y Mi día: sale del logo, así que si cambia la marca cambian
          todos a la vez y no hay un azul suelto que se quede viejo.
        */}
        <section className="papel-hero papel-elev-alta relative overflow-hidden rounded-[26px] px-4 pb-5 pt-5">
          <svg
            aria-hidden
            viewBox="0 0 512 512"
            className="pointer-events-none absolute -right-12 -top-14 size-56 opacity-[0.07]"
          >
            <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
          </svg>

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold opacity-75">{anioDeLaSemana}</p>
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{mesDeLaSemana}</h2>
              <p className="mt-0.5 text-xs opacity-75">Semana {isoWeekNumber(new Date(`${weekStart}T00:00:00Z`))} · {rangeLabel}</p>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                aria-label="Semana anterior"
                onClick={() => moveWeek(-1)}
                className="tappable grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white active:scale-95"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                aria-label="Semana siguiente"
                onClick={() => moveWeek(1)}
                className="tappable grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white active:scale-95"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>

          <TiraSemana
            className="relative mt-4"
            sobreDegradado
            dias={days.map((day) => ({
              name: day.name,
              key: day.key,
              date: day.date,
              trabajan: day.schedules.filter((item) => item.status === "WORKING").length,
              total: day.schedules.length
            }))}
            hoy={today}
            elegido={diaVisible}
            onElegir={setDiaElegido}
            equipo={Boolean(isManager && view === "team")}
          />
        </section>

        {error ? <Card className="mb-3 border-orchid/30 bg-orchid/10 text-sm font-semibold text-orchid">{error}</Card> : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-[20px]" />
            <Skeleton className="h-36 rounded-[20px]" />
          </div>
        ) : (
          <>
            {/*
              El detalle del día que se toca. Antes estaban los siete abiertos a
              la vez, y eso era lo que obligaba a desplazarse.

              ⚠️ Sube POR ENCIMA del degradado con margen negativo, como en la
              referencia: así la franja y la ficha se leen como una sola pieza y
              no como dos tarjetas sueltas. El `z-10` es obligatorio -- sin él el
              degradado, que va después en el árbol, la tapa.
            */}
            {detalle ? (
              <div className="papel-elev relative z-10 -mt-4 overflow-hidden rounded-[22px] border border-line bg-card px-4 pb-4 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-ink">
                    {detalle.name}{detalle.key === today ? " · hoy" : ""}
                  </h3>
                  <p className="text-[11px] text-muted">{formatLongDate(detalle.date)}</p>
                </div>

                <div className="mt-2">
                  {detalle.schedules.length === 0 ? (
                    <p className="py-2 text-sm text-muted">Sin horario para este día.</p>
                  ) : (
                    detalle.schedules.map((item) => (
                      <ScheduleRow key={item.id} item={item} showUser={Boolean(isManager && view === "team")} />
                    ))
                  )}

                  {/*
                    ⚠️ Solo en los días en que YO entro. Quién descansa el
                    martes no es «con quién me toca»: es la vida privada de
                    alguien, y esta pantalla no tiene por qué contarla.
                  */}
                  {view === "mine" && companerosDelDia.length > 0 ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Te toca con</p>
                      <div className="mt-2 space-y-2">
                        {companerosDelDia.map((persona) => (
                          <div key={persona.userId} className="flex items-center gap-2.5">
                            <ProfileAvatar name={persona.userName} photoUrl={persona.photoUrl} size="sm" className="size-8 rounded-full shadow-none" />
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{persona.userName}</p>
                            {persona.startTime ? (
                              <p className="shrink-0 text-xs tabular-nums text-muted">
                                {persona.startTime}{persona.endTime ? ` - ${persona.endTime}` : ""}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/*
                    Dónde es.

                    ⚠️ Solo en los días en que SE ENTRA. En un descanso, el
                    mapa de la tienda no es información: es un recordatorio del
                    trabajo en el día libre de alguien.

                    ⚠️ Y solo si hay mapa GENERADO. Sin coordenadas capturadas
                    no se enseña un hueco ni un «sin ubicación»: simplemente no
                    aparece la sección, porque no falta nada que la persona
                    pueda hacer.
                  */}
                  {entroEseDia && payload?.tienda?.mapaUrl ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Dónde es</p>
                      {/* ⚠️ `<img>` y no `NextImage`: la URL viene FIRMADA, del host
                          `*.r2.cloudflarestorage.com`, que no está en
                          `images.remotePatterns` -- y `NextImage` lo valida
                          incluso con `unoptimized`, así que no cargaría. Es el
                          mismo patrón que usan el chat y la credencial. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={payload.tienda.mapaUrl}
                        alt={`Mapa de ${payload.tienda.nombre ?? "la tienda"}`}
                        loading="lazy"
                        className="mt-2 h-28 w-full rounded-[14px] border border-line object-cover"
                      />
                      {payload.tienda.direccion ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted">{payload.tienda.direccion}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {shiftRequests.filter((request) => request.date === detalle.key).map((request, index) => (
                    <div key={index} className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
                      <CalendarClock size={12} className={request.status === "APROBADO" ? "text-mint" : "text-ember"} />
                      <span className={request.status === "APROBADO" ? "text-mint" : "text-ember"}>
                        {SHIFT_TYPE_LABELS[request.type] ?? request.type} {request.status === "APROBADO" ? "aprobado" : "(pendiente)"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </AppFrame>
      </PullToRefresh>
    </>
  );
}

function ScheduleRow({ item, showUser }: { item: ScheduleItem; showUser: boolean }) {
  const config = statusConfig[item.status];
  const horas = item.startTime
    ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}`
    : null;

  /*
   * ⚠️ El estado se dice UNA vez.
   *
   * Antes el título usaba `config.label` y la insignia también, así que en «Mi
   * agenda» cada renglón repetía «Laborando» dos veces -- y los días sin
   * horario lo decían TRES, porque el subtítulo también cae en `config.label`
   * cuando no hay horas ni `statusRaw`.
   *
   * En mi agenda el dato que se busca son las HORAS, así que van arriba y el
   * estado queda en la insignia. Sin horas, el estado sube al título y la
   * insignia se retira: repetirla sería decir lo mismo dos veces otra vez.
   */
  const titulo = showUser ? item.userName : (horas ?? config.label);
  const secundario = showUser
    ? [horas ?? item.statusRaw ?? config.label, item.zone].filter(Boolean).join(" · ")
    : null;
  const conInsignia = showUser || horas !== null;

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {showUser ? (
          <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="sm" className="size-9 rounded-full shadow-none" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{titulo}</p>
          {secundario ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
              {horas ? <Clock3 size={12} /> : null}
              {secundario}
            </p>
          ) : null}
        </div>
      </div>
      {conInsignia ? <Badge tone={config.tone}>{config.label}</Badge> : null}
    </div>
  );
}

/** Una cifra del resumen, sin caja: es el pie de foto de la semana. */
function Cifra({ label, value, tono }: { label: string; value: number; tono: string }) {
  return (
    <div>
      <div className={`text-[22px] font-semibold tabular-nums tracking-[-0.02em] ${tono}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function formatWeekRange(value: string) {
  const start = new Date(`${value}T00:00:00Z`);
  const end = addWeeks(start, 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  return `${startLabel} - ${endLabel}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}

function isoWeekNumber(date: Date) {
  const target = new Date(date.getTime());
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function localDateKey(date: Date) {
  return dateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}
