"use client";

import { useCallback, useEffect, useState } from "react";
import { CANAL_AVISOS, enContenedorNativo, plataformaNativa, pushNativo } from "@/lib/puente-nativo";

/**
 * Pantalla de diagnóstico de las notificaciones.
 *
 * ⚠️ **Existe porque el fallo de esto es MUDO por naturaleza.** Una notificación
 * que no llega no deja rastro en ninguna pantalla, y la cadena tiene seis
 * eslabones repartidos entre el teléfono, el binario de la app, Google y el
 * servidor. Depurarlo desde fuera es adivinar: se hicieron tres rondas de
 * hipótesis contra los registros del servidor sin acertar. Esto lo enseña.
 *
 * No muestra datos de nadie: solo lo que el aparato es capaz de hacer.
 */

type Linea = { que: string; valor: string; bien: boolean | null };

export default function DiagnosticoPush() {
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [registro, setRegistro] = useState<string[]>([]);

  const anotar = useCallback((texto: string) => {
    setRegistro((previo) => [...previo, texto]);
  }, []);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { PluginHeaders?: { name: string }[] } }).Capacitor;
    const plugin = pushNativo();
    const cabeceras = cap?.PluginHeaders?.map((h) => h.name) ?? [];

    const base: Linea[] = [
      { que: "window.Capacitor", valor: cap ? "presente" : "ausente", bien: Boolean(cap) },
      { que: "Plataforma", valor: plataformaNativa(), bien: plataformaNativa() === "android" },
      { que: "Dentro del contenedor", valor: enContenedorNativo() ? "sí" : "no", bien: enContenedorNativo() },
      {
        que: "Plugins compilados",
        valor: cabeceras.length ? cabeceras.join(", ") : "ninguno",
        bien: cabeceras.length > 0
      },
      {
        que: "Plugin de notificaciones",
        valor: plugin ? "disponible" : "NO disponible",
        bien: Boolean(plugin)
      },
      { que: "API de Push del navegador", valor: "PushManager" in window ? "sí" : "no (normal en la app)", bien: null },
      { que: "API de Notification", valor: "Notification" in window ? "sí" : "no (normal en la app)", bien: null }
    ];
    setLineas(base);

    if (!plugin) return;
    plugin
      .checkPermissions()
      .then((estado) => setLineas((p) => [...(p ?? []), { que: "Permiso del sistema", valor: estado.receive, bien: estado.receive === "granted" }]))
      .catch((e: Error) => anotar(`checkPermissions falló: ${e.message}`));
  }, [anotar]);

  // Reproduce el registro completo, paso a paso y diciendo dónde se corta.
  async function probar() {
    setRegistro([]);
    const plugin = pushNativo();
    if (!plugin) {
      anotar("No hay plugin de notificaciones en esta versión de la app. Hace falta reinstalar el APK correcto.");
      return;
    }
    try {
      anotar("Escuchando el evento de registro…");
      await plugin.addListener("registration", (dato) => {
        anotar(`Google entregó un token de ${dato.value.length} caracteres.`);
        void fetch("/api/push/device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: dato.value, platform: "android" })
        })
          .then((r) => anotar(r.ok ? `Servidor: guardado (${r.status}).` : `Servidor lo rechazó: ${r.status}.`))
          .catch((e: Error) => anotar(`No se pudo llamar al servidor: ${e.message}`));
      });
      await plugin.addListener("registrationError", (dato) => {
        anotar(`Google NO entregó token: ${dato.error}`);
      });

      const estado = await plugin.checkPermissions();
      anotar(`Permiso actual: ${estado.receive}`);
      if (estado.receive !== "granted") {
        const pedido = await plugin.requestPermissions();
        anotar(`Tras pedirlo: ${pedido.receive}`);
        if (pedido.receive !== "granted") {
          anotar("Sin permiso no se puede continuar. Se activa en Ajustes → Apps → Clarvex Team → Notificaciones.");
          return;
        }
      }

      try {
        await plugin.createChannel(CANAL_AVISOS);
        anotar("Canal de avisos creado.");
      } catch (e) {
        anotar(`El canal falló (los avisos llegarían mudos): ${(e as Error).message}`);
      }

      await plugin.register();
      anotar("register() llamado. Esperando a Google…");
    } catch (e) {
      anotar(`Se cortó aquí: ${(e as Error).message}`);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold text-ink">Diagnóstico de notificaciones</h1>
      <p className="mt-2 text-sm text-muted">
        Qué ve la app desde dentro. No muestra datos de nadie.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line">
        {(lineas ?? []).map((l) => (
          <div key={l.que} className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <span className="text-sm text-muted">{l.que}</span>
            <span
              className={`text-right text-sm font-semibold ${
                l.bien === null ? "text-muted" : l.bien ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {l.valor}
            </span>
          </div>
        ))}
        {lineas === null && <div className="px-4 py-3 text-sm text-muted">Mirando…</div>}
      </div>

      <button
        onClick={() => void probar()}
        className="mt-6 w-full rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white"
      >
        Intentar registrar este aparato
      </button>

      {registro.length > 0 && (
        <ol className="mt-4 space-y-2 rounded-2xl border border-line p-4">
          {registro.map((r, i) => (
            <li key={`${i}-${r.slice(0, 24)}`} className="text-sm text-ink">
              <span className="mr-2 text-muted">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
