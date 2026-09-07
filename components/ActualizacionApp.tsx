"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, X } from "lucide-react";
import { actualizadorNativo, appNativa, enContenedorNativo, type PluginActualizador } from "@/lib/puente-nativo";

/**
 * Avisa de que hay una versión nueva de la app, y la instala.
 *
 * ⚠️ **Esto NO es para las actualizaciones de la web.** La app es la web: cada
 * despliegue llega a todos los teléfonos al abrir, sin instalar nada. Esto solo
 * hace falta cuando cambia la capa NATIVA --un permiso, un plugin-- que pasa
 * cada varios meses. Confundirlo llevaría a repartir un APK por cada arreglo.
 *
 * ⚠️ **Y es temporal.** El día que la app esté en la Play Store, Google reparte
 * las actualizaciones y esto sobra. Ver el comentario del permiso
 * `REQUEST_INSTALL_PACKAGES` en el manifiesto de `clarvex-movil`.
 */

type Publicada = {
  hay: true;
  versionCode: number;
  versionName: string;
  novedades: string[];
  bytes: number;
  sha256: string;
  url: string;
};

type Estado = "mirando" | "al-dia" | "disponible" | "descargando" | "sin-permiso" | "error";

function comoPesa(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ActualizacionApp() {
  const [estado, setEstado] = useState<Estado>("mirando");
  const [nueva, setNueva] = useState<Publicada | null>(null);
  const [porcentaje, setPorcentaje] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [plugin, setPlugin] = useState<PluginActualizador | null>(null);
  const [descartada, setDescartada] = useState(false);

  useEffect(() => {
    if (!enContenedorNativo()) return;
    const actualizador = actualizadorNativo();
    const app = appNativa();
    // Una versión vieja de la app no trae el plugin. No es un fallo: no puede
    // actualizarse sola y hay que mandarle el APK a mano, una última vez.
    if (!actualizador || !app) return;
    setPlugin(actualizador);

    let vivo = true;
    void (async () => {
      try {
        const info = await app.getInfo();
        // ⚠️ Se compara el `build` (versionCode), que es un entero y el único
        // orden fiable. `version` es "1.2" y compararlo como texto pone la 1.10
        // por debajo de la 1.9.
        const instalada = Number.parseInt(info.build, 10);
        const respuesta = await fetch("/api/app/version");
        if (!respuesta.ok || !vivo) return;
        const datos = (await respuesta.json()) as Publicada | { hay: false };
        if (!datos.hay || !Number.isFinite(instalada)) {
          setEstado("al-dia");
          return;
        }
        if (datos.versionCode <= instalada) {
          setEstado("al-dia");
          return;
        }
        setNueva(datos);
        setEstado("disponible");
      } catch {
        // Sin red o servidor caído: no se enseña nada. Volverá a mirar al
        // siguiente arranque.
        setEstado("al-dia");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!plugin || !nueva) return;
    setMotivo("");
    try {
      const { permitido } = await plugin.puedeInstalar();
      if (!permitido) {
        // ⚠️ Desde Android 8 esto no se concede desde un diálogo: hay que ir a
        // los ajustes del sistema. Se comprueba ANTES de bajar ocho megas.
        setEstado("sin-permiso");
        return;
      }
      setEstado("descargando");
      setPorcentaje(0);
      const oyente = await plugin.addListener("progreso", (d) => setPorcentaje(d.porcentaje));
      try {
        await plugin.descargarEInstalar({ url: nueva.url, sha256: nueva.sha256 });
      } finally {
        await oyente.remove();
      }
      // A partir de aquí manda el instalador de Android. Si lo cancela, la
      // tarjeta sigue ahí para volver a intentarlo.
      setEstado("disponible");
    } catch (error) {
      const texto = (error as Error).message ?? "";
      if (texto.includes("PERMISO_INSTALAR")) {
        setEstado("sin-permiso");
        return;
      }
      setMotivo(texto);
      setEstado("error");
    }
  }, [plugin, nueva]);

  if (descartada || !nueva || estado === "mirando" || estado === "al-dia") return null;

  return (
    <div
      data-transient
      className="fixed bottom-20 left-4 right-4 z-50 rounded-2xl border border-volt/30 bg-panel px-4 py-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-2xl bg-volt/12 text-volt">
          <ArrowDownToLine size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Versión {nueva.versionName} de la app
          </p>
          {nueva.novedades.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {nueva.novedades.map((n) => (
                <li key={n} className="text-xs text-muted">
                  · {n}
                </li>
              ))}
            </ul>
          )}

          {estado === "descargando" && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-volt transition-[width] duration-200"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Descargando… {porcentaje}% de {comoPesa(nueva.bytes)}
              </p>
            </div>
          )}

          {estado === "sin-permiso" && (
            <p className="mt-2 text-xs text-muted">
              Android pide tu permiso para instalar desde Clarvex. Se activa una vez y ya.
            </p>
          )}

          {estado === "error" && (
            <p className="mt-2 text-xs text-rose-500">{motivo || "No se pudo descargar. Inténtalo otra vez."}</p>
          )}
        </div>

        {estado !== "descargando" && (
          <button
            onClick={() => setDescartada(true)}
            aria-label="Ahora no"
            className="shrink-0 text-muted"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {estado === "sin-permiso" ? (
        <button
          onClick={() => void plugin?.abrirAjustesDeInstalacion()}
          className="mt-3 w-full rounded-xl bg-volt px-4 py-2 text-sm font-semibold text-white"
        >
          Abrir ajustes de Android
        </button>
      ) : (
        estado !== "descargando" && (
          <button
            onClick={() => void instalar()}
            className="mt-3 w-full rounded-xl bg-volt px-4 py-2 text-sm font-semibold text-white"
          >
            Descargar e instalar · {comoPesa(nueva.bytes)}
          </button>
        )
      )}
    </div>
  );
}
