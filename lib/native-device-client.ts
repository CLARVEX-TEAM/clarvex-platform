"use client";

import { dispositivoClarvexNativo, type IdentidadDispositivoNativo } from "@/lib/puente-nativo";
import { resumen } from "@/lib/cola-envio";

type Challenge = {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  payload?: string;
};

type RegisteredDevice = {
  id: string;
  installationId: string;
  profile: string;
  status: string;
  appBuild: number;
  appVersion: string;
};

/**
 * La petición no llegó a salir.
 *
 * ⚠️ **No es lo mismo que «el servidor dijo que no», y confundirlos cuesta caro
 * en los dos sentidos:** dar un corte de señal por definitivo pierde lo que la
 * persona capturó, y reintentar un rechazo real atasca la cola para siempre. Es
 * la misma lección que `getSession()`.
 */
export class SinRed extends Error {
  constructor() { super("No se pudo contactar al servidor."); this.name = "SinRed"; }
}

async function jsonOrError<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error ?? `El servidor respondió ${response.status}.`);
  return payload;
}

async function challenge(installationId: string, purpose: "REGISTER" | "REQUEST"): Promise<Challenge> {
  let response: Response;
  try {
    response = await fetch("/api/app/native/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId, purpose })
    });
  } catch {
    // Sin red ni siquiera hay reto que pedir: es el primer sitio donde se nota.
    throw new SinRed();
  }
  return jsonOrError<Challenge>(response);
}

/** Registra o refresca la asociación de esta instalación con la sesión actual. */
export async function registerNativeDevice(profile?: "PERSONAL" | "KIOSK"): Promise<RegisteredDevice> {
  const plugin = dispositivoClarvexNativo();
  if (!plugin) throw new Error("Esta APK no incluye identidad del dispositivo.");
  const identity = await plugin.identidad();

  /*
   * ⚠️ La salud viaja con el registro, que ya ocurre al abrir la app. Un cron
   * propio para esto sería otra cosa que mantener y que puede fallar callada
   * --como los tres que llevaban semanas sin entregar nada.
   *
   * Si no se puede leer, se manda el registro SIN salud: perder la telemetría
   * no puede costar el registro del aparato, que es lo que sostiene las
   * notificaciones y las funciones firmadas.
   */
  const health = await salud(plugin);
  const issued = await challenge(identity.installationId, "REGISTER");
  if (!issued.payload) throw new Error("El servidor no entregó el texto de registro.");
  const signed = await plugin.firmar({ payload: issued.payload });
  if (signed.installationId !== identity.installationId) {
    throw new Error("La identidad cambió durante el registro.");
  }

  /*
   * ⚠️ El reto lo pone el SERVIDOR --sale del mismo desafío del registro-- y va
   * dentro del certificado que firma el hardware. Sin él, una cadena buena
   * capturada de otro teléfono valdría igual: la atestación no probaría nada de
   * ESTA petición.
   */
  const attestation = await atestacion(plugin, `${issued.challengeId}${issued.nonce}`);
  const response = await fetch("/api/app/native/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: issued.challengeId,
      installationId: identity.installationId,
      publicKey: identity.publicKey,
      signature: signed.signature,
      ...(profile ? { profile } : {}),
      appBuild: identity.appBuild,
      appVersion: identity.appVersion,
      capabilities: identity.capabilities,
      ...(health ? { health } : {}),
      ...(attestation ? { attestation } : {})
    })
  });
  const result = await jsonOrError<{ device: RegisteredDevice }>(response);
  return result.device;
}

/**
 * La cadena de atestación, o `null` si este teléfono no puede.
 *
 * ⚠️ **Nunca lanza, y no poder atestiguar NO es un error.** Emuladores, Android
 * viejo y algunos fabricantes no traen atestación por hardware; tratarlo como
 * fallo dejaría esos equipos sin poder registrarse, que es peor que el ataque
 * del que protege.
 */
async function atestacion(
  plugin: { atestiguar?(options: { reto: string }): Promise<{ disponible: boolean; cadena?: string[] }> },
  reto: string
): Promise<string[] | null> {
  // Una APK anterior a la 1.8 no trae el método: se registra como siempre.
  if (typeof plugin.atestiguar !== "function") return null;
  try {
    const salida = await plugin.atestiguar({ reto });
    return salida.disponible && Array.isArray(salida.cadena) && salida.cadena.length > 0 ? salida.cadena : null;
  } catch {
    return null;
  }
}

/** La salud del equipo, o `null` si no se pudo leer. Nunca lanza. */
async function salud(plugin: { diagnostico(): Promise<Record<string, unknown>> }): Promise<Record<string, string | number | boolean> | null> {
  try {
    const crudo = await plugin.diagnostico();
    const salida: Record<string, string | number | boolean> = {};
    for (const [clave, valor] of Object.entries(crudo)) {
      // El identificador de instalación ya viaja aparte; repetirlo aquí sería
      // guardarlo dos veces en la misma fila.
      if (clave === "installationId") continue;
      if (typeof valor === "string") salida[clave] = valor.slice(0, 128);
      else if (typeof valor === "number" || typeof valor === "boolean") salida[clave] = valor;
    }
    const cola = await resumen().catch(() => null);
    if (cola) {
      salida["colaPendiente"] = cola.pendientes;
      salida["colaFallida"] = cola.fallidas;
    }
    return salida;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function requestManifest(input: {
  challengeId: string;
  nonce: string;
  installationId: string;
  timestamp: string;
  method: string;
  path: string;
  bodySha256: string;
}): string {
  return [
    "clarvex-native-v1",
    "REQUEST",
    input.challengeId,
    input.nonce,
    input.installationId,
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    input.bodySha256.toLowerCase()
  ].join("\n");
}

/** Fetch firmado para endpoints que exigen `requireNativeDevice()`. */
export async function nativeDeviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const plugin = dispositivoClarvexNativo();
  if (!plugin) throw new Error("Esta función requiere la APK registrada.");
  const identity: IdentidadDispositivoNativo = await plugin.identidad();
  const issued = await challenge(identity.installationId, "REQUEST");
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  if (init.body !== undefined && typeof init.body !== "string") {
    throw new Error("Las peticiones nativas firmadas deben usar un cuerpo JSON serializado.");
  }
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("El destino firmado debe ser interno.");
  const timestamp = String(Date.now());
  const payload = requestManifest({
    challengeId: issued.challengeId,
    nonce: issued.nonce,
    installationId: identity.installationId,
    timestamp,
    method,
    path: `${url.pathname}${url.search}`,
    bodySha256: await sha256(body)
  });
  const signed = await plugin.firmar({ payload });
  const headers = new Headers(init.headers);
  headers.set("X-Clarvex-Device-Id", identity.installationId);
  headers.set("X-Clarvex-Device-Challenge", issued.challengeId);
  headers.set("X-Clarvex-Device-Timestamp", timestamp);
  headers.set("X-Clarvex-Device-Signature", signed.signature);
  try {
    return await fetch(`${url.pathname}${url.search}`, { ...init, method, body: body || undefined, headers });
  } catch {
    throw new SinRed();
  }
}
