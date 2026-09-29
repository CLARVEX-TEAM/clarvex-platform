"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Store, User } from "lucide-react";
import { money } from "@/lib/format";

/**
 * ⚠️ MAQUETA. Se borra en cuanto se elija una.
 *
 * Números de ejemplo, escritos a mano: no consulta nada y no escribe nada. Está
 * para tocarla en el teléfono y decidir cómo entra la venta de TIENDA en «Mi
 * día» de gerencia, que hoy solo enseña la personal.
 */

/* Cifras de una tarde cualquiera, para que las barras se vean a medio camino. */
const TIENDA = { venta: 18240.5, meta: 31355.72, tickets: 34, piezas: 61 };
const MIA = { venta: 1910, meta: 2718.36, tickets: 4, piezas: 7 };

const EQUIPO = [
  { nombre: "Itzel", venta: 6120.0 },
  { nombre: "Waira", venta: 5380.5 },
  { nombre: "Jazmín", venta: 3120.0 },
  { nombre: "Jesús", venta: 1910.0 },
  { nombre: "Alonso", venta: 1710.0 }
];

function grande(valor: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(valor));
}

/** El titular del recuadro, igual que el de «Mi día». */
function Titular({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">{etiqueta}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold opacity-70">$</span>
        <span className="text-[58px] font-bold leading-[0.95] tracking-[-0.045em] tabular-nums">{valor}</span>
      </div>
    </>
  );
}

function Barra({ avance }: { avance: number }) {
  return (
    <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
      <div className="h-2 rounded-full bg-white" style={{ width: `${Math.min(1, avance) * 100}%` }} />
    </div>
  );
}

