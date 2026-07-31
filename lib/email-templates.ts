/**
 * Plantillas de los correos transaccionales.
 *
 * Reglas de correo, distintas a las de la app:
 *
 *  - MAQUETADO CON TABLAS. Outlook de escritorio renderiza con el motor de Word:
 *    no entiende flexbox ni grid. Las tablas anidadas son feas y son lo único
 *    que se ve igual en los tres clientes.
 *  - ESTILOS EN LÍNEA. Gmail y Outlook tiran los `<style>` del head.
 *  - Nada de SVG: Gmail no lo renderiza. El logo va en PNG.
 *  - Nada de animación: Gmail borra `@keyframes` y el JavaScript. Un fondo
 *    animado solo sería posible con un GIF, y Outlook lo congela en el primer
 *    fotograma.
 *  - Degradado CON RESPALDO: `background-color` primero y `background-image`
 *    después. Outlook ignora el segundo y se queda con el azul plano, que es
 *    justo lo que queremos que pase.
 *  - Siempre una versión en texto plano. Mejora la entrega y hay clientes que
 *    no pintan HTML.
 *  - EL CORREO TIENE QUE FUNCIONAR SIN IMÁGENES. Muchos clientes las bloquean
 *    por omisión, así que el logo nunca carga solo un texto que haga falta
 *    leer: el título vive en la banda como texto, no dentro de la imagen.
 */

const BRAND = "#2563EB";
const BRAND_DEEP = "#1D4ED8";
const BRAND_LIGHT = "#4F7EF7";
const INK = "#151920";
const MUTED = "#5B6270";
const LINE = "#E3E6EB";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pie legal. Va en todos los correos transaccionales, sobre un fondo un punto
 * más gris para que se lea como pie y no compita con el botón.
 */
function legalFooter(privacyUrl: string): string {
  return `
    <tr>
      <td style="background-color:#F7F8FA;border-top:1px solid ${LINE};padding:16px 24px;font-size:11px;line-height:1.62;color:#6B7280;">
        <p style="margin:0 0 7px 0;"><strong style="color:#4B5563;">Confidencial.</strong> Este mensaje y el enlace que contiene son personales e intransferibles. Si no eres la persona a quien va dirigido, bórralo y no lo reenvíes.</p>
        <p style="margin:0 0 7px 0;">Clarvex Team trata tus datos únicamente para darte acceso a la aplicación y no los comparte con terceros. Puedes consultar el <a href="${privacyUrl}" style="color:#6B7280;text-decoration:underline;">aviso de privacidad</a> completo.</p>
        <p style="margin:0;">Este es un correo automático. No respondas a esta dirección.</p>
      </td>
    </tr>`;
}

export type PinResetEmail = { subject: string; html: string; text: string };

export type PinResetEmailParams = {
  name: string;
  url: string;
  minutes: number;
  /** PNG absoluto. Nada de SVG: Gmail no lo pinta. */
  logoUrl: string;
  privacyUrl: string;
};

export function pinResetEmail({ name, url, minutes, logoUrl, privacyUrl }: PinResetEmailParams): PinResetEmail {
  const firstName = name.split(" ")[0] || "";
  const safeName = escapeHtml(firstName);
  const safeUrl = escapeHtml(url);
  const safeLogo = escapeHtml(logoUrl);
  const safePrivacy = escapeHtml(privacyUrl);

  const subject = "Restablece tu PIN de Clarvex Team";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F1F3;">
  <!-- Preheader: lo que se lee en la lista de la bandeja, antes de abrir.
       Oculto en el cuerpo para no repetirlo dentro del correo. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Elige un PIN nuevo. El enlace caduca en ${minutes} minutos.</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0F1F3;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background-color:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <!-- Banda de marca. El color plano va primero: Outlook ignora el
               degradado y se queda con el, que es el comportamiento buscado. -->
          <tr>
            <td style="background-color:${BRAND_DEEP};background-image:linear-gradient(120deg,${BRAND_DEEP} 0%,${BRAND} 45%,${BRAND_LIGHT} 100%);padding:26px 24px;">
              <!-- Mosaico BLANCO detras del logo: el icono ya es azul y sobre la
                   banda azul se emborronaria. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#FFFFFF;border-radius:11px;padding:6px;line-height:0;">
                    <img src="${safeLogo}" width="34" height="34" alt="Clarvex" style="display:block;width:34px;height:34px;border:0;border-radius:7px;">
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-size:19px;line-height:1.25;font-weight:700;color:#FFFFFF;">Restablece tu PIN</p>
              <p style="margin:4px 0 0 0;font-size:12px;line-height:1.4;color:rgba(255,255,255,0.82);">Clarvex Team</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 24px 4px 24px;">
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:${INK};">Hola${safeName ? ` ${safeName}` : ""}:</p>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:${INK};">Pediste volver a entrar a tu cuenta. Usa este botón para elegir un PIN nuevo.</p>

              <!-- Boton a prueba de Outlook: el color va en el atributo bgcolor
                   de la celda, no solo en el enlace. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">Elegir un PIN nuevo</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 24px 24px 24px;">
              <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:${MUTED};">El enlace caduca en ${minutes} minutos y sirve una sola vez.</p>
              <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:${MUTED};">Si no pediste esto, ignora el correo: tu PIN actual sigue funcionando y nadie ha entrado a tu cuenta.</p>
              <p style="margin:0;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
                Si el botón no abre, copia esta dirección en tu navegador:<br>
                <span style="word-break:break-all;">${safeUrl}</span>
              </p>
            </td>
          </tr>
${legalFooter(safePrivacy)}
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `CLARVEX TEAM
Restablece tu PIN

Hola${firstName ? ` ${firstName}` : ""}:

Pediste volver a entrar a tu cuenta. Abre esta direccion para elegir un PIN nuevo:

${url}

El enlace caduca en ${minutes} minutos y sirve una sola vez.

Si no pediste esto, ignora el correo: tu PIN actual sigue funcionando y nadie ha entrado a tu cuenta.

---
CONFIDENCIAL. Este mensaje y el enlace que contiene son personales e intransferibles.
Si no eres la persona a quien va dirigido, borralo y no lo reenvies.

Clarvex Team trata tus datos unicamente para darte acceso a la aplicacion y no los
comparte con terceros. Aviso de privacidad: ${privacyUrl}

Este es un correo automatico. No respondas a esta direccion.`;

  return { subject, html, text };
}
