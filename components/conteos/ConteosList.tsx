"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck, ChevronRight, ClipboardList, Plus, ScanBarcode, Settings2, Shirt, SlidersHorizontal } from "lucide-react";
import { ShineBorder } from "@/components/externos/shine-border";
import { NumberTicker } from "@/components/externos/number-ticker";
import { ShimmerButton } from "@/components/externos/shimmer-button";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { useCargaConReintento } from "@/lib/use-carga";
import { NoSePudoCargar } from "@/components/conteos/NoSePudoCargar";

/**
 * Conteos: la pantalla más usada del teléfono --452 marbetes contados en
 * treinta días, medido contra la base el 27 de septiembre de 2026--.
 *
 * Recompuesta ese mismo día. La versión anterior apilaba cuatro bloques del
 * mismo peso --dos botones, el acceso a Dama, el aviso de marbetes y la lista--
 * y ninguno decía a qué se viene. Ahora manda **el conteo de hoy** y lo demás
 * baja de jerarquía.
 *
 * ⚠️ **Y arregla un callejón sin salida.** Con un conteo ya abierto, el botón
 * principal se ponía GRIS y decía «Hay un conteo abierto»: la acción más
 * frecuente del día --seguir contando-- quedaba deshabilitada y había que
 * encontrar el conteo a mano en la lista de abajo. No es hipotético: la tienda
 * no cierra los conteos, así que casi siempre hay uno abierto --el 26 de
 * septiembre había ocho--. Ahora ese mismo sitio dice «Seguir contando» y
 * entra.
 *
 * ⚠️ **Todo esto es SOLO de la APK.** Fuera de ella --navegador, PWA, iPhone,
 * escritorio-- se pinta la lista de antes del rediseño, tal cual estaba. No
 * basta con acotar el CSS a `[data-surface="papel"]`: el marcado también es
 * nuevo --la tarjeta de degradado, la marca de agua, `ShineBorder`--, y sin la
 * superficie papel quedaría a medio pintar. Por eso son dos ramas de marcado
 * sobre el mismo estado, igual que la barra de abajo en `LiquidBottomNav`.
 *
 * Compartida entre `/conteos` y `/escritorio/conteos`.
 */

type CountSummary = {
  id: string;
  date: string;
  status: string;
  theoretical: number | null;
  counted: number;
  totalTags: number;
  pieces: number;
};

