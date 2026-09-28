"use client";

import { useCallback, useEffect, useState } from "react";
import {
  biometriaNativa,
  CANAL_AVISOS,
  dispositivoClarvexNativo,
  enContenedorNativo,
  plataformaNativa,
  pushNativo,
  scannerDocumentosNativo
} from "@/lib/puente-nativo";
import { candadoActivado } from "@/lib/candado-huella";
import { nativeDeviceFetch, registerNativeDevice } from "@/lib/native-device-client";

/**
 * Pantalla de diagnóstico del aparato.
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

function hayCamara(): boolean {
  const md = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  return typeof md?.getUserMedia === "function";
}

export default function DiagnosticoPush() {
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [registro, setRegistro] = useState<string[]>([]);
  const [traza, setTraza] = useState<string[]>([]);

  const anotar = useCallback((texto: string) => {
    setRegistro((previo) => [...previo, texto]);
  }, []);

  useEffect(() => {
    setTraza((window as unknown as { __clarvexCandado?: string[] }).__clarvexCandado ?? []);
    const cap = (window as unknown as { Capacitor?: { PluginHeaders?: { name: string }[] } }).Capacitor;
    const plugin = pushNativo();
    const cabeceras = cap?.PluginHeaders?.map((h) => h.name) ?? [];

    const base: Linea[] = [
      { que: "window.Capacitor", valor: cap ? "presente" : "ausente", bien: Boolean(cap) },
      { que: "Plataforma", valor: plataformaNativa(), bien: plataformaNativa() === "android" },
      { que: "Dentro del contenedor", valor: enContenedorNativo() ? "sí" : "no", bien: enContenedorNativo() },
      /*
       * ⚠️ Se enseña QUÉ señal contestó, no solo el resultado. El fallo del
       * arranque en frío era que el puente no había llegado todavía; con una
       * sola fila que dijera «sí» eso queda invisible, porque para cuando
       * alguien abre el diagnóstico ya llegó todo.
       */
      {
        que: "Marca de la app en el agente",
        valor: typeof navigator !== "undefined" && /ClarvexApp\/[\d.]+/.test(navigator.userAgent)
          ? (navigator.userAgent.match(/ClarvexApp\/[\d.]+/)?.[0] ?? "sí")
          : "ausente",
        bien: typeof navigator !== "undefined" && navigator.userAgent.includes("ClarvexApp/")
      },
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
      {
        que: "Identidad segura del dispositivo",
        valor: dispositivoClarvexNativo() ? "disponible" : "no incluida en esta versión",
        bien: Boolean(dispositivoClarvexNativo())
      },
      { que: "API de Push del navegador", valor: "PushManager" in window ? "sí" : "no (normal en la app)", bien: null },
      { que: "API de Notification", valor: "Notification" in window ? "sí" : "no (normal en la app)", bien: null },

      // ⚠️ Estas dos NO son de notificaciones, y estan aqui a proposito: fallan
      // igual de calladas y por el mismo motivo -- el WebView no trae encendido
      // lo que el navegador si -- asi que se miran en el mismo sitio.
      {
        que: "Camara (escaner de marbetes)",
        // ⚠️ El tipado de TypeScript da `mediaDevices` por SIEMPRE presente, y
        // no lo esta: desaparece fuera de un contexto seguro y en WebView con la
        // camara sin permiso. Por eso se mira con un tipo propio y opcional; con
        // el de la libreria, la comprobacion se optimiza a `true` y esta fila
        // mentiria justo donde importa.
        valor: hayCamara() ? "disponible" : "NO disponible",
        bien: hayCamara()
      },
      {
        que: "Lector de codigos",
        valor: "BarcodeDetector" in window ? "nativo" : "por jsQR (mas lento, pero sirve)",
        bien: null
      },
      {
        que: "Escáner nativo de documentos",
        valor: scannerDocumentosNativo() ? "disponible" : "no incluido en esta versión",
        bien: Boolean(scannerDocumentosNativo())
      },
      {
        que: "Huella (WebAuthn)",
        valor: window.PublicKeyCredential ? "disponible" : "NO disponible",
        bien: Boolean(window.PublicKeyCredential)
      },

      /*
       * ⚠️ El CANDADO es otra cosa que la huella de WebAuthn, aunque usen el
       * mismo dedo: aquella demuestra al servidor quien eres, este solo decide
       * si se enseña lo que ya esta abierto. Falla igual de callado --el
       * interruptor dice «activado» y no pasa nada-- y tiene cuatro eslabones,
       * asi que se miran los cuatro por separado. Con «no me la pide» a secas no
       * hay forma de saber cual es.
       */
      {
        que: "Candado · plugin Biometria",
        valor: biometriaNativa() ? "disponible" : "NO disponible",
        bien: Boolean(biometriaNativa())
      },
      {
        que: "Candado · activado en este aparato",
        valor: candadoActivado() ? "sí" : "no",
        bien: candadoActivado()
      },
      {
        /*
         * ⚠️ Lo que vio el guion de arranque, ANTES de que React montara nada.
         * Es la ÚNICA forma de saber si el puente de Capacitor llegó tarde:
         * mirarlo más adelante --como hacen todas las filas de arriba-- siempre
         * dice que sí, porque para entonces ya está. Ese desfase es lo que dejó
         * el candado sin pedir la huella con todo lo demás en verde.
         */
        que: "Arranque · puente / nativo / candado",
        valor: (() => {
          const a = (window as unknown as { __clarvexArranque?: { puente: boolean; nativo: boolean; candado: boolean } })
            .__clarvexArranque;
          if (!a) return "el guion no corrió";
          return `${a.puente ? "sí" : "NO"} / ${a.nativo ? "sí" : "NO"} / ${a.candado ? "sí" : "no"}`;
        })(),
        bien: null
      },
      {
        // Lo que decidió el guion de arranque, ANTES del primer pintado. Si dice
        // «no» con el candado activado, el velo se quedaria oculto por CSS.
        que: "Candado · marca de arranque",
        // ⚠️ Se enseña el valor CRUDO. La primera version decia «sin poner»
        // tanto si el guion nunca la puso como si valia "0" --que es lo normal
        // despues de desbloquear-- y son cosas distintas: una es un fallo del
        // arranque y la otra el funcionamiento correcto.
        valor: document.documentElement.dataset.candado ?? "ausente",
        bien: null
      }
    ];
    setLineas(base);

    const devicePlugin = dispositivoClarvexNativo();
    if (devicePlugin) {
      Promise.all([devicePlugin.identidad(), devicePlugin.diagnostico()])
        .then(([identity, diagnostic]) => {
          const freeGb = diagnostic.freeStorageBytes / 1024 / 1024 / 1024;
          setLineas((previous) => [
            ...(previous ?? []),
            { que: "Instalación", valor: identity.installationId.slice(0, 8), bien: true },
            { que: "Llave del dispositivo", valor: identity.keyAlgorithm, bien: identity.keyAlgorithm === "ES256" },
            { que: "Android / equipo", valor: `${diagnostic.androidVersion} · ${diagnostic.manufacturer} ${diagnostic.model}`, bien: true },
            { que: "WebView", valor: diagnostic.webView, bien: diagnostic.webView !== "unknown" },
            { que: "Red", valor: diagnostic.network, bien: diagnostic.network !== "offline" },
            { que: "Hora automática", valor: diagnostic.automaticTime ? "activada" : "desactivada", bien: diagnostic.automaticTime },
            { que: "Almacenamiento libre", valor: `${freeGb.toFixed(1)} GB`, bien: freeGb >= 0.5 },
            { que: "Cámara del sistema", valor: diagnostic.camera ? "disponible" : "no encontrada", bien: diagnostic.camera },
            { que: "Notificaciones Android", valor: diagnostic.notifications ? "permitidas" : "sin permiso", bien: diagnostic.notifications }
          ]);
        })
        .catch((error: Error) => anotar(`Diagnóstico nativo: ${error.message}`));
    }

    // ⚠️ Tener `PublicKeyCredential` NO basta: puede existir y no haber
    // autenticador de plataforma --sin huella registrada en el telefono, o el
    // WebView sin enrutar a los servicios de Google--. Esta es la pregunta que
    // de verdad contesta si la huella va a funcionar.
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((hay) =>
          setLineas((p) => [
            ...(p ?? []),
            { que: "Autenticador del sistema", valor: hay ? "listo" : "no hay", bien: hay }
          ])
        )
        .catch((e: Error) => anotar(`No se pudo preguntar por el autenticador: ${e.message}`));
    }

    // ⚠️ Que el plugin exista NO basta: el telefono puede no tener lector, o
    // tenerlo sin ninguna huella dada de alta. Son dos problemas distintos --uno
    // no tiene arreglo y el otro se resuelve en los ajustes en un minuto-- y
    // esta es la unica linea que los separa.
    const bio = biometriaNativa();
    if (bio) {
      bio
        .disponible()
        .then(({ puede, motivo }) =>
          setLineas((p) => [
            ...(p ?? []),
            { que: "Candado · el sistema puede pedirla", valor: puede ? "sí" : `no (${motivo})`, bien: puede }
          ])
        )
        .catch((e: Error) => anotar(`Biometria.disponible() falló: ${e.message}`));
    }

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

  async function probarIdentidad() {
    setRegistro([]);
    if (!dispositivoClarvexNativo()) {
      anotar("Esta versión de la APK todavía no incluye identidad segura.");
      return;
    }
    try {
      anotar("Generando o leyendo la llave protegida por Android…");
      const registered = await registerNativeDevice();
      anotar(`Servidor: instalación ${registered.installationId.slice(0, 8)} registrada.`);
      const response = await nativeDeviceFetch("/api/app/native/device");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? `Firma rechazada (${response.status}).`);
      }
      anotar("Firma de un solo uso aceptada. El servidor comprobó la llave registrada de este dispositivo.");
    } catch (error) {
      anotar(`Identidad segura: ${error instanceof Error ? error.message : "falló la comprobación"}`);
    }
  }

  /**
   * Llama al candado a mano y cuenta QUÉ contesta.
   *
   * ⚠️ **Lo que de verdad hace falta saber es si contesta.** Un
   * `BiometricPrompt` que no se puede montar --la actividad todavía no está
   * lista, el diálogo no se puede pintar-- deja la promesa colgada para
   * siempre: desde JavaScript se ve EXACTAMENTE igual que si nunca se hubiera
   * llamado, y la app se queda con la cara normal sin pedir nada. Por eso hay
   * vigilante de tiempo: sin él, un cuelgue y una llamada que no ocurre son
   * indistinguibles, que es justo donde llevamos dos rondas atascados.
   */
  const probarCandado = useCallback(async () => {
    const bio = biometriaNativa();
    if (!bio) {
      anotar("El plugin Biometria no está disponible.");
      return;
    }
    anotar("Llamando a autenticar()…");
    let contesto = false;
    const vigilante = setTimeout(() => {
      if (!contesto) anotar("⚠️ autenticar() NO contestó en 15 s: el diálogo se quedó colgado.");
    }, 15_000);
    try {
      const r = await bio.autenticar({ titulo: "Prueba del candado", subtitulo: "Solo para diagnóstico" });
      contesto = true;
      anotar(`autenticar() contestó: ok=${r.ok}${r.cancelado ? " (cancelado)" : ""}${r.motivo ? ` — ${r.motivo}` : ""}`);
    } catch (e) {
      contesto = true;
      anotar(`autenticar() lanzó: ${(e as Error).message}`);
    } finally {
      clearTimeout(vigilante);
    }
  }, [anotar]);

  return (
    <main className="pt-safe mx-auto max-w-2xl px-4 pb-8" style={{ ["--pt-safe-base" as string]: "2rem" }}>
      <h1 className="text-xl font-semibold text-ink">Diagnóstico del aparato</h1>
      <p className="mt-2 text-sm text-muted">
        Qué ve la app desde dentro. No muestra datos de nadie.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line">
        {(lineas ?? []).map((l) => (
          <div key={l.que} className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <span className="text-sm text-muted">{l.que}</span>
            <span
              className={`text-right text-sm font-semibold ${
                l.bien === null ? "text-muted" : l.bien ? "text-mint" : "text-orchid"
              }`}
            >
              {l.valor}
            </span>
          </div>
        ))}
        {lineas === null && <div className="px-4 py-3 text-sm text-muted">Mirando…</div>}
      </div>

      {/* ⚠️ El camino que tomo el candado AL ARRANCAR. Las filas de arriba dicen
          como estan las cosas AHORA, y ese desfase es justo lo que hizo falla
          tres rondas para ver: el candado decide en el primer segundo y todo lo
          que se mire despues ya vale lo que deberia haber valido. */}
      {traza.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-panel p-3.5">
          <h2 className="text-sm font-semibold text-ink">Qué hizo el candado al arrancar</h2>
          <ol className="mt-2 space-y-1">
            {traza.map((linea, i) => (
              <li key={`${i}-${linea}`} className="font-mono text-[11px] leading-4 text-muted">
                {linea}
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        onClick={() => void probarIdentidad()}
        className="mt-6 w-full rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2"
      >
        Verificar identidad del dispositivo
      </button>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => void probarCandado()}
          className="min-h-12 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2"
        >
          Probar candado
        </button>

        <button
          onClick={() => void probar()}
          className="min-h-12 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2"
        >
          Probar notificaciones
        </button>
      </div>

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
