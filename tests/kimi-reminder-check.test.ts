import assert from "node:assert/strict";
import test from "node:test";

/*
 * Por qué existen estas pruebas.
 *
 * /api/kimi/reminder-check manda WhatsApp privados a los teléfonos del equipo.
 * Está protegida con CRON_SECRET porque la llama un workflow n8n: si el
 * secreto no se exige, cualquiera que adivine la URL dispara mensajes a
 * números reales. La puerta de auth es la parte que NO se puede romper en
 * silencio: si falla abierta, nadie lo nota hasta que llegan mensajes
 * inesperados.
 *
 * El recorrido completo (qué empleados reciben qué) se cubre con las pruebas
 * de integración contra la base de datos de pruebas (clarvex_test); aquí solo
 * se verifica que la puerta no se abre sin el secreto correcto.
 */

test("sin Authorization devuelve 401", async () => {
  // lib/prisma exige estas dos juntas al importarse; el 401 sale antes de tocar la BD.
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
  process.env.CRON_SECRET = "secreto-de-prueba";
  const { POST } = await import("../app/api/kimi/reminder-check/route");
  const res = await POST(
    new Request("http://localhost/api/kimi/reminder-check?type=task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },

    })
  );
  assert.equal(res.status, 401);
});

test("con un secreto distinto devuelve 401", async () => {
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
  process.env.CRON_SECRET = "secreto-de-prueba";
  const { POST } = await import("../app/api/kimi/reminder-check/route");
  const res = await POST(
    new Request("http://localhost/api/kimi/reminder-check?type=task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer otro-secreto"
      },

    })
  );
  assert.equal(res.status, 401);
});

test("sin CRON_SECRET configurado es fail-closed (401)", async () => {
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const { POST } = await import("../app/api/kimi/reminder-check/route");
    const res = await POST(
      new Request("http://localhost/api/kimi/reminder-check?type=task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer cualquier-cosa"
        },
  
      })
    );
    assert.equal(res.status, 401);
  } finally {
    if (prev !== undefined) process.env.CRON_SECRET = prev;
  }
});

test("el descanso se lee por fecha, nunca por día de la semana", async () => {
  // Un OFF de otra semana en el mismo día dejaba sin aviso a quien hoy sí trabaja.
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync("app/api/kimi/reminder-check/route.ts", "utf8");
  assert.match(fuente, /s\.date = \$\{today\}/);
  assert.doesNotMatch(fuente, /s\.day =/);
  assert.doesNotMatch(fuente, /schedule\.findMany/);
});
