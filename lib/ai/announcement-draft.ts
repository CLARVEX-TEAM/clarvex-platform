/**
 * Extrae título y cuerpo de un borrador de comunicado generado por el Copilot.
 * Acepta formatos como:
 *   Título: ...
 *   Cuerpo: ...
 * o markdown **Título** / **Cuerpo**.
 */
export function parseAnnouncementDraft(content: string): { title: string; body: string } | null {
  const text = content.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const titled = text.match(/(?:\*{0,2}|#{1,3}\s*)t[ií]tulo\*{0,2}\s*[:：]\s*(.+?)(?:\n|$)/i);
  const bodied = text.match(/(?:\*{0,2}|#{1,3}\s*)cuerpo\*{0,2}\s*[:：]\s*([\s\S]+)/i);

  if (titled && bodied) {
    const title = cleanLine(titled[1] ?? "");
    const body = cleanBody(bodied[1] ?? "");
    if (title.length >= 3 && body.length >= 3) return { title: title.slice(0, 120), body: body.slice(0, 2000) };
  }

  // Fallback: primera línea corta = título, resto = cuerpo (si parece un anuncio).
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0]!.length <= 120 && !/^borrador\b/i.test(lines[0]!)) {
    const title = cleanLine(lines[0]!.replace(/^\*{1,2}|\*{1,2}$/g, ""));
    const body = cleanBody(lines.slice(1).join("\n"));
    if (title.length >= 3 && body.length >= 3 && /(cup[oó]n|descuento|equipo|comunicado|promo|c[oó]digo)/i.test(text)) {
      return { title: title.slice(0, 120), body: body.slice(0, 2000) };
    }
  }

  return null;
}

function cleanLine(value: string) {
  return value.replace(/^\*{1,2}|\*{1,2}$/g, "").replace(/^["«]|["»]$/g, "").trim();
}

function cleanBody(value: string) {
  return value
    .replace(/^\*{1,2}cuerpo\*{0,2}\s*[:：]\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
