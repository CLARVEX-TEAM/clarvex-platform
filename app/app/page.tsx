"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, CircleAlert, Smartphone } from "lucide-react";
import { AppFrame, AppHeader, Card, Skeleton } from "@/components/ui";
import { enContenedorNativo } from "@/lib/puente-nativo";
import type { Reparto } from "@/lib/reparto-app";

/**
 * De dónde se baja la app la PRIMERA vez.
 *
 * ⚠️ **El aviso de actualización no sirve para esto.** Solo se pinta dentro del
 * contenedor nativo, así que quien todavía no tiene la app no lo ve nunca: había
 * que mandarle el archivo por WhatsApp a cada persona, y que además le diera a
 * WhatsApp permiso para instalar. Esta pantalla convierte eso en un enlace que
 * se manda una vez al grupo.
 *
 * ⚠️ **Exige sesión, como todo lo demás.** El enlace de descarga se firma en
 * `/api/app/version` y dura diez minutos: el binario de la app de la tienda no
 * tiene por qué estar al alcance de cualquiera.
 */

type Publicada = {
  hay: true;
  versionName: string;
  novedades: string[];
  bytes: number;
  url: string;
};

function comoPesa(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DescargarApp() {
  const [version, setVersion] = useState<Publicada | null>(null);
  const [sinApk, setSinApk] = useState(false);
  const [reparto, setReparto] = useState<Reparto | null>(null);
  const [cargando, setCargando] = useState(true);
  const dentro = enContenedorNativo();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/app/version");
        if (res.ok) {
          const datos = (await res.json()) as Publicada | { hay: false };
          if (datos.hay) setVersion(datos);
          else setSinApk(true);
        }
      } catch {
        // Sin red: se queda el esqueleto y el aviso de abajo.
      } finally {
        setCargando(false);
      }
      try {
        // 403 para un asesor: no es un fallo, simplemente no ve el reparto.
        const res = await fetch("/api/app/reparto");
        if (res.ok) setReparto((await res.json()) as Reparto);
      } catch {
        /* el reparto es accesorio: su ausencia no rompe la descarga */
      }
    })();
  }, []);

  return (
    <AppFrame>
      <AppHeader title="La app de Android" subtitle="Instalarla y ver quién la tiene" />

      {cargando ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : sinApk ? (
        <Card className="p-4">
          <p className="text-sm text-muted">Todavía no hay ninguna versión publicada.</p>
        </Card>
      ) : version ? (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt/12 text-volt">
              <Smartphone size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink">Clarvex Team {version.versionName}</h2>
              <p className="text-xs text-muted">{comoPesa(version.bytes)} · solo Android</p>
            </div>
          </div>

          {version.novedades.length > 0 && (
            <ul className="mt-3 space-y-1">
              {version.novedades.map((n) => (
                <li key={n} className="text-[13px] leading-5 text-muted">
                  · {n}
                </li>
              ))}
            </ul>
          )}

          {dentro ? (
            // Dentro de la app, bajar el APK a mano es el camino largo: el aviso
            // de actualización lo hace solo y además comprueba el SHA-256.
            <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-muted">
              Ya estás dentro de la app. Cuando haya una versión nueva te aparece sola un aviso para
              instalarla; no hace falta bajarla desde aquí.
            </p>
          ) : (
            <a
              href={version.url}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white"
            >
              <ArrowDownToLine size={16} /> Descargar · {comoPesa(version.bytes)}
            </a>
          )}

          <div className="mt-3 space-y-1.5 text-xs text-muted">
            <p className="font-semibold text-ink">Al instalarla, Android va a preguntar dos cosas:</p>
            <p>
              1. Permiso para instalar desde Chrome. Se concede una vez, en la pantalla que él mismo
              abre.
            </p>
            <p>
              2. Play Protect. Dirá <span className="font-semibold">«Esta app parece segura»</span> y
              hay que tocar Instalar.
            </p>
            <p className="pt-1">
              Si ya tenías una versión anterior, esta se instala encima: no se pierde la sesión ni hay
              que desinstalar nada.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-muted">No se pudo consultar la versión. Revisa tu conexión.</p>
        </Card>
      )}

      {reparto && (
        <Card className="mt-3 p-4">
          <h2 className="font-semibold text-ink">Cómo va el reparto</h2>
          <p className="mt-0.5 text-xs text-muted">
            {reparto.conApp} de {reparto.total} tienen la app
            {reparto.nombrePublicado ? ` · ${reparto.alDia} en la ${reparto.nombrePublicado}` : ""}
          </p>

          <ul className="mt-3 divide-y divide-line">
            {reparto.gente.map((persona) => (
              <li key={persona.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{persona.nombre}</span>
                {persona.alDia ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-mint">
                    <Check size={14} /> {persona.appVersion}
                  </span>
                ) : persona.appVersion ? (
                  <span className="text-xs font-semibold text-ember">{persona.appVersion}</span>
                ) : persona.aparatos > 0 ? (
                  // Registró su aparato antes de que se guardara la versión.
                  <span className="text-xs text-muted">sin saber</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <CircleAlert size={13} /> sin la app
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* ⚠️ Se dice en la pantalla: esta lista NO es de quien no ha querido
              instalarla. Un aparato solo aparece cuando la app registra su token
              para notificaciones, así que quien entre desde el navegador no
              saldrá nunca aunque use la app a diario. */}
          <p className="mt-3 text-xs text-muted">
            «Sin la app» significa que ese teléfono no ha registrado notificaciones todavía. Quien
            entre desde el navegador no aparece aquí aunque use Clarvex a diario.
          </p>
        </Card>
      )}
    </AppFrame>
  );
}
