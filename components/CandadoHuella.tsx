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

/** Cuánto se espera al puente antes de dar por hecho que esto es un navegador. */
const ESPERA_PUENTE_MS = 3_000;
const CADA_MS = 150;

/**
 * Deja escrito por dónde pasó el candado, para poder leerlo en el diagnóstico.
 *
 * ⚠️ **Existe porque tres hipótesis seguidas fueron falsas.** Este componente
 * decide entre seis salidas y todas terminan igual desde fuera: la app con la
 * cara normal, sin pedir nada y sin ningún error. Mirar las condiciones DESPUÉS
 * --que es lo que hacen las demás filas del diagnóstico-- no sirve: para
 * entonces ya valen lo que deberían haber valido. La única forma de saber qué
 * pasó es anotarlo cuando pasa.
 *
 * No guarda ningún dato de nadie: solo por qué rama salió.
 */
function traza(paso: string): void {
  try {
    const w = window as unknown as { __clarvexCandado?: string[] };
    if (!w.__clarvexCandado) w.__clarvexCandado = [];
    // Solo la hora, para ver el orden y cuánto tardó cada paso.
    w.__clarvexCandado.push(`${new Date().toISOString().slice(11, 23)} ${paso}`);
  } catch {
    // Si ni esto se puede, no se rompe nada por un registro.
  }
}

export function CandadoHuella() {
  // Empieza cerrado a propósito: ver el aviso de arriba.
  const [estado, setEstado] = useState<Estado>("comprobando");
  const [motivo, setMotivo] = useState("");
  const plugin = useRef<PluginBiometria | null>(null);
  const salioEn = useRef<number | null>(null);

  const pedir = useCallback(async () => {
    const bio = plugin.current;
    if (!bio) {
      traza("pedir: sin plugin guardado -> abierto");
      setEstado("abierto");
      return;
    }
    traza("pedir: llamando a autenticar()");
    setEstado("pidiendo");
    try {
      const r = await bio.autenticar({
        titulo: "Clarvex Team",
        subtitulo: "Confirma que eres tú para continuar"
      });
      if (r.ok) {
        traza("autenticar: ok -> abierto");
        salioEn.current = null;
        setEstado("abierto");
        return;
      }
      traza(`autenticar: NO ok (cancelado=${r.cancelado})`);
      // Cancelar y fallar no son lo mismo: uno decidió no entrar ahora.
      setMotivo(r.cancelado ? "" : r.motivo ?? "");
      setEstado("rechazado");
    } catch (error) {
      traza(`autenticar: lanzó ${(error as Error).message}`);
      setMotivo((error as Error).message ?? "");
      setEstado("rechazado");
    }
  }, []);

  /*
   * ⚠️ **El puente de Capacitor puede NO ESTAR todavía cuando corre esto.**
   * Se inyecta al arrancar el documento, pero si el WebView del teléfono no
   * admite ese enganche llega más tarde --después de que React monte--. El
   * componente preguntaba una sola vez, veía «no hay contenedor», concluía que
   * no había nada que tapar y se quedaba así para siempre: el candado no pedía
   * la huella NUNCA, con el interruptor encendido y todo verde en el
   * diagnóstico, porque para cuando se mira el puente ya llegó.
   *
   * `PwaRegister` y `ActualizacionApp` sobreviven a esto porque reintentan por
   * evento; este decidía una vez. Es el mismo fallo de familia por tercera vez.
   *
   * Aquí sí toca sondear y no esperar un evento: la llegada del puente no
   * dispara ninguno. Va ACOTADO --tres segundos-- porque en un navegador no va
   * a llegar nunca y no puede quedarse mirando toda la sesión.
   */
  useEffect(() => {
    let cancelado = false;
    let esperado = 0;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const intentar = () => {
      if (cancelado) return;

      if (!enContenedorNativo()) {
        if (esperado >= ESPERA_PUENTE_MS) {
          // Ya no va a llegar: esto es un navegador o la PWA.
          traza(`sin contenedor tras ${esperado} ms -> abierto`);
          setEstado("abierto");
          return;
        }
        esperado += CADA_MS;
        temporizador = setTimeout(intentar, CADA_MS);
        return;
      }

      arrancar();
    };

    const arrancar = () => {
      traza(`contenedor listo tras ${esperado} ms`);
      const bio = biometriaNativa();
      // Una versión de la app sin el plugin: no se tapa nada. Dejarlo cerrado
      // sin poder abrirlo encerraría a la persona fuera.
      if (!bio) {
        traza("sin plugin Biometria -> abierto");
        setEstado("abierto");
        return;
      }
      /*
       * ⚠️ **La referencia se guarda SIEMPRE, también con el candado apagado.**
       * Antes solo se guardaba si ya estaba encendido al abrir la app, así que
       * quien lo activaba desde Perfil se quedaba sin oyente: el candado no
       * hacía absolutamente nada hasta cerrar la app del todo, y sin decirlo.
       * El layout raíz no se vuelve a montar en una navegación de cliente, así
       * que no había segunda oportunidad en toda la sesión.
       */
      plugin.current = bio;

      if (!candadoActivado()) {
        traza("candado APAGADO al montar -> abierto");
        setEstado("abierto");
        return;
      }
      traza("candado encendido, preguntando a disponible()");

      void (async () => {
        const { puede, motivo: porque } = await bio.disponible();
        traza(`disponible(): puede=${puede} motivo=${porque}`);
        if (cancelado) {
          traza("el efecto se habia cancelado: se abandona");
          return;
        }
        if (!puede) {
          // El teléfono ya no tiene huella registrada. Se abre: el candado es
          // una capa de más, no la puerta. Encerrar a alguien porque borró su
          // huella sería peor que no tener candado.
          setEstado("abierto");
          return;
        }
        await pedir();
      })();
    };

    traza("montado");
    intentar();
    return () => {
      traza("desmontado (efecto cancelado)");
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
    };
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
      if (!plugin.current || !candadoActivado()) {
        traza(`al volver: plugin=${Boolean(plugin.current)} candado=${candadoActivado()} -> nada`);
        return;
      }
      const toca = hayQueVolverAPedir(salioEn.current);
      traza(`al volver: salio hace ${salioEn.current ? Date.now() - salioEn.current : "nunca"} ms, toca=${toca}`);
      if (toca) void pedir();
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
