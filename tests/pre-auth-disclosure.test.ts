import assert from "node:assert/strict";
import test from "node:test";
import { publicUser, publicUserPreAuth } from "../lib/security";

// Un usuario tal como sale de la BD.
const dbUser = {
  id: "clxyz123",
  name: "ADRIAN HERNANDEZ",
  employeeNumber: "81893",
  role: "SUBGERENTE" as const,
  photoUrl: "https://pub-abc.r2.dev/profiles/u1.jpg",
  biometricEnabled: true,
  lastLoginAt: new Date("2026-07-13T18:00:00.000Z")
};

test("inspect (sin sesión) NO filtra foto, rol, último acceso ni id interno", () => {
  const shape = publicUserPreAuth(dbUser);
  const filtrado = Object.keys(shape);

  // Cualquiera puede teclear números de empleado: esto es cosechable.
  assert.equal("photoUrl" in shape, false, "la foto es el dato más sensible");
  assert.equal("role" in shape, false);
  assert.equal("lastLoginAt" in shape, false);
  assert.equal("id" in shape, false);

  // Solo lo que el login necesita de verdad para funcionar.
  assert.deepEqual(filtrado.sort(), ["avatar", "biometricEnabled", "employeeNumber", "name"]);
});

test("el saludo y el botón de biometría siguen teniendo lo que necesitan", () => {
  const shape = publicUserPreAuth(dbUser);
  assert.equal(shape.name, "ADRIAN HERNANDEZ"); // "Hola ADRIAN"
  assert.equal(shape.avatar, "AD"); // iniciales, en vez de la foto
  assert.equal(shape.biometricEnabled, true); // ofrecer Face ID
});

test("ya autenticado sí se entrega el usuario completo", () => {
  // publicUser (post-login) no cambia: la app necesita foto y rol.
  const shape = publicUser(dbUser);
  assert.equal(shape.photoUrl, dbUser.photoUrl);
  assert.equal(shape.role, "SUBGERENTE");
  assert.equal(shape.id, "clxyz123");
});
