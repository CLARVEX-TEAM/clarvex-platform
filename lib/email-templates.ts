/**
 * Plantillas de los correos transaccionales.
 *
 * Reglas de correo, distintas a las de la app:
 *  - Estilos EN LÍNEA. Gmail y Outlook tiran los `<style>` del head.
 *  - Nada externo: ni fuentes, ni imágenes remotas, ni CSS. Muchos clientes
 *    bloquean la carga y el correo llegaría roto.
 *  - Siempre una versión en texto plano. Mejora la entrega y hay clientes que
 *    no pintan HTML.
 */

const BRAND = "#2563EB";
const INK = "#151920";
const MUTED = "#5B6270";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PinResetEmail = { subject: string; html: string; text: string };

export function pinResetEmail(params: { name: string; url: string; minutes: number }): PinResetEmail {
  const name = escapeHtml(params.name.split(" ")[0] || "Hola");
  const url = escapeHtml(params.url);
  const { minutes } = params;

  const subject = "Restablece tu PIN de Clarvex Team";

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;border:1px solid #E3E6EB;">
    <tr>
      <td style="padding:32px 32px 8px 32px;">
        <p style="margin:0 0 24px 0;font-size:14px;font-weight:700;color:${BRAND};letter-spacing:0.02em;">CLARVEX TEAM</p>
        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${INK};font-weight:700;">Restablece tu PIN</h1>
        <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:${INK};">Hola ${name}:</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${INK};">
          Pediste volver a entrar a tu cuenta. Usa este botón para elegir un PIN nuevo.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px 32px;">
        <a href="${url}" style="display:inline-block;background:${BRAND};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:8px;">Elegir un PIN nuevo</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px 32px;">
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:${MUTED};">
          El enlace caduca en ${minutes} minutos y sirve una sola vez.
        </p>
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:${MUTED};">
          Si no pediste esto, ignora el correo: tu PIN actual sigue funcionando y nadie ha entrado a tu cuenta.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #E3E6EB;padding-top:16px;">
          Si el botón no abre, copia esta dirección en tu navegador:<br>
          <span style="color:${MUTED};word-break:break-all;">${url}</span>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `CLARVEX TEAM

Hola ${params.name.split(" ")[0] || ""}:

Pediste volver a entrar a tu cuenta. Abre esta direccion para elegir un PIN nuevo:

${params.url}

El enlace caduca en ${minutes} minutos y sirve una sola vez.

Si no pediste esto, ignora el correo: tu PIN actual sigue funcionando y nadie ha entrado a tu cuenta.`;

  return { subject, html, text };
}
