"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Delata el bucle en el que la app rebota entre el panel y el login.
 *
 * Por qué hace falta: el bucle está hecho de respuestas CORRECTAS —un 401 que
 * el código maneja y un 307 que el middleware emite a propósito—, así que no
 * lanza ninguna excepción y Sentry no tiene nada que capturar. Desde fuera, la
 * app «funciona»; desde dentro, la persona no puede entrar a su cuenta.
 *
 * Ocurrió de verdad: al revocar una sesión, el token seguía pareciéndole válido
 * al middleware —solo verifica la firma, no el `sessionVersion`— y devolvía al
 * panel a quien acababa de ser rechazado. Nadie se enteró por Sentry; nos
 * enteramos porque la tienda avisó.
 *
 * El aviso se manda como MENSAJE, no como error: «bucle de sesión» se lee por
 * lo que es, mientras que un `Failed to fetch` más en una lista de móviles pasa
 * por ruido de señal y nadie lo abre.
 */
const KEY = "clarvex-login-bounces";
/** Vueltas antes de avisar. Dos son un login normal; tres ya es un patrón. */
const THRESHOLD = 3;
/** Un login de verdad no da tres vueltas en menos de esto. */
const WINDOW_MS = 30_000;
/** Un aviso por pestaña: el bucle es rápido y llenaría Sentry en segundos. */
let reported = false;

export type Bounces = { count: number; first: number };

/**
 * La decisión, sin `sessionStorage` ni Sentry de por medio, para poder probarla.
 *
 * `alreadyReported` entra como parámetro en vez de leerse de fuera porque el
 * freno es la mitad del diseño: el bucle gira en segundos y sin él llenaría
 * Sentry con un solo incidente.
 */
export function evaluateBounce(
  previous: Bounces | null,
  now: number,
  alreadyReported: boolean
): { bounces: Bounces; report: boolean } {
  const fresh = !previous || now - previous.first > WINDOW_MS;
  const bounces: Bounces = fresh
    ? { count: 1, first: now }
    : { count: previous.count + 1, first: previous.first };
  return { bounces, report: bounces.count >= THRESHOLD && !alreadyReported };
}

function read(): Bounces | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Bounces) : null;
  } catch {
    return null;
  }
}

/**
 * Se llama justo ANTES de mandar a alguien al login por sesión inválida.
 *
 * Devuelve `true` si acaba de avisar, solo para poder probarlo; quien llama no
 * tiene que hacer nada con ese valor.
 */
export function noteLoginBounce(from: string): boolean {
  const now = Date.now();
  const { bounces, report } = evaluateBounce(read(), now, reported);

  try {
    sessionStorage.setItem(KEY, JSON.stringify(bounces));
  } catch {
    // Sin sessionStorage no se puede contar; mejor no avisar que avisar mal.
    return false;
  }

  if (!report) return false;
  reported = true;
  Sentry.captureMessage("Bucle de sesión: la app rebota entre el panel y el login", {
    level: "error",
    tags: { problema: "bucle-sesion" },
    extra: {
      desde: from,
      vueltas: bounces.count,
      segundos: Math.round((now - bounces.first) / 1000)
    }
  });
  return true;
}

/** Al entrar de verdad se borra la cuenta, para no arrastrarla a la sesión nueva. */
export function clearLoginBounces() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Sin sessionStorage no había nada que borrar.
  }
  reported = false;
}
