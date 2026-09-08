"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { biometriaNativa, enContenedorNativo, type PluginBiometria } from "@/lib/puente-nativo";
import { candadoActivado, hayQueVolverAPedir } from "@/lib/candado-huella";

/**
 * Tapa la app hasta que la huella lo confirme.
 *
 * ⚠️ **Esto NO autentica: protege.** La sesión ya vive en la cookie del WebView;
 * el candado solo decide si se enseña. Quien lo confunda con el acceso creerá
 * que el servidor comprobó algo, y no comprobó nada — lo comprobó Android.
 *
 * ⚠️ **Es distinto de la passkey.** Las dos usan el mismo dedo. La passkey
 * demuestra al servidor quién eres cuando la sesión ya no vale; esto solo abre
 * lo que ya estaba abierto. Conviven porque resuelven momentos distintos.
 *
 * ⚠️ **Se pinta ANTES de saber si hace falta.** Si primero se mirara y luego se
 * tapara, habría un instante con la app a la vista: justo lo que el candado
 * viene a evitar, y encima solo visible en el aparato de la tienda.
 */

type Estado = "comprobando" | "abierto" | "cerrado" | "pidiendo" | "rechazado";

export function CandadoHuella() {
  // Empieza cerrado a propósito: ver el aviso de arriba.
  const [estado, setEstado] = useState<Estado>("comprobando");
  const [motivo, setMotivo] = useState("");
  const plugin = useRef<PluginBiometria | null>(null);
  const salioEn = useRef<number | null>(null);

  const pedir = useCallback(async () => {
    const bio = plugin.current;
    if (!bio) {
      setEstado("abierto");
      return;
    }
    setEstado("pidiendo");
    try {
      const r = await bio.autenticar({
        titulo: "Clarvex Team",
        subtitulo: "Confirma que eres tú para continuar"
      });
      if (r.ok) {
        salioEn.current = null;
        setEstado("abierto");
        return;
      }
      // Cancelar y fallar no son lo mismo: uno decidió no entrar ahora.
      setMotivo(r.cancelado ? "" : r.motivo ?? "");
      setEstado("rechazado");
    } catch (error) {
      setMotivo((error as Error).message ?? "");
      setEstado("rechazado");
    }
  }, []);

  useEffect(() => {
    if (!enContenedorNativo()) {
      setEstado("abierto");
      return;
    }
    const bio = biometriaNativa();
    // Una versión de la app sin el plugin: no se tapa nada. Dejarlo cerrado sin
    // poder abrirlo encerraría a la persona fuera.
    if (!bio) {
      setEstado("abierto");
      return;
    }
    /*
     * ⚠️ **La referencia se guarda SIEMPRE, también con el candado apagado.**
     * Antes solo se guardaba si ya estaba encendido al abrir la app, así que
     * quien lo activaba desde Perfil se quedaba sin oyente: el candado no hacía
     * absolutamente nada hasta cerrar la app del todo, y sin decirlo. El layout
     * raíz no se vuelve a montar en una navegación de cliente, así que no había
     * segunda oportunidad en toda la sesión.
     */
    plugin.current = bio;

    if (!candadoActivado()) {
      setEstado("abierto");
      return;
    }

    void (async () => {
      const { puede } = await bio.disponible();
      if (!puede) {
        // El teléfono ya no tiene huella registrada. Se abre: el candado es una
        // capa de más, no la puerta. Encerrar a alguien porque borró su huella
        // sería peor que no tener candado.
        setEstado("abierto");
        return;
      }
      await pedir();
    })();
  }, [pedir]);

  // Volver a pedirlo al regresar de segundo plano, con un minuto de gracia.
  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === "hidden") {
        salioEn.current = Date.now();
        return;
      }
      /*
       * ⚠️ **La preferencia se lee AHORA, no al montar.** Se puede haber
       * encendido --o apagado-- desde Perfil sin que la app se reinicie, y
       * decidirlo al montar es justo lo que hacía que activarlo no sirviera de
       * nada. Por el mismo motivo la comprobación del plugin vive aquí dentro y
       * no en el cuerpo del efecto.
       */
      if (!plugin.current || !candadoActivado()) return;
      if (hayQueVolverAPedir(salioEn.current)) void pedir();
    };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, [pedir]);

  /*
   * ⚠️ **En un navegador la pantalla del candado se veía un instante.** El
   * estado nace en «comprobando», que no es «abierto», así que el velo se
   * pintaba ANTES de que el efecto pudiera mirar si hacía falta: en Brave o en
   * la PWA aparecía el candado y se quitaba solo. Quien lo viera pensaría que la
   * app se cuelga al abrir.
   *
   * Quien decide antes del primer pintado es el guion de arranque de
   * `app/layout.tsx`, igual que con el tema; el CSS mantiene el velo oculto
   * mientras no lo confirme. Aquí solo se pone al día para las veces
   * siguientes --volver de segundo plano-- y NUNCA desde «comprobando», que es
   * lo que devolvería el destello por la puerta de atrás.
   */
  useEffect(() => {
    if (estado === "comprobando") return;
    document.documentElement.dataset.candado = estado === "abierto" ? "0" : "1";
  }, [estado]);

  if (estado === "abierto") return null;

  return (
    <div
      data-transient
      className="candado-pantalla fixed inset-0 z-[100] flex-col items-center justify-center gap-6 bg-panel px-8"
    >
      <span className="grid size-20 place-items-center rounded-full bg-volt/12 text-volt">
        {estado === "pidiendo" ? <Fingerprint size={36} /> : <Lock size={32} />}
      </span>

      <div className="text-center">
        <p className="text-lg font-semibold text-ink">Clarvex Team</p>
        <p className="mt-1 text-sm text-muted">
          {estado === "pidiendo" ? "Esperando tu huella…" : "Confirma que eres tú para continuar"}
        </p>
        {estado === "rechazado" && motivo && <p className="mt-2 text-xs text-rose-500">{motivo}</p>}
      </div>

      {estado !== "pidiendo" && (
        <button
          onClick={() => void pedir()}
          className="w-full max-w-xs rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white"
        >
          Desbloquear
        </button>
      )}
    </div>
  );
}
