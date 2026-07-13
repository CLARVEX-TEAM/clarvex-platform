import assert from "node:assert/strict";
import test from "node:test";
import { keyFromR2Url } from "../lib/r2";
import { photoSrc } from "../lib/photo-src";

const PUBLIC_BASE = "https://pub-abc123.r2.dev";

test("keyFromR2Url extrae la llave de una URL pública del bucket", () => {
  assert.equal(keyFromR2Url(`${PUBLIC_BASE}/profiles/u1-123.jpg`), "profiles/u1-123.jpg");
  assert.equal(keyFromR2Url(`${PUBLIC_BASE}/evidences/u1-9-abc.png`), "evidences/u1-9-abc.png");
  // Llaves con espacios u acentos llegan percent-encoded en la URL.
  assert.equal(keyFromR2Url(`${PUBLIC_BASE}/evidences/foto%20uno.jpg`), "evidences/foto uno.jpg");
});

test("keyFromR2Url NO toca URLs firmadas (no deben volver a firmarse)", () => {
  const signed = "https://acct.r2.cloudflarestorage.com/bucket/evidences/x.jpg?X-Amz-Signature=abc";
  assert.equal(keyFromR2Url(signed), null);
});

test("keyFromR2Url rechaza enlaces externos, relativos y basura", () => {
  assert.equal(keyFromR2Url("https://evil.example/profiles/x.jpg"), null);
  assert.equal(keyFromR2Url("/api/files/photo?k=profiles/x.jpg"), null);
  assert.equal(keyFromR2Url("data:image/png;base64,AAAA"), null);
  assert.equal(keyFromR2Url(null), null);
  assert.equal(keyFromR2Url(""), null);
  // http:// (sin TLS) no se acepta.
  assert.equal(keyFromR2Url("http://pub-abc123.r2.dev/profiles/x.jpg"), null);
});

test("keyFromR2Url normaliza el path: el traversal no escapa del bucket", () => {
  // new URL() colapsa los ".." ANTES de que veamos el path, así que el resultado
  // es una llave normal del bucket, no una ruta fuera de él (las llaves de R2 son
  // planas: no hay directorios de los que salirse).
  //
  // Quien realmente acota el alcance es el prefijo que exige cada consumidor:
  // /api/files/photo solo acepta llaves `profiles/…` y rechaza cualquier otra.
  assert.equal(keyFromR2Url(`${PUBLIC_BASE}/profiles/../../secret.txt`), "secret.txt");
  assert.equal(photoSrc(`${PUBLIC_BASE}/profiles/../../secret.txt`), "/api/files/photo?k=secret.txt");
});

test("photoSrc manda las fotos públicas al proxy autenticado", () => {
  assert.equal(
    photoSrc(`${PUBLIC_BASE}/profiles/u1-123.jpg`),
    "/api/files/photo?k=profiles%2Fu1-123.jpg"
  );
});

test("photoSrc deja pasar lo que ya trae su propio permiso", () => {
  // URL firmada: la sirve Cloudflare directo, no debe reescribirse.
  const signed = "https://acct.r2.cloudflarestorage.com/b/profiles/x.jpg?X-Amz-Signature=abc";
  assert.equal(photoSrc(signed), signed);
  // Miniatura cacheada del lock de escritorio.
  assert.equal(photoSrc("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  // Ya convertida (idempotente): no se vuelve a envolver.
  assert.equal(photoSrc("/api/files/photo?k=profiles%2Fx.jpg"), "/api/files/photo?k=profiles%2Fx.jpg");
  // Enlace externo y vacío.
  assert.equal(photoSrc("https://cdn.example/x.jpg"), "https://cdn.example/x.jpg");
  assert.equal(photoSrc(null), null);
  assert.equal(photoSrc(undefined), null);
});
