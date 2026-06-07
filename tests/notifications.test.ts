import assert from "node:assert/strict";
import test from "node:test";
import { notificationScope, serializeNotification } from "../lib/notifications";

test("limita notificaciones al usuario y tienda de la sesion", () => {
  assert.deepEqual(notificationScope({ userId: "manager-1", storeId: "store-a" }), {
    userId: "manager-1",
    storeId: "store-a"
  });
});

test("serializa estado leido sin exponer relaciones", () => {
  const result = serializeNotification({
    id: "notification-1",
    type: "PLAN_READY",
    title: "Plan listo",
    body: "Revisa tu plan del dia.",
    readAt: null,
    createdAt: new Date("2026-06-07T12:00:00.000Z")
  });
  assert.equal(result.readAt, null);
  assert.equal(result.createdAt, "2026-06-07T12:00:00.000Z");
  assert.equal("userId" in result, false);
});
