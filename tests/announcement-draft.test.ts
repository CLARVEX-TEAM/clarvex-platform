import assert from "node:assert/strict";
import test from "node:test";
import { parseAnnouncementDraft } from "../lib/ai/announcement-draft";

test("parseAnnouncementDraft lee Título y Cuerpo", () => {
  const draft = parseAnnouncementDraft(`¡Claro! Aquí tienes el borrador:

**Título:** Código de descuento adicional 10%
**Cuerpo:**
Equipo, usen el cupón 750300002126 para aplicar el 10% adicional.`);

  assert.ok(draft);
  assert.equal(draft?.title, "Código de descuento adicional 10%");
  assert.match(draft?.body ?? "", /750300002126/);
});

test("parseAnnouncementDraft con formato simple", () => {
  const draft = parseAnnouncementDraft(`Título: Promo fin de semana
Cuerpo: Recuerden el código ABC123 en caja.`);
  assert.equal(draft?.title, "Promo fin de semana");
  assert.match(draft?.body ?? "", /ABC123/);
});

test("parseAnnouncementDraft rechaza texto sin estructura", () => {
  assert.equal(parseAnnouncementDraft("Hola, ¿cómo van las ventas hoy?"), null);
});
