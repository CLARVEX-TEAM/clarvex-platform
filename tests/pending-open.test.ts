import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenPending } from "../lib/types";

/**
 * Regresión de un fallo que apareció TRES veces en la app:
 *
 *  · La tarjeta "Pendientes de gerencia" de /pendientes listaba lo ya cerrado.
 *  · La misma tarjeta en /manager, con idéntico descuido.
 *  · Los avisos de "pendiente vencido" seguían en la campana tras cerrarlo.
 *
 * La causa fue siempre la misma: filtrar por prioridad o por responsable y
 * olvidar el estado. Estas pruebas fijan la única definición de "abierto".
 */
test("isOpenPending — qué cuenta como pendiente abierto", async (t) => {
  await t.test("un pendiente completado NO está abierto", () => {
    assert.equal(isOpenPending({ status: "completado" }), false);
  });

  await t.test("pendiente y en proceso SÍ están abiertos", () => {
    assert.equal(isOpenPending({ status: "pendiente" }), true);
    assert.equal(isOpenPending({ status: "en proceso" }), true);
  });

  await t.test("filtrar por prioridad sin mirar el estado deja pasar cerrados", () => {
    const pendings = [
      { id: "1", priority: "critica", status: "completado" },
      { id: "2", priority: "critica", status: "pendiente" },
      { id: "3", priority: "alta", status: "en proceso" }
    ];

    // El filtro que tenía el bug.
    const conBug = pendings.filter((p) => p.priority === "critica" || p.priority === "alta");
    assert.equal(conBug.length, 3, "el filtro con el bug arrastra el completado");

    // El filtro corregido.
    const corregido = pendings.filter((p) => isOpenPending(p) && (p.priority === "critica" || p.priority === "alta"));
    assert.deepEqual(corregido.map((p) => p.id), ["2", "3"]);
  });

  await t.test("el estado llega serializado en minúsculas, no como el enum de Prisma", () => {
    // serializePending hace toLowerCase().replace("_", " "), asi que comparar
    // contra "COMPLETADO" en el cliente no casaria nunca.
    assert.equal(isOpenPending({ status: "COMPLETADO" }), true, "el enum en mayúsculas NO es el formato del cliente");
    assert.equal(isOpenPending({ status: "completado" }), false);
  });
});
