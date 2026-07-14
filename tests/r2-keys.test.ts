import assert from "node:assert/strict";
import test from "node:test";
import { canReadProfileKey, chatRoomFromKey, storeKey, storePrefix } from "../lib/r2-keys";

const TIENDA_A = "store-aaa";
const TIENDA_B = "store-bbb";

test("las llaves nuevas quedan bajo la carpeta de la tienda", () => {
  assert.equal(storeKey(TIENDA_A, "profiles", "u1-123.jpg"), "stores/store-aaa/profiles/u1-123.jpg");
  assert.equal(storeKey(TIENDA_A, "evidences", "u1-9.png"), "stores/store-aaa/evidences/u1-9.png");
  assert.equal(storePrefix(TIENDA_A), "stores/store-aaa/");
});

test("una tienda NO puede leer las fotos de otra", () => {
  const fotoDeA = storeKey(TIENDA_A, "profiles", "u1-123.jpg");
  assert.equal(canReadProfileKey(fotoDeA, TIENDA_A), true);
  // Aunque el gerente de B conozca la llave exacta, el proxy la rechaza.
  assert.equal(canReadProfileKey(fotoDeA, TIENDA_B), false);
});

test("el proxy de fotos no sirve de lector genérico del bucket", () => {
  // Otros tipos de archivo (evidencias, backups) NO salen por aquí.
  assert.equal(canReadProfileKey(storeKey(TIENDA_A, "evidences", "x.jpg"), TIENDA_A), false);
  assert.equal(canReadProfileKey("backups/clarvex_team-2026.dump", TIENDA_A), false);
  assert.equal(canReadProfileKey("stores/store-aaa/../../backups/x.dump", TIENDA_A), false);
  assert.equal(canReadProfileKey("", TIENDA_A), false);
});

test("las fotos viejas (sin tienda en la llave) siguen funcionando", () => {
  // Legado: se subieron antes de separar por tienda. No se migran; la BD guarda
  // su URL y el proxy las sigue sirviendo con el alcance de antes.
  assert.equal(canReadProfileKey("profiles/u1-123.jpg", TIENDA_A), true);
  assert.equal(canReadProfileKey("profiles/u1-123.jpg", TIENDA_B), true);
});

test("chatRoomFromKey entiende la llave nueva y la vieja", () => {
  assert.equal(chatRoomFromKey("stores/store-aaa/chat/room-9/u1-123.jpg"), "room-9");
  assert.equal(chatRoomFromKey("evidences/chat/room-9/u1-123.jpg"), "room-9"); // legado
});

test("chatRoomFromKey rechaza llaves que no son de chat", () => {
  assert.equal(chatRoomFromKey("stores/store-aaa/profiles/u1.jpg"), null);
  assert.equal(chatRoomFromKey("evidences/u1-123.jpg"), null);
  assert.equal(chatRoomFromKey("backups/x.dump"), null);
  assert.equal(chatRoomFromKey("stores/store-aaa/chat/../../x"), null);
  assert.equal(chatRoomFromKey("stores/store-aaa/chat/room-9"), null); // sin archivo
  assert.equal(chatRoomFromKey(""), null);
});
