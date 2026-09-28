import type { Metadata } from "next";
import { comoSeDice, estadoDeCredencial, leerCredencial } from "@/lib/credencial";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Verificación pública de una credencial.
 *
 * ⚠️ **Esta página NO pide sesión, y ese es el punto**: supervisión de AXO, el
 * centro comercial o un proveedor tienen que poder comprobar con la cámara y sin
 * instalar nada. Es la única superficie pública de la app que habla de personas.
 *
 * ⚠️ **Por eso enseña lo MÍNIMO**: nombre, puesto, tienda y vigencia. Nunca el
 * número de empleado, el correo ni el teléfono. Un QR fotografiado no puede
 * convertirse en una ficha de personal.
 *
 * ⚠️ **Y se comprueba contra la BASE, no solo la firma.** Una baja deja de
 * verificar al instante aunque su QR siga impreso; con la firma sola, la
 * credencial de quien se fue valdría hasta caducar.
 */

export const metadata: Metadata = {
  title: "Verificación de credencial",
  // Que no acabe en Google: son nombres de personas.
  robots: { index: false, follow: false, nocache: true }
};

const PUESTOS: Record<string, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor",
  REGIONAL: "Regional"
};

export default async function VerificarCredencial({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const datos = leerCredencial(decodeURIComponent(token));

  const user = datos
    ? await prisma.user.findUnique({
        where: { id: datos.u },
        select: { name: true, role: true, active: true, storeId: true, photoUrl: true, store: { select: { name: true } } }
      })
    : null;

  const estado = estadoDeCredencial({
    datos,
    activo: Boolean(user?.active),
    mismaTienda: Boolean(user && datos && user.storeId === datos.s)
  });
  const dicho = comoSeDice(estado);
  const vigente = estado === "vigente";
  const foto = vigente ? await signR2Url(user?.photoUrl ?? null) : null;

  return (
    <main className="grid min-h-screen place-items-center bg-void px-5 py-10">
      <div className="w-full max-w-sm">
        <div
          className={`overflow-hidden rounded-3xl border ${
            dicho.tono === "bien" ? "border-mint/30" : dicho.tono === "malo" ? "border-orchid/30" : "border-white/12"
          } bg-panel`}
        >
          <div
            className={`px-5 py-3 text-center text-sm font-bold ${
              dicho.tono === "bien" ? "bg-mint/12 text-mint"
              : dicho.tono === "malo" ? "bg-orchid/12 text-orchid"
              : "bg-white/6 text-muted"
            }`}
          >
            {dicho.texto}
          </div>

          {vigente && user ? (
            <div className="flex flex-col items-center gap-3 px-6 py-7 text-center">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt="" className="size-24 rounded-full object-cover" />
              ) : (
                <span className="grid size-24 place-items-center rounded-full bg-white/8 text-2xl font-bold text-ink">
                  {user.name.slice(0, 1)}
                </span>
              )}
              <div>
                <p className="text-xl font-bold tracking-[-0.02em] text-ink">{user.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {PUESTOS[user.role] ?? user.role} · {user.store?.name ?? "—"}
                </p>
              </div>
              <p className="text-xs text-muted">
                Vigente hasta{" "}
                {new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(datos!.exp * 1000))}
              </p>
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              {/*
                ⚠️ Cuando NO verifica no se enseña ningún dato de nadie. Decir
                «caducada, era Fulano» convertiría un enlace inválido en una
                forma de averiguar quién trabaja aquí.
              */}
              <p className="text-sm text-muted">
                Pide a la persona que abra su credencial en la aplicación de Clarvex y la muestre de nuevo.
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted/70">
          Verificación emitida por Clarvex Team.<br />
          Esta credencial identifica a quien la porta; no autoriza operaciones.
        </p>
      </div>
    </main>
  );
}
