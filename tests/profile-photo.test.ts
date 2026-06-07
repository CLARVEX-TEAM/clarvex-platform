import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_PHOTO_MAX_BYTES, validateProfilePhoto } from "../lib/profile-photo";

test("acepta una imagen PNG valida", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(validateProfilePhoto({ type: "image/png", size: bytes.length }, bytes), { valid: true, extension: "png" });
});

test("rechaza contenido que finge ser imagen", () => {
  const result = validateProfilePhoto({ type: "image/jpeg", size: 4 }, new Uint8Array([1, 2, 3, 4]));
  assert.equal(result.valid, false);
});

test("rechaza imagen mayor a 5 MB", () => {
  const result = validateProfilePhoto({ type: "image/png", size: PROFILE_PHOTO_MAX_BYTES + 1 }, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(result.valid, false);
});
