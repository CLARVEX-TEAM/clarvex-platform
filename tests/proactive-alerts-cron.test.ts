import assert from "node:assert/strict";
import test from "node:test";

// Entorno de prueba seguro antes de cargar módulos de la app.
(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as Record<string, string>).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

test("Crons de alertas proactivas — autorización y dedupe", async (t) => {
  await t.test("requireCron: sin Authorization responde 401 (no ejecuta nada)", async () => {
    const original = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    try {
      const { POST: weekGoalPost } = await import("../app/api/cron/week-goal-alert/route");
      const { POST: overduePost } = await import("../app/api/cron/pending-overdue-managers/route");
      const { POST: axoPost } = await import("../app/api/cron/attendance-axo-reminder/route");
      const { POST: energyPost } = await import("../app/api/cron/energy-checklist-reminder/route");

      const noAuth = new Request("http://localhost/api/cron/week-goal-alert", { method: "POST" });
      const res1 = await weekGoalPost(noAuth);
      assert.equal(res1.status, 401);

      const res2 = await overduePost(new Request("http://localhost/api/cron/pending-overdue-managers", { method: "POST" }));
      assert.equal(res2.status, 401);

      const badAuth = new Request("http://localhost/api/cron/week-goal-alert", { method: "POST", headers: { authorization: "Bearer wrong" } });
      const res3 = await weekGoalPost(badAuth);
      assert.equal(res3.status, 401);

      const res4 = await axoPost(new Request("http://localhost/api/cron/attendance-axo-reminder", { method: "POST" }));
      assert.equal(res4.status, 401);

      const res5 = await energyPost(new Request("http://localhost/api/cron/energy-checklist-reminder", { method: "POST" }));
      assert.equal(res5.status, 401);
    } finally {
      process.env.CRON_SECRET = original;
    }
  });

  await t.test("filterUsersWithoutAlert: dedupe por usuario y acotado por tienda", async () => {
    const { filterUsersWithoutAlert, RETAIL_ALERT_TYPES } = await import("../lib/retail-alert-log");
    let capturedWhere: Record<string, unknown> = {};
    const tx = {
      retailAlertLog: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          capturedWhere = args.where;
          // Simula que 'u1' ya recibió la alerta.
          return [{ userId: "u1" }];
        }
      }
    } as any;

    const pending = await filterUsersWithoutAlert(tx, {
      storeId: "store-1",
      userIds: ["u1", "u2", "u3"],
      periodKey: "week:27",
      alertType: RETAIL_ALERT_TYPES.WEEK_GOAL_100
    });

    assert.deepEqual(pending, ["u2", "u3"]);
    // La consulta debe estar acotada a la tienda, periodo y tipo (aislamiento).
    assert.equal(capturedWhere.storeId, "store-1");
    assert.equal(capturedWhere.periodKey, "week:27");
    assert.equal(capturedWhere.alertType, RETAIL_ALERT_TYPES.WEEK_GOAL_100);
  });

  await t.test("recordRetailAlerts: inserta con skipDuplicates y datos por tienda", async () => {
    const { recordRetailAlerts, RETAIL_ALERT_TYPES } = await import("../lib/retail-alert-log");
    type Captured = { data: Array<Record<string, unknown>>; skipDuplicates?: boolean };
    const box: { value?: Captured } = {};
    const tx = {
      retailAlertLog: {
        createMany: async (args: Captured) => {
          box.value = args;
          return { count: args.data.length };
        }
      }
    } as any;

    await recordRetailAlerts(tx, { storeId: "store-9", userIds: ["a", "b"], periodKey: "week:30", alertType: RETAIL_ALERT_TYPES.WEEK_GOAL_80 });
    assert.ok(box.value);
    const captured = box.value as Captured;
    assert.equal(captured.skipDuplicates, true);
    assert.equal(captured.data.length, 2);
    assert.ok(captured.data.every((row) => row.storeId === "store-9"));
  });
});
