"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, X } from "lucide-react";
import { actualizadorNativo, appNativa, enContenedorNativo, type PluginActualizador } from "@/lib/puente-nativo";
import { hayQueMirar, siguePendiente, urlAbsolutaDeDescarga } from "@/lib/actualizacion-app";

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

  /*
   * ⚠️ **Esto miraba UNA vez por documento y se quedaba con esa respuesta.**
   * El layout raíz no se vuelve a montar en una navegación de cliente, así que
   * quien abría la app estando al día no se enteraba de ninguna publicación
   * posterior hasta cerrarla del todo. Y un 401 en `/login` --donde este
   * componente también monta, porque vive en el layout-- la mataba para toda
   * la sesión. Ver `lib/actualizacion-app.ts`.
   */
  const pendiente = useRef(true);
  const ultimaMirada = useRef(0);
  // Los oyentes de eventos se registran una vez y no ven el estado de React:
  // lo leen por referencia.
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const pluginRef = useRef<PluginActualizador | null>(null);
  const descargandoRef = useRef(false);
  descargandoRef.current = estado === "descargando";
  const pathname = usePathname();

  const comprobar = useCallback(async (forzar = false) => {
    if (!enContenedorNativo()) {
      pendiente.current = false;
      return;
    }
    const actualizador = actualizadorNativo();
    const app = appNativa();
    // Una versión vieja de la app no trae el plugin. No es un fallo: no puede
    // actualizarse sola y hay que mandarle el APK a mano, una última vez.
    if (!actualizador || !app) {
      pendiente.current = false;
      return;
    }
    if (
      !hayQueMirar({
        pendiente: pendiente.current,
        descargando: descargandoRef.current,
        ultimaMirada: ultimaMirada.current,
        ahora: Date.now(),
        forzar
      })
    ) {
      return;
    }
    pluginRef.current = actualizador;
    setPlugin(actualizador);

    try {
      const info = await app.getInfo();
      // ⚠️ Se compara el `build` (versionCode), que es un entero y el único
      // orden fiable. `version` es "1.2" y compararlo como texto pone la 1.10
      // por debajo de la 1.9.
      const instalada = Number.parseInt(info.build, 10);
      const respuesta = await fetch("/api/app/version");
      if (!respuesta.ok) {
        // ⚠️ Un 401 es «todavía no hay sesión», no «no hay actualización».
        pendiente.current = siguePendiente(respuesta.status);
        return;
      }
      const datos = (await respuesta.json()) as Publicada | { hay: false };
      pendiente.current = false;
      ultimaMirada.current = Date.now();
      if (!datos.hay || !Number.isFinite(instalada) || datos.versionCode <= instalada) {
        setEstado("al-dia");
        return;
      }
      setNueva(datos);
      setEstado((antes) => (antes === "descargando" ? antes : "disponible"));
    } catch {
      // Sin red o servidor caído: `pendiente` sigue como estaba, así que se
      // reintenta al volver a la app.
      //
      // ⚠️ No se pisa una tarjeta ya visible. Un corte de señal en una
      // comprobación POSTERIOR haría desaparecer un aviso correcto, y la
      // persona no vería la actualización hasta media hora después.
      setEstado((antes) => (antes === "disponible" || antes === "descargando" ? antes : "al-dia"));
    }
  }, []);

  /*
   * Al arrancar y en cada cambio de pantalla, pero SOLO mientras falte una
   * respuesta buena. Esto dispara también al montar, así que cubre el arranque
   * sin un efecto aparte --con los dos salían dos peticiones a la vez-- y es lo
   * que recupera el 401 del login un instante después de entrar.
   */
  useEffect(() => {
    if (pendiente.current) void comprobar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ⚠️ Y al VOLVER a la app, que es lo que faltaba: sin esto, una versión
  // publicada con la app ya abierta no se ofrecía nunca. `hayQueMirar` lo
  // limita a una vez cada media hora.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        /*
         * ⚠️ **El permiso de instalar se concede FUERA de la app**, en los
         * ajustes de Android, así que al volver la tarjeta seguía diciendo
         * «Abrir ajustes de Android» aunque el permiso ya estuviera dado: había
         * que cerrar la app entera para que se enterase. Nada lo volvía a
         * mirar.
         */
        if (estadoRef.current === "sin-permiso") {
          const p = pluginRef.current;
          if (!p) return;
          try {
            const { permitido } = await p.puedeInstalar();
            // Sigue sin darlo: no se toca la tarjeta, que ya explica qué hacer.
            if (!permitido) return;
          } catch {
            return;
          }
          // ⚠️ Y se pide un enlace NUEVO. El de descarga dura diez minutos, y
          // entre ir a los ajustes, buscar Clarvex en la lista y volver, se
          // puede pasar: sin esto el permiso quedaría bien y la descarga
          // fallaría con un 401 que no dice nada de un token caducado.
          await comprobar(true);
          return;
        }
        void comprobar();
      })();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // ⚠️ ABSOLUTA. Quien descarga es Java --`new URL(url)`--, no el
        // WebView: una ruta relativa lanza `no protocol` y el error sale en
        // rojo en la tarjeta, con el token entero a la vista.
        await plugin.descargarEInstalar({
          url: urlAbsolutaDeDescarga(nueva.url, window.location.origin),
          sha256: nueva.sha256
        });
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
