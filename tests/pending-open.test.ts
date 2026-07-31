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

import { ADVISOR_WHERE, PERSON_WHERE, isRealPerson } from "../lib/store-people";

/**
 * El usuario "kiosko" (el celular de la tienda para los escaneos del cierre)
 * está dado de alta con rol ASESOR. Filtrar por rol a secas lo incluía, y se
 * coló en DOCE consultas: salía en la plantilla de Asistencia como si fuera
 * alguien, y contaba como un asesor con cero venta en el resumen de cierre.
 *
 * Eso produjo un «Abajo: 1 asesores» una noche en que solo trabajó una persona
 * y sí llegó a su meta. El aparato era el que estaba «abajo».
 */
test("quién cuenta como persona de la tienda", async (t) => {
  await t.test("el filtro de asesores excluye kiosko e inactivos", () => {
    assert.equal(ADVISOR_WHERE.role, "ASESOR");
    assert.equal(ADVISOR_WHERE.checklistOnly, false, "un aparato no es un asesor");
    assert.equal(ADVISOR_WHERE.active, true);
  });

  await t.test("el filtro de personas no mira el puesto, solo que sea alguien", () => {
    assert.equal(PERSON_WHERE.checklistOnly, false);
    assert.equal(PERSON_WHERE.active, true);
    assert.ok(!("role" in PERSON_WHERE), "gerencia también es persona");
  });

  await t.test("isRealPerson descarta el kiosko y las cuentas apagadas", () => {
    assert.equal(isRealPerson({ active: true, checklistOnly: true }), false, "el caso CIERRE SAN AGUSTIN");
    assert.equal(isRealPerson({ active: false, checklistOnly: false }), false);
    assert.equal(isRealPerson({ active: true, checklistOnly: false }), true);
    assert.equal(isRealPerson({}), true, "sin banderas se asume persona");
  });
});
