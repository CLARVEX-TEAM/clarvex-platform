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
    // Una versión de la app sin el plugin, o el candado apagado: no se tapa
    // nada. Dejarlo cerrado sin poder abrirlo encerraría a la persona fuera.
    if (!bio || !candadoActivado()) {
      setEstado("abierto");
      return;
    }
    plugin.current = bio;

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
    if (!plugin.current) return;
    const alCambiar = () => {
      if (document.visibilityState === "hidden") {
        salioEn.current = Date.now();
        return;
      }
      if (hayQueVolverAPedir(salioEn.current)) void pedir();
    };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, [pedir]);

  if (estado === "abierto") return null;

  return (
    <div
      data-transient
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-panel px-8"
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
