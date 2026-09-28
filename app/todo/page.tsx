"use client";

import Link from "next/link";
import { AppFrame, AppHeader } from "@/components/ui";
import { accesosPara } from "@/lib/accesos-telefono";
import { useSession } from "@/lib/use-session";

/**
 * El catálogo: todas las pantallas del teléfono, en un solo sitio.
 *
 * ⚠️ **Existe porque la barra de abajo bajó de seis destinos a dos.** Se midió
 * lo que se abría de cada pestaña en un mes --Plan 1, Pendientes 5, Chat 15
 * mensajes, Comunicados 4-- mientras Conteos, con 452 conteos, no estaba en la
 * barra. Al recortarla, todo lo que salió de ahí necesitaba una puerta, y ésta
 * es esa puerta: `tests/accesos-telefono.test.ts` falla NOMBRANDO cualquier
 * pantalla que se quede sin ninguna.
 *
 * ⚠️ **La lista NO se escribe aquí.** Sale de `lib/accesos-telefono`, que es la
 * misma que usan «Mi día» y las dos portadas. Una segunda copia se separaría en
 * cuanto alguien agregara una pantalla, y la que se quedaría corta sería
 * justamente la que promete tenerlo todo.
 */
export default function TodoPage() {
  const { session, failed, reload } = useSession();

  // ⚠️ `useSession` NO expone un «cargando»: expone la sesión y si el intento
  // falló. Los dos estados sin sesión son distintos y se enseñan distinto --un
  // esqueleto dice «espera», y un fallo de red dice «reintenta»--. Confundirlos
  // dejaría un esqueleto para siempre sobre un fetch que ya se rindió.
  const accesos = session ? accesosPara(session.role, session.kpisEnabled !== false) : [];

  return (
    <AppFrame>
      <AppHeader title="Todo" subtitle="Todas las pantallas de la app" />

      {failed && !session ? (
        <div className="mt-6 rounded-2xl border border-line bg-card p-5 text-center">
          <p className="text-[13px] text-muted">No se pudo cargar tu sesión.</p>
          <button
            type="button"
            onClick={() => { void reload(); }}
            className="tappable mt-3 min-h-11 rounded-xl bg-ink px-4 text-[13px] font-semibold text-card"
          >
            Reintentar
          </button>
        </div>
      ) : !session ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-panel" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {accesos.map((accion) => (
            <Link
              key={accion.href}
              href={accion.href}
              className="tappable flex min-h-[62px] items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 transition active:scale-[0.985]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-void text-ink/65">
                <accion.icon size={17} />
              </span>
              <span className="min-w-0 text-[13px] font-medium leading-snug tracking-[-0.01em] text-ink/85">
                {accion.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppFrame>
  );
}