function fechaLarga(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function fechaCorta(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function ConteosListView({ desktop = false }: { desktop?: boolean }) {
  const base = desktop ? "/escritorio/conteos" : "/conteos";
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [counts, setCounts] = useState<CountSummary[] | null>(null);
  const [totalTags, setTotalTags] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  /*
   * `null` = todavía no se sabe si estamos en la APK. Se decide en un efecto
   * porque el agente solo existe en el cliente: decidirlo al pintar rompería la
   * hidratación. Mismo criterio que `LiquidBottomNav`.
   */
  const [enApk, setEnApk] = useState<boolean | null>(null);

  useEffect(() => { setEnApk(enContenedorNativo()); }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      setSession(s);
    });
  }, [router]);

  /*
   * ⚠️ **Lanza si el servidor no contestó bien, y eso es a propósito.** Antes
   * esta función no tenía `catch` y `counts` se quedaba en `null`: la pantalla
   * entraba por la rama de «Cargando…» y ahí se quedaba para siempre, sin
   * mensaje y sin nada que tocar. `useCargaConReintento` necesita que el fallo
   * SALGA para poder enseñarlo y reintentarlo al volver la señal.
   */
  const load = useCallback(async () => {
    const res = await fetch("/api/conteos", { cache: "no-store" });
    if (!res.ok) throw new Error(`/api/conteos respondió ${res.status}`);
    const data = (await res.json()) as { counts?: CountSummary[]; totalTags?: number };
    setCounts(data.counts ?? []);
    setTotalTags(data.totalTags ?? 0);
  }, []);

  // Espera a la sesión: sin ella la petición saldría en 401 y el fallo que se
  // enseñaría no sería el de verdad.
  const { fallo, cargando, reintentar } = useCargaConReintento(load, session !== null);

  const manager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";
  const abierto = counts?.find((count) => count.status === "OPEN") ?? null;
  const cerrados = counts?.filter((count) => count.status !== "OPEN") ?? [];
  const avance = abierto && abierto.totalTags > 0 ? abierto.counted / abierto.totalTags : 0;

  async function createCount() {
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/conteos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dashboardDateKey() })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      if (data.id) { router.push(`${base}/${data.id}`); return; }
      /*
       * ⚠️ Ni `id` ni `error`: antes esto no entraba en ninguna rama. El botón
       * se reponía y no pasaba NADA --ni conteo nuevo, ni mensaje-- en la acción
       * principal de la pantalla principal del flujo que la tienda usa a diario.
       */
      setError("El servidor no devolvió el conteo. Vuelve a intentarlo.");
    } catch {
      // ⚠️ Antes había `try`/`finally` SIN `catch`: un corte de red lanzaba, el
      // `finally` reponía el botón y nadie se enteraba. Se lee como «no funciona».
      setError("No se pudo abrir el conteo. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setCreating(false);
    }
  }


  const ultimo = cerrados[0] ?? null;

  if (enApk === null) return null;

  /*
   * Fuera de la APK: la lista de antes del rediseño del 28 de septiembre de
   * 2026 (`bdec39c`), sin cambios. Restaurada del historial.
   */
  if (!enApk) {
    return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
        {manager && (
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => void createCount()}
              disabled={creating || !!abierto}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-volt px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <Plus size={16} /> {abierto ? "Hay un conteo abierto" : creating ? "Abriendo…" : "Abrir conteo de hoy"}
            </button>
            <Link
              href={`${base}/marbetes`}
              className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink transition active:scale-95"
            >
              <Settings2 size={16} /> Marbetes
            </Link>
          </div>
        )}
        {/* Relativo a `base`, NUNCA absoluto: ver el comentario de la rama APK. */}
        <Link
          href={`${base}/dama`}
          className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition active:scale-95"
        >
          <span className="flex items-center gap-2"><CalendarCheck size={16} /> Conteo diario · Dama</span>
          <span className="text-xs font-normal text-muted">Piso de venta</span>
        </Link>
        {error && <p className="mb-2 text-xs font-semibold text-red-500">{error}</p>}
        {manager && totalTags === 0 && counts !== null && (
          <Card className="mb-3 p-4 text-sm font-semibold text-muted">
            Aún no hay marbetes dados de alta. Ve a <Link className="font-semibold text-volt" href={`${base}/marbetes`}>Marbetes</Link> y captura los rangos de tienda y bodega (una sola vez: son fijos).
          </Card>
        )}

        {fallo ? (
          <NoSePudoCargar cargando={cargando} onReintentar={() => void reintentar()} />
        ) : counts === null ? (
          <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>
        ) : counts.length === 0 ? (
          <Card className="p-6 text-center">
            <ClipboardList className="mx-auto mb-2 text-muted" size={28} />
            <p className="text-sm font-bold text-muted">Sin conteos todavía. {manager ? "Abre el primero." : "Gerencia abrirá el próximo conteo."}</p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {counts.map((count) => (
              <Link key={count.id} href={`${base}/${count.id}`}>
                <Card className="p-3.5 transition active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-ink">{fechaLarga(count.date)}</p>
                    <Badge tone={count.status === "OPEN" ? "success" : "default"}>
                      {count.status === "OPEN" ? "En curso" : "Cerrado"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1"><ProgressBar value={count.totalTags > 0 ? (count.counted / count.totalTags) * 100 : 0} /></div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{count.counted}/{count.totalTags}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-muted">{count.pieces.toLocaleString("es-MX")} piezas contadas</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
    );
  }

  return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
      {/*
        EL HÉROE, y se pinta SIEMPRE.

        ⚠️ Antes solo aparecía con un conteo abierto; sin él, la pantalla se
        quedaba en un botón suelto sobre el fondo y parecía vacía aunque la
        tienda tuviera ciento veinte marbetes dados de alta. Ahora el bloque es
        el mismo en los tres estados y lo que cambia es lo que dice dentro: el
        dedo aprende UN sitio, no tres.
      */}
      {fallo ? (
        <NoSePudoCargar cargando={cargando} onReintentar={() => void reintentar()} />
      ) : counts === null ? (
        <div aria-hidden className="h-[196px] animate-pulse rounded-[26px] bg-panel" />
      ) : (
        <div className="papel-hero papel-elev-alta relative overflow-hidden rounded-[26px]">
          {/*
            La marca del logotipo, de agua. Va detrás de todo y recortada por el
            propio bloque: da profundidad sin competir, y es el mismo trazo del
            icono, no un adorno cualquiera.
          */}
          <svg
            aria-hidden
            viewBox="0 0 512 512"
            className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.07]"
          >
            <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
          </svg>
          {/* El brillo del borde superior: la luz que el degradado solo no da. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.55), transparent)" }}
          />
          {/*
            El borde con luz propia. Va SOLO en este bloque y en la fila de
            Dama --dos por pantalla, no en cada tarjeta--: un borde que se mueve
            llama la atención, y si se mueven seis no llama ninguno.

            ⚠️ Es animación continua y eso se paga en batería, en un teléfono
            que pasa la jornada encendido. Por eso va donde de verdad importa.

            ⚠️ `ShineBorder` se apaga solo con el ajuste de movimiento reducido
            del sistema --usa `motion-safe:`--, al contrario que los otros
            componentes del registro, que hay que frenar a mano.
          */}
          <ShineBorder borderWidth={2} duration={13} shineColor={["#FFFFFF", "#8BB8FF", "#FFFFFF"]} />

          {abierto ? (
            <Link href={`${base}/${abierto.id}`} className="tappable block px-6 py-6 transition active:scale-[0.99]">
              <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">Conteo en curso</div>
              <div className="mt-3 flex items-baseline gap-2">
                {/*
                  ⚠️ El número SUBE al abrir, no aparece de golpe. Es lo único
                  animado de la pantalla, y está aquí porque este dato cambia
                  cada vez que alguien escanea: el movimiento dice «esto se
                  mueve». En un dato quieto sería decoración.
                */}
                <NumberTicker
                  value={abierto.counted}
                  className="text-[54px] font-bold leading-none tracking-[-0.04em] text-white tabular-nums"
                />
                <span className="text-xl font-semibold tabular-nums opacity-70">/ {abierto.totalTags}</span>
                <span className="text-sm opacity-80">marbetes</span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.min(100, avance * 100)}%` }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span className="truncate capitalize opacity-80">{fechaLarga(abierto.date)}</span>
                <span className="flex shrink-0 items-center gap-1.5 font-semibold">
                  Seguir contando <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          ) : (
            <div className="px-6 py-6">
              <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">Inventario por marbete</div>
              <p className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
                {manager ? "No hay conteo abierto" : "Sin conteo abierto"}
              </p>
              <p className="mt-2 text-sm leading-relaxed opacity-80">
                {manager
                  ? "Abre el del día y empieza a pasar marbetes con la cámara."
                  : "Gerencia abre el conteo del día."}
              </p>
              {manager ? (
                /* La acción en BLANCO sobre el degradado: es el único punto de
                   la pantalla con ese contraste, así que no compite con nada. */
                <ShimmerButton
                  onClick={() => void createCount()}
                  disabled={creating}
                  background="#FFFFFF"
                  shimmerColor="#287DFF"
                  shimmerDuration="2.6s"
                  borderRadius="16px"
                  className="tappable mt-5 min-h-[52px] w-full text-[15px] font-semibold text-[#071F47] disabled:opacity-70"
                >
                  {creating ? "Abriendo…" : "Abrir el conteo de hoy"}
                </ShimmerButton>
              ) : null}
            </div>
          )}
        </div>
      )}

      {error ? <p className="mt-3 text-sm font-semibold text-orchid">{error}</p> : null}

      {/*
        Tres cifras de contexto, sin cajas. Con tarjetas serían tres bloques
        más compitiendo con el héroe; así son un pie de foto del bloque de
        arriba, que es lo que son.
      */}
      {counts !== null && (totalTags > 0 || counts.length > 0) ? (
        <div className="mt-5 flex items-start gap-6 px-1">
          <div>
            <div className="text-[19px] font-semibold tabular-nums text-ink">{totalTags}</div>
            <div className="mt-0.5 text-xs text-muted">marbetes de alta</div>
          </div>
          <div>
            <div className="text-[19px] font-semibold tabular-nums text-ink">{counts.length}</div>
            <div className="mt-0.5 text-xs text-muted">conteos</div>
          </div>
          {ultimo ? (
            <div>
              <div className="text-[19px] font-semibold tabular-nums text-ink">
                {ultimo.pieces.toLocaleString("es-MX")}
              </div>
              <div className="mt-0.5 text-xs text-muted">piezas, el último</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        ⚠️ El conteo diario de sección es OTRA cosa que el físico: no lleva
        teórico ni cierra ronda. Por eso entra por su propia puerta y no se
        mezcla con la lista de abajo.

        ⚠️ La ruta va relativa a `base`, NUNCA absoluta. Un `/conteos/dama` fijo
        mandaba al escritorio a la pantalla del móvil: son subárboles con
        layouts distintos, así que el navegador recargaba el documento entero y
        con el service worker de por medio la navegación moría en un error.
      */}
      <Link
        href={`${base}/dama`}
        className="papel-elev tappable relative mt-6 flex min-h-[72px] items-center gap-3.5 overflow-hidden rounded-[20px] border border-line bg-card px-4 transition active:scale-[0.99]"
      >
        {/*
          ⚠️ **Aquí ya NO va un borde con luz, y es lo que hace al héroe la firma
          de la pantalla.**

          El comentario de arriba lo dice solo: «un borde que se mueve llama la
          atención, y si se mueven seis no llama ninguno». Eran DOS, y con dos ya
          empieza a pasar: el ojo se reparte entre el degradado y esta fila, que
          es un acceso secundario --el conteo diario de Dama no es el inventario,
          no lleva teórico ni cierra ronda--.

          Con uno solo, el degradado manda sin discusión. La fila conserva su
          sombra, su borde y su icono, que es lo que necesita para leerse como
          tocable.

          De paso deja de haber una animación continua más en un teléfono que
          pasa la jornada encendido.
        */}
        <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-volt/10 text-volt">
          <Shirt size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Conteo diario · Dama</span>
          <span className="mt-0.5 block text-xs text-muted">Piso de venta, sin teórico</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>

      {manager && totalTags === 0 && counts !== null ? (
        /* Estado vacío con forma propia. Un párrafo gris se lee como una nota
           al pie; esto se lee como el siguiente paso, que es lo que es. */
        <div className="papel-elev mt-4 rounded-[20px] border border-line bg-card px-5 py-5 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-[15px] bg-volt/10 text-volt">
            <ScanBarcode size={19} />
          </span>
          <p className="mt-3 text-[15px] font-semibold text-ink">Faltan los marbetes</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Captura los rangos de tienda y bodega. Es una sola vez: son fijos.
          </p>
          <Link
            href={`${base}/marbetes`}
            className="tappable mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-card"
          >
            Dar de alta marbetes
          </Link>
        </div>
      ) : null}

      {/*
        El historial: filas, no tarjetas.

        ⚠️ Con una tarjeta por conteo, treinta conteos son treinta cajas del
        mismo peso que el conteo de hoy, y entonces el de hoy deja de mandar.
        Aquí lo que se busca es «¿cuándo fue el anterior?», no volver a abrirlo.
      */}
      {counts !== null && cerrados.length > 0 ? (
        <section className="mt-8">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.09em] text-muted">Anteriores</h2>
          <div className="papel-elev mt-2 overflow-hidden rounded-[20px] border border-line bg-card">
            {cerrados.map((count, i) => (
              <Link
                key={count.id}
                href={`${base}/${count.id}`}
                className={`tappable flex min-h-16 items-center justify-between gap-3 px-4 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold capitalize text-ink">{fechaCorta(count.date)}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {count.counted} de {count.totalTags} marbetes · {count.pieces.toLocaleString("es-MX")} piezas
                  </span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Configuración: se toca una vez en la vida de la tienda, así que vive al
          final y en pequeño. Antes ocupaba media línea del bloque principal. */}
      {manager && totalTags > 0 ? (
        <Link
          href={`${base}/marbetes`}
          className="tappable mt-8 flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-muted"
        >
          <SlidersHorizontal size={15} /> Administrar marbetes
        </Link>
      ) : null}
    </div>
  );
}