function Cifra({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div>
      <div className="text-[19px] font-semibold tabular-nums tracking-[-0.02em] text-white">{valor}</div>
      <div className="mt-0.5 text-xs text-white/70">{pie}</div>
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="papel-hero papel-elev-alta relative overflow-hidden rounded-[26px] px-6 py-6 text-white">
      <svg aria-hidden viewBox="0 0 512 512" className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.07]">
        <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------------- A -- */

/**
 * A · La tienda manda, lo tuyo debajo.
 *
 * El número grande es el de la TIENDA porque es el que paga a gerencia --su
 * comisión se calcula sobre la venta de tienda contra el mínimo de tienda, no
 * sobre la suya--. Lo personal no desaparece: baja a una línea.
 */
function VarianteA() {
  const falta = Math.max(0, TIENDA.meta - TIENDA.venta);
  return (
    <Tarjeta>
      <Titular etiqueta="Le falta a la tienda" valor={grande(falta)} />
      <Barra avance={TIENDA.venta / TIENDA.meta} />
      <div className="mt-2.5 flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">{money(TIENDA.venta)}</span>
        <span className="tabular-nums opacity-80">meta {money(TIENDA.meta)}</span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/20 pt-4 text-sm">
        <span className="flex items-center gap-2 opacity-80">
          <User size={15} /> Tu venta
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{money(MIA.venta)}</span>
          <span className="opacity-70"> de {money(MIA.meta)}</span>
        </span>
      </div>

      <div className="mt-6 flex gap-7">
        <Cifra valor={String(TIENDA.tickets)} pie="tickets" />
        <Cifra valor={String(TIENDA.piezas)} pie="piezas" />
        <Cifra valor={(TIENDA.piezas / TIENDA.tickets).toFixed(2)} pie="UPT" />
      </div>
    </Tarjeta>
  );
}

/* --------------------------------------------------------------------- B -- */

/**
 * B · Un conmutador dentro del recuadro.
 *
 * La misma composición sirve para las dos, así que no hay una segunda forma que
 * aprenderse. Lo que se elige se recordaría para la próxima vez. El coste es
 * que una de las dos está siempre escondida.
 */
function VarianteB() {
  const [ver, setVer] = useState<"tienda" | "mia">("tienda");
  const d = ver === "tienda" ? TIENDA : MIA;
  const falta = Math.max(0, d.meta - d.venta);

  return (
    <Tarjeta>
      <div className="mb-5 flex gap-1 rounded-full bg-white/15 p-1">
        {(["tienda", "mia"] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setVer(opcion)}
            aria-pressed={ver === opcion}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              ver === opcion ? "border border-white/70 bg-white/10 text-white" : "border border-transparent text-white/65"
            }`}
          >
            {opcion === "tienda" ? "Tienda" : "Mi venta"}
          </button>
        ))}
      </div>

      <Titular etiqueta={ver === "tienda" ? "Le falta a la tienda" : "Te faltan hoy"} valor={grande(falta)} />
      <Barra avance={d.venta / d.meta} />
      <div className="mt-2.5 flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">{money(d.venta)}</span>
        <span className="tabular-nums opacity-80">meta {money(d.meta)}</span>
      </div>

      <div className="mt-6 flex gap-7">
        <Cifra valor={String(d.tickets)} pie="tickets" />
        <Cifra valor={String(d.piezas)} pie="piezas" />
        <Cifra valor={(d.piezas / d.tickets).toFixed(2)} pie="UPT" />
      </div>
    </Tarjeta>
  );
}

/* --------------------------------------------------------------------- C -- */

/**
 * C · Dos tarjetas, una para cada dueño.
 *
 * El recuadro de arriba no se toca --es el mismo que ve un asesor-- y la tienda
 * baja a su propia tarjeta, que puede crecer con el equipo sin apretar nada.
 * Es lo único que admite el desglose por persona.
 */
function VarianteC() {
  const faltaMia = Math.max(0, MIA.meta - MIA.venta);
  const avance = TIENDA.venta / TIENDA.meta;
  const mayor = Math.max(...EQUIPO.map((p) => p.venta));

  return (
    <>
      <Tarjeta>
        <Titular etiqueta="Te faltan hoy" valor={grande(faltaMia)} />
        <Barra avance={MIA.venta / MIA.meta} />
        <div className="mt-2.5 flex items-baseline justify-between text-sm">
          <span className="font-medium tabular-nums">{money(MIA.venta)}</span>
          <span className="tabular-nums opacity-80">meta {money(MIA.meta)}</span>
        </div>
        <div className="mt-6 flex gap-7">
          <Cifra valor={String(MIA.tickets)} pie="tickets" />
          <Cifra valor={String(MIA.piezas)} pie="piezas" />
          <Cifra valor={(MIA.piezas / MIA.tickets).toFixed(2)} pie="UPT" />
        </div>
      </Tarjeta>

      <div className="mt-3 rounded-[26px] border border-line bg-card px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Store size={14} className="text-volt" /> La tienda
          </span>
          <span className="text-xs font-semibold tabular-nums text-muted">{Math.round(avance * 100)} %</span>
        </div>

        <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
          {money(TIENDA.venta)}
        </p>
        <p className="mt-1 text-sm font-medium text-muted">de {money(TIENDA.meta)}</p>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-panel">
          <div className="h-2 rounded-full bg-volt" style={{ width: `${Math.min(1, avance) * 100}%` }} />
        </div>

        <div className="mt-5 space-y-2.5 border-t border-line pt-4">
          {EQUIPO.map((persona) => (
            <div key={persona.nombre} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-xs font-semibold text-ink">{persona.nombre}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
                <span className="block h-1.5 rounded-full bg-volt/55" style={{ width: `${(persona.venta / mayor) * 100}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
                {money(persona.venta)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- D -- */

/**
 * D · Una barra con DOS pistas.
 *
 * Lo más denso: el avance de la tienda es el relleno y una marca señala hasta
 * dónde llega lo tuyo dentro de ese total. Se lee todo de un vistazo, con el
 * riesgo de que una barra que significa dos cosas se malinterprete.
 */
function VarianteD() {
  const falta = Math.max(0, TIENDA.meta - TIENDA.venta);
  const avance = TIENDA.venta / TIENDA.meta;
  const mio = MIA.venta / TIENDA.meta;

  return (
    <Tarjeta>
      <Titular etiqueta="Le falta a la tienda" valor={grande(falta)} />

      <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-white/25">
        <div className="h-3 rounded-full bg-white/55" style={{ width: `${Math.min(1, avance) * 100}%` }} />
        {/* Lo tuyo, dentro del total: arranca en cero porque es parte de esa venta. */}
        <div className="absolute left-0 top-0 h-3 rounded-full bg-white" style={{ width: `${mio * 100}%` }} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-white" /> Tú {money(MIA.venta)}
        </span>
        <span className="flex items-center gap-1.5 opacity-80">
          <span className="size-2.5 rounded-full bg-white/55" /> Tienda {money(TIENDA.venta)}
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-white/20 pt-4 text-sm">
        <span className="opacity-80">Meta de la tienda</span>
        <span className="font-semibold tabular-nums">{money(TIENDA.meta)}</span>
      </div>

      <div className="mt-6 flex gap-7">
        <Cifra valor={String(TIENDA.tickets)} pie="tickets" />
        <Cifra valor={String(TIENDA.piezas)} pie="piezas" />
        <Cifra valor={(TIENDA.piezas / TIENDA.tickets).toFixed(2)} pie="UPT" />
      </div>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------------- */

const VARIANTES = [
  {
    letra: "A",
    titulo: "La tienda manda",
    porque:
      "El número grande pasa a ser el que de verdad mide a gerencia: su comisión se calcula sobre la venta de TIENDA contra el mínimo de tienda, no sobre la suya. Lo tuyo baja a una línea y no desaparece.",
    Pinta: VarianteA
  },
  {
    letra: "B",
    titulo: "Conmutador",
    porque:
      "La misma composición sirve para las dos, así que no hay una segunda forma que aprenderse, y recordaría lo último elegido. El coste es que una de las dos está siempre escondida.",
    Pinta: VarianteB
  },
  {
    letra: "C",
    titulo: "Dos tarjetas",
    porque:
      "El recuadro de arriba no se toca --es idéntico al del asesor-- y la tienda baja a su propia tarjeta. Es la única que admite el desglose por persona sin apretar nada.",
    Pinta: VarianteC
  },
  {
    letra: "D",
    titulo: "Una barra, dos pistas",
    porque:
      "La más densa: el relleno claro es la tienda y la marca blanca es tu parte dentro de ese total. Se lee todo de un vistazo; el riesgo es que una barra con dos significados se malinterprete.",
    Pinta: VarianteD
  }
];

export default function PrototipoVenta() {
  return (
    <main className="min-h-dvh px-4 pb-16 pt-safe">
      <div className="mx-auto w-full max-w-[460px]">
        <header className="py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Maqueta · se borra después</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            La venta de la tienda en «Mi día»
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Hoy el recuadro enseña <strong className="text-ink">solo la venta personal</strong>, también a
            gerencia. Cuatro formas de meter la de tienda. Los números son de ejemplo.
          </p>
          <p className="mt-3 rounded-2xl border border-line bg-panel px-3.5 py-3 text-xs leading-relaxed text-muted">
            Esto sería solo para gerencia. Un asesor seguiría viendo exactamente lo de ahora: su venta y su
            meta, sin nada de la tienda.
          </p>
        </header>

        {VARIANTES.map(({ letra, titulo, porque, Pinta }) => (
          <section key={letra} className="mb-9">
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-card">
                {letra}
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h2>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-muted">{porque}</p>
            <Pinta />
          </section>
        ))}

        <Link
          href="/mi-dia"
          className="tappable flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-semibold text-ink"
        >
          Volver a Mi día <ChevronRight size={16} />
        </Link>
      </div>
    </main>
  );
}
