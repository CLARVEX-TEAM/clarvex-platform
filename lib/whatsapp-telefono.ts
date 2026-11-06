/**
 * Quién escribió por WhatsApp, sin depender del formato del identificador.
 *
 * ⚠️ `UserPhone` guarda `52` + 10 dígitos, pero un celular mexicano llega como
 * `521…@s.whatsapp.net`, y con la privacidad nueva puede llegar como `…@lid`,
 * que NO es un teléfono: el número real viaja aparte, en `remoteJidAlt`.
 * Comparar el texto tal cual ignora a los empleados sin dar ningún error.
 */
export function diezDigitosDelRemitente(remoteJid: string, remoteJidAlt?: string | null): string | null {
  const jid = remoteJid.endsWith("@lid") ? remoteJidAlt ?? "" : remoteJid;
  const digitos = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}
