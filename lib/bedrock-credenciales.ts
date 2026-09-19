/**
 * De dónde saca Bedrock sus credenciales.
 *
 * Hoy la app usa un usuario IAM con llaves en el `.env` --`clarvex-bedrock`--
 * que se creó cuando la app todavía corría fuera de AWS. Corriendo en EC2 ese
 * usuario sobra: la instancia puede llevar un rol y el SDK lo recoge solo.
 *
 * ⚠️ **Y borrar ese usuario sin esto ROMPE producción en silencio.** Los dos
 * módulos de Bedrock exigen las dos llaves y, sin ellas, devuelven «sin
 * credenciales»: el lector del POS se cae a Gemini --más lento, pero funciona--
 * y el reconocimiento de zonas del visual **se queda sin nada**, porque no tiene
 * respaldo. Nadie vería un error: el bot simplemente dejaría de proponer el
 * reparto.
 *
 * ⚠️ **El rol se pide EXPLÍCITAMENTE, no se adivina.** Si bastara con que
 * faltaran las llaves, una máquina de desarrollo sin `.env` se pondría a buscar
 * credenciales que no existen y a esperar tiempos de espera del SDK en vez de
 * decir que no está configurado.
 */

export type CredencialesBedrock =
  | { modo: "llaves"; accessKeyId: string; secretAccessKey: string }
  | { modo: "rol" }
  | null;

/** `null` cuando Bedrock no está configurado de ninguna de las dos formas. */
export function credencialesBedrock(): CredencialesBedrock {
  const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY ?? "";
  /*
   * Las llaves mandan sobre el rol cuando existen las dos: permite dejar el rol
   * activado y volver atrás quitándolo, sin tocar dos sitios a la vez.
   */
  if (accessKeyId && secretAccessKey) return { modo: "llaves", accessKeyId, secretAccessKey };
  /*
   * ⚠️ Se lee AQUÍ y no al cargar el módulo. Congelarlo arriba deja el valor del
   * arranque para toda la vida del proceso, y PM2 recarga con `--update-env`:
   * activarlo exigiría reiniciar del todo sin que nada lo dijera. Es la misma
   * trampa del candado de la huella --leer la preferencia al decidir, no al
   * montar-- que a este proyecto ya le costó una ronda entera.
   */
  if (process.env.BEDROCK_USE_INSTANCE_ROLE === "1") return { modo: "rol" };
  return null;
}

export function bedrockDisponible(): boolean {
  return credencialesBedrock() !== null;
}

/**
 * Lo que se le pasa al cliente del SDK.
 *
 * Con rol se OMITE `credentials`, que es como se le dice al SDK que use su
 * cadena por omisión --y ahí es donde encuentra el rol de la instancia.
 */
export function opcionesDeCliente(credenciales: Exclude<CredencialesBedrock, null>): {
  credentials?: { accessKeyId: string; secretAccessKey: string };
} {
  return credenciales.modo === "llaves"
    ? { credentials: { accessKeyId: credenciales.accessKeyId, secretAccessKey: credenciales.secretAccessKey } }
    : {};
}
