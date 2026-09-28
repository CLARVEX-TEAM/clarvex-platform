import test from "node:test";
import assert from "node:assert/strict";
import { companerosDeTurno } from "../lib/schedule-report";

/**
 * «Con quién me toca» es la ÚNICA excepción a una regla de roles escrita.
 *
 * `CLAUDE.md` dice que un asesor ve sus propios horarios y que solo gerencia ve
 * los del equipo. Horarios abre esa puerta un dedo para contestar «¿con quién
 * entro hoy?», y estas pruebas fijan hasta dónde llega: si alguien amplía el
 * `select` de la consulta o relaja el filtro, aquí se pone en rojo.
 */

const FILAS = [
  { date: "2026-09-28", status: "WORKING", startTime: "10:30", endTime: "21:00", user: { id: "yo", name: "Sofía", photoUrl: null } },
  { date: "2026-09-28", status: "WORKING", startTime: "12:00", endTime: "21:00", user: { id: "emi", name: "Emiliano", photoUrl: "f.jpg" } },
  { date: "2026-09-28", status: "OFF", startTime: null, endTime: null, user: { id: "mateo", name: "Mateo", photoUrl: null } },
  { date: "2026-09-28", status: "VACATION", startTime: null, endTime: null, user: { id: "renata", name: "Renata", photoUrl: null } },
  { date: "2026-09-29", status: "WORKING", startTime: "10:30", endTime: "19:00", user: { id: "mateo", name: "Mateo", photoUrl: null } }
];

test("uno mismo NUNCA sale en su propia lista", () => {
  const salida = companerosDeTurno(FILAS, "yo");
  assert.equal(
    salida.some((persona) => persona.userId === "yo"),
    false,
    "el propio usuario aparecía como compañero de sí mismo"
  );
});

test("solo entra quien TRABAJA, no quien descansa ni está de vacaciones", () => {
  const salida = companerosDeTurno(FILAS, "yo");
  const nombres = salida.map((persona) => persona.userName).sort();
  assert.deepEqual(
    nombres,
    ["Emiliano", "Mateo"],
    "se coló alguien que no trabaja: quién descansa es información privada suya, " +
      "no «con quién me toca»"
  );
  // Mateo entra por el 29, donde sí trabaja; no por el 28, donde descansa.
  assert.equal(salida.find((p) => p.userName === "Mateo")?.date, "2026-09-29");
});

test("⚠️ se devuelve el MINIMO: nada con lo que reconstruir el historial de nadie", () => {
  const salida = companerosDeTurno(FILAS, "yo");
  const campos = Object.keys(salida[0] ?? {}).sort();
  assert.deepEqual(
    campos,
    ["date", "endTime", "photoUrl", "startTime", "userId", "userName"],
    "el compañero lleva campos de más. Con el estado crudo, la zona o el id del " +
      "horario se puede reconstruir la semana de otra persona, y eso es justo lo " +
      "que la regla de roles protege."
  );
});

test("sin nadie más ese día, la lista queda vacía y no falla", () => {
  const soloYo = FILAS.filter((fila) => fila.user.id === "yo");
  assert.deepEqual(companerosDeTurno(soloYo, "yo"), []);
  assert.deepEqual(companerosDeTurno([], "yo"), []);
});
