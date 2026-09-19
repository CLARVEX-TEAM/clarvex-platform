"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, RefreshCw } from "lucide-react";
import { AppFrame, AppHeader, Card, ProfileAvatar } from "@/components/ui";
import { useSession } from "@/lib/use-session";
import QRCode from "qrcode";

/**
 * La credencial de quien la abre.
 *
 * ⚠️ **El enlace del QR se renueva cada vez que se abre esta pantalla.** Así una
 * credencial se mantiene fresca sola y un enlace viejo caduca sin que nadie haga
 * nada — nadie va a acordarse de «renovar su credencial».
 *
 * ⚠️ **Identifica, no autoriza**, y lo dice la propia tarjeta. Un código de
 * identidad se fotografía y se reusa, así que no sirve para fichar ni para
 * aprobar nada; escribirlo en pantalla es más barato que descubrir en marzo que
 * alguien lo usó para la asistencia.
 */

type Credencial = {
  nombre: string;
  puesto: string;
  tienda: string;
  foto: string | null;
  vigenteHasta: string;
  ruta: string;
};

const PUESTOS: Record<string, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor",
  REGIONAL: "Regional"
};

export default function CredencialPage() {
  const { session } = useSession({ redirectOnMissing: true });
  const [datos, setDatos] = useState<Credencial | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    (async () => {
      try {
        const respuesta = await fetch("/api/credencial", { cache: "no-store" });
        const payload = (await respuesta.json()) as Credencial & { error?: string };
        if (!vivo) return;
        if (!respuesta.ok) {
          setError(payload.error ?? "No se pudo cargar tu credencial.");
          return;
        }
        /*
         * El origen lo pone el navegador, no el servidor: fijarlo allá ataría la
         * credencial al dominio de hoy, y este proyecto ya se mudó una vez.
         */
        const svg = await QRCode.toString(`${window.location.origin}${payload.ruta}`, {
          type: "svg",
          margin: 0,
          // `M` aguanta que la pantalla esté rayada o con reflejo, que es como
          // se va a escanear de verdad.
          errorCorrectionLevel: "M"
        });
        if (!vivo) return;
        setDatos(payload);
        setQr(svg);
      } catch {
        if (vivo) setError("No hay conexión. Vuelve a abrirla con señal.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [session]);

  return (
    <>
      <AppHeader
        title="Mi credencial"
        subtitle="Identificación verificable"
        backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"}
      />
      <AppFrame>
        {error ? (
          <Card className="px-5 py-6 text-center text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</Card>
        ) : !datos ? (
          <Card className="grid h-80 place-items-center">
            <RefreshCw size={20} className="animate-spin text-muted" />
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b border-black/5 px-5 py-3 dark:border-white/10">
                <BadgeCheck size={16} className="text-volt" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Clarvex Team</span>
              </div>

              <div className="flex flex-col items-center gap-4 px-6 py-7 text-center">
                <ProfileAvatar name={datos.nombre} photoUrl={datos.foto} size="lg" />

                <div>
                  <p className="text-xl font-bold leading-tight tracking-[-0.02em]">{datos.nombre}</p>
                  <p className="mt-1 text-sm text-muted">
                    {PUESTOS[datos.puesto] ?? datos.puesto} · {datos.tienda}
                  </p>
                </div>

                {qr ? (
                  <div
                    className="w-44 rounded-2xl bg-white p-3 [&>svg]:h-auto [&>svg]:w-full"
                    role="img"
                    aria-label="Código QR para verificar esta credencial"
                    /*
                     * El SVG lo genera `qrcode` a partir de nuestra propia URL:
                     * no es contenido de nadie más. Mismo uso que los marbetes.
                     */
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                ) : null}

                <p className="text-xs font-semibold text-muted">
                  Vigente hasta{" "}
                  {new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(datos.vigenteHasta))}
                </p>
              </div>
            </Card>

            <p className="mt-4 px-3 text-center text-[11px] leading-relaxed text-muted/80">
              Quien escanee el código verá tu nombre, puesto, tienda y vigencia — nada más.
              <br />
              Te identifica; no autoriza descuentos, asistencia ni caja.
            </p>
          </>
        )}
      </AppFrame>
    </>
  );
}
