import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hashToken, isTokenUsable } from "@/lib/pin-reset";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { ResetPinForm } from "./ResetPinForm";

export const dynamic = "force-dynamic";

/**
 * Paso 2: elegir el PIN nuevo.
 *
 * La validez del enlace se comprueba EN EL SERVIDOR antes de pintar nada. Si el
 * token ya caducó o se usó, la persona ve el aviso de inmediato en vez de
 * teclear un PIN completo para que se lo rechacen al final.
 *
 * Esta comprobación es solo para la interfaz: el endpoint vuelve a validar al
 * confirmar. Entre que se pinta la página y se envía el formulario, el token
 * puede caducar, y quien controle el navegador puede saltarse la pantalla.
 */
export default async function RecuperarTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const row = await prisma.pinResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true, user: { select: { name: true } } }
  });

  const usable = isTokenUsable(row);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-panel px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div
            className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
          >
            <ClarvexIcon size={34} />
          </div>
          <p className="text-[10px] font-semibold tracking-[0.42em] text-volt">CLARVEX TEAM</p>
        </div>

        <div className="rounded-3xl border border-line bg-white p-6 shadow-xs dark:border-line dark:bg-panel">
          {usable ? (
            <ResetPinForm token={token} name={row?.user.name ?? ""} />
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="text-ember" size={18} />
                <h1 className="text-base font-semibold text-ink dark:text-slate-100">Este enlace ya no sirve</h1>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-muted">
                Los enlaces caducan a los 30 minutos y solo se pueden usar una vez. Pide uno nuevo y ábrelo en cuanto
                te llegue.
              </p>
              <Link
                href="/recuperar"
                className="flex w-full items-center justify-center rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white transition hover:bg-volt/12"
              >
                Pedir un enlace nuevo
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/login"
          className="mt-5 flex items-center justify-center text-sm font-medium text-muted transition hover:text-ink dark:hover:text-muted"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </main>
  );
}
