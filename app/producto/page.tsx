import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

/**
 * Página pública de producto de Clarvex Team.
 *
 * ⚠️ **Existe porque el producto no tenía cara propia.** `clarvex.tech` es el
 * sitio de la agencia y su llamada principal es «Cotizar proyecto»; el único
 * sitio de Clarvex Team era la pantalla de acceso. Quien llegaba de fuera veía
 * o una agencia de desarrollo a medida, o un login pidiendo número de empleado.
 * Cloudflare for Startups lo rechazó en septiembre de 2026 exactamente por eso.
 *
 * ⚠️ **Aquí no se cotiza nada ni se vende un desarrollo a medida.** Las dos
 * únicas acciones son entrar a las demos y entrar a la app. Añadir un
 * formulario de «cuéntanos tu proyecto» reintroduce la confusión que esta
 * página existe para deshacer.
 *
 * ⚠️ **Sin precio.** No hay uno público todavía: `SubscriptionPayment` está
 * vacía y lo que aparece en `lib/mercadopago.ts` es un importe de prueba.
 * Inventar una cifra en la página del producto es peor que no ponerla.
 *
 * Las capturas de `public/producto/` salen de las demos REALES, tomadas con
 * Playwright contra producción. No son maquetas.
 */

export const metadata: Metadata = {
  title: "Clarvex Team · Operación de tienda en el teléfono del equipo",
  description:
    "Software de operación para tiendas de retail: metas y ventas del día, horarios, asistencia, inventario cíclico, comisiones y comunicación del equipo. Demo pública, sin registro.",
  openGraph: {
    title: "Clarvex Team",
    description:
      "Operación de tienda en el teléfono del equipo: metas del día, horarios, asistencia, inventario y comisiones.",
    type: "website",
    locale: "es_MX"
  },
  robots: { index: true, follow: true }
};

/** Una fila del listado de módulos. Término y una línea, sin tarjeta. */
function Modulo({ nombre, detalle }: { nombre: string; detalle: string }) {
  return (
    <div className="border-t border-line py-5">
      <dt className="text-[15px] font-semibold text-ink">{nombre}</dt>
      <dd className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-[#55575F]">{detalle}</dd>
    </div>
  );
}

function BotonDemo({ href, titulo, quien }: { href: string; titulo: string; quien: string }) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-[#0B0C0F]">{titulo}</span>
        <span className="block text-[13px] text-[#5A5C66]">{quien}</span>
      </span>
      <span
        aria-hidden
        className="shrink-0 text-lg text-volt transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none"
      >
        →
      </span>
    </Link>
  );
}

