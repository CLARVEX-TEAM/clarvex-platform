import assert from "node:assert/strict";
import test from "node:test";
import { parseResourceTarget, targetWhere, validateEvidenceImage } from "../lib/evidence";

test("acepta exactamente un recurso por evidencia o comentario", () => {
  assert.deepEqual(parseResourceTarget({ pendingId: "pending-1" }), { pendingId: "pending-1", taskId: undefined, logEntryId: undefined });
  assert.equal(parseResourceTarget({ pendingId: "pending-1", taskId: "task-1" }), null);
  assert.equal(parseResourceTarget({}), null);
});

test("construye el filtro del recurso sin aceptar rutas de archivo", () => {
  assert.deepEqual(targetWhere({ taskId: "task-1" }), { taskId: "task-1" });
});

test("valida contenido real JPG y limite de 5 MB", () => {
  const valid = validateEvidenceImage({ type: "image/jpeg", size: 4 }, new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
  assert.equal(valid.valid, true);
  const invalid = validateEvidenceImage({ type: "text/plain", size: 4 }, new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
  assert.equal(invalid.valid, false);
});
