import assert from "node:assert/strict";
import test from "node:test";
import { headersAllowEmbed, normalizeStreamUrl } from "../lib/stream-url";

test("convierte enlaces de YouTube al formato embed", () => {
  assert.equal(
    normalizeStreamUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1"
  );
  assert.equal(
    normalizeStreamUrl("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1"
  );
  assert.equal(
    normalizeStreamUrl("https://www.youtube.com/live/AbC123xyz_-"),
    "https://www.youtube.com/embed/AbC123xyz_-?autoplay=1&playsinline=1"
  );
  assert.equal(
    normalizeStreamUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1"
  );
});

test("deja intactos los enlaces que no reconoce", () => {
  assert.equal(normalizeStreamUrl("https://example.com/en-vivo"), "https://example.com/en-vivo");
  assert.equal(normalizeStreamUrl("https://www.youtube.com/embed/ya-embed"), "https://www.youtube.com/embed/ya-embed");
  assert.equal(normalizeStreamUrl("no-es-url"), "no-es-url");
});

test("detecta headers que bloquean iframes", () => {
  assert.equal(headersAllowEmbed(new Headers({ "x-frame-options": "DENY" })), false);
  assert.equal(headersAllowEmbed(new Headers({ "x-frame-options": "SAMEORIGIN" })), false);
  assert.equal(headersAllowEmbed(new Headers({ "content-security-policy": "frame-ancestors 'self'" })), false);
  assert.equal(headersAllowEmbed(new Headers({ "content-security-policy": "frame-ancestors *" })), true);
  assert.equal(headersAllowEmbed(new Headers({ "content-security-policy": "default-src 'self'" })), true);
  assert.equal(headersAllowEmbed(new Headers()), true);
});