export default function ProductoPage() {
  return (
    <div className="bg-void">
      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <header className="bg-[#0B0C0F]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-[17px] font-black tracking-tight text-white">
            CLARVEX <span className="font-medium text-white/55">Team</span>
          </span>
          <Link
            href="/login"
            className="rounded-full border border-white/20 px-4 py-2 text-[14px] font-semibold text-white transition hover:border-white/45 hover:bg-white/5"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ── Portada ───────────────────────────────────────────────────────── */}
      <section className="overflow-hidden bg-[#0B0C0F] pb-20 pt-6 sm:pb-24 sm:pt-10">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <div className="animar-entrada">
            <h1 className="text-balance text-[clamp(2.4rem,6vw,4.1rem)] font-black leading-[1.03] tracking-[-0.035em] text-white">
              La operación de la tienda, en el teléfono del equipo
            </h1>

            <p className="mt-6 max-w-[56ch] text-pretty text-[17px] leading-relaxed text-white/70">
              Clarvex Team reúne en una sola aplicación lo que hoy vive repartido entre hojas de
              cálculo, grupos de mensajes y libretas: la meta y la venta del día, los horarios, la
              asistencia, el inventario cíclico, las comisiones y la comunicación del equipo.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <BotonDemo
                href="/api/demo/manager"
                titulo="Ver la demo de gerencia"
                quien="La tienda completa"
              />
              <BotonDemo
                href="/api/demo/advisor"
                titulo="Ver la demo de asesor"
                quien="Lo que ve quien vende"
              />
            </div>

            <p className="mt-4 text-[13px] text-white/60">
              Sin registro y sin datos. Se abre una tienda de ejemplo, en modo de solo lectura.
            </p>
          </div>

          {/* La captura es de la demo real, no una maqueta. Por eso el pie lo
              dice: en una página de producto, una maqueta bonita y un producto
              que existe se ven igual, y solo una de las dos cosas es cierta. */}
          <figure className="animar-entrada animar-tarde justify-self-center lg:justify-self-end">
            <Image
              src="/producto/manager.png"
              alt="Panel de gerencia: venta del día contra la meta, tickets, equipo activo y pendientes críticos"
              width={390}
              height={844}
              priority
              className="w-[clamp(240px,72vw,332px)] rounded-[2.2rem] border border-white/10 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
            />
            <figcaption className="mt-4 text-center text-[12px] text-white/55">
              Captura de la demo en funcionamiento
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Dos roles ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <h2 className="text-balance text-[clamp(1.7rem,3.4vw,2.5rem)] font-black leading-tight tracking-[-0.03em] text-ink">
          Quien vende y quien dirige no necesitan la misma pantalla
        </h2>
        <p className="mt-4 max-w-[62ch] text-pretty text-[16px] leading-relaxed text-[#55575F]">
          Un asesor ve su meta, su venta, su horario y lo que le toca hoy. No ve la venta de sus
          compañeros ni la de la tienda. La gerencia ve todo eso y además el equipo entero, la
          asistencia y los pendientes. Es la misma aplicación con dos niveles de acceso, no dos
          productos que hay que mantener en paralelo.
        </p>

        <div className="mt-14 grid gap-12 sm:grid-cols-2 sm:gap-8">
          {[
            {
              img: "/producto/advisor.png",
              alt: "Pantalla de asesor: venta del día contra su meta personal, nivel de experiencia y ritmo del turno",
              rol: "Asesor",
              ve: [
                "Su meta del día y cómo va",
                "El ritmo del turno y lo que proyecta",
                "Su horario y sus pendientes",
                "Comunicados y chat del equipo"
              ]
            },
            {
              img: "/producto/manager.png",
              alt: "Panel de gerencia: venta de tienda contra la meta, tickets, asesores activos y pendientes críticos",
              rol: "Gerencia",
              ve: [
                "La venta de tienda contra la meta",
                "Cada asesor, con su alcance",
                "Asistencia, horarios y saldos",
                "Inventario, kardex y cierres"
              ]
            }
          ].map((bloque) => (
            <div key={bloque.rol}>
              <Image
                src={bloque.img}
                alt={bloque.alt}
                width={390}
                height={844}
                className="w-full max-w-[300px] rounded-[2rem] border border-line shadow-[0_24px_50px_-28px_rgba(23,24,28,0.45)]"
              />
              <h3 className="mt-7 text-[19px] font-bold text-ink">{bloque.rol}</h3>
              <ul className="mt-3 space-y-1.5">
                {bloque.ve.map((linea) => (
                  <li key={linea} className="text-[15px] leading-relaxed text-[#55575F]">
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Qué cubre ─────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-panel">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <h2 className="text-balance text-[clamp(1.7rem,3.4vw,2.5rem)] font-black leading-tight tracking-[-0.03em] text-ink">
            Lo que cubre un día de tienda
          </h2>

          <dl className="mt-12 grid gap-x-14 sm:grid-cols-2">
            <Modulo
              nombre="Metas y venta del día"
              detalle="Venta contra meta por persona y de tienda, con UPT, AUR, EPT y conversión. Semana y mes van por calendario retail, no por calendario natural."
            />
            <Modulo
              nombre="Comisiones"
              detalle="Cálculo por tramos de alcance, con el mínimo individual para asesores y el de tienda para la gerencia."
            />
            <Modulo
              nombre="Horarios y asistencia"
              detalle="Horario semanal por persona, entradas y salidas, y un banco de horas que suma lo trabajado de más y descuenta lo que falta."
            />
            <Modulo
              nombre="Vacaciones y días pagados"
              detalle="Saldo calculado, no capturado a mano: el inicial más lo que se gana en cada aniversario, menos lo que ya se tomó."
            />
            <Modulo
              nombre="Inventario cíclico y kardex"
              detalle="Conteo ciego por marbetes, con motivo obligatorio cuando algo baja. La existencia teórica se recalcula entera, nunca se guarda acumulada."
            />
            <Modulo
              nombre="Pendientes y plan del día"
              detalle="Traspasos de turno con responsable y fecha límite, y el plan que la gerencia publica cada mañana."
            />
            <Modulo
              nombre="Comunicados y chat"
              detalle="Avisos con confirmación de lectura y chat del equipo con notificaciones, también con la app cerrada."
            />
            <Modulo
              nombre="Cierre de tienda"
              detalle="Checklist con evidencia fotográfica desde el teléfono de la tienda, sin necesidad de una cuenta por persona."
            />
          </dl>
        </div>
      </section>

      {/* ── Cómo está hecho. Banda de color: aquí el azul carga superficie de
             verdad, en vez de quedarse como acento decorativo. ───────────── */}
      <section className="bg-volt">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="text-balance text-[clamp(1.6rem,3.2vw,2.2rem)] font-black leading-tight tracking-[-0.03em] text-white">
            Multi&#8209;tienda desde el primer día
          </h2>

          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {[
              {
                t: "Cada tienda ve la suya",
                d: "El aislamiento se resuelve en el servidor, contra la sesión. Cambiar un parámetro en la petición no abre la tienda de al lado."
              },
              {
                t: "Hecha para el teléfono",
                d: "Se instala como aplicación, funciona con la pantalla bloqueada y avisa por notificación. El piso de venta no tiene escritorio."
              },
              {
                t: "Los datos son de quien los captura",
                d: "Base propia, respaldo diario cifrado fuera del servidor y registro de auditoría de quién cambió qué."
              }
            ].map((p) => (
              <div key={p.t}>
                <h3 className="text-[17px] font-bold text-white">{p.t}</h3>
                <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-white">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cierre ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <h2 className="text-balance text-[clamp(1.7rem,3.4vw,2.4rem)] font-black leading-tight tracking-[-0.03em] text-ink">
          Ábrela antes de preguntar nada
        </h2>
        <p className="mt-4 max-w-[58ch] text-pretty text-[16px] leading-relaxed text-[#55575F]">
          Las dos demos abren una tienda de ejemplo con datos ficticios. No piden correo, no crean
          cuenta y no guardan nada.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/api/demo/manager"
            className="rounded-2xl bg-volt px-6 py-4 text-center text-[15px] font-bold text-white transition hover:bg-[#1D4ED8]"
          >
            Abrir la demo de gerencia
          </Link>
          <Link
            href="/api/demo/advisor"
            className="rounded-2xl border border-line bg-card px-6 py-4 text-center text-[15px] font-bold text-ink transition hover:border-muted"
          >
            Abrir la demo de asesor
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-[13px] text-[#55575F] sm:flex-row sm:items-center sm:justify-between">
          <p>Clarvex Team. Software de operación para tiendas de retail.</p>
          <div className="flex gap-6">
            <Link href="/login" className="font-semibold text-ink hover:underline">
              Entrar
            </Link>
            <Link href="/terminos" className="hover:underline">
              Términos
            </Link>
            <Link href="/uso-aceptable" className="hover:underline">
              Uso aceptable
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
