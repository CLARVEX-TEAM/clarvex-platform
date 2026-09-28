import assert from "node:assert/strict";
import test from "node:test";
import {
  avanceDelTurno,
  duracionCorta,
  faltanParaEntrar,
  minutosDeHora,
  momentoDelDia,
  type EntradaMomento
} from "../lib/mi-dia-momento";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Una regla que depende de la HORA no se comprueba a mano.** Habría que
 * abrir la app a las 9:15, a las 14:00 y a las 21:30 del mismo día, y repetirlo
 * en un día de descanso y en un turno de noche. Nadie lo hace, así que un fallo
 * aquí se descubre cuando alguien de la tienda ve la pantalla equivocada --y lo
 * más probable es que no lo reporte, porque «se ve bien», solo que dice otra
 * cosa de la que debería.
 */

const base: EntradaMomento = {
  minutosAhora: 12 * 60,
  inicio: "10:30",
  fin: "21:00",
  estadoAsistencia: "ON_TIME",
  salida: null
};

test("las tres preguntas del dia, segun la hora", () => {
  assert.equal(momentoDelDia({ ...base, minutosAhora: 9 * 60 + 10 }), "antes");
  assert.equal(momentoDelDia({ ...base, minutosAhora: 14 * 60 }), "turno");
  assert.equal(momentoDelDia({ ...base, minutosAhora: 21 * 60 + 30 }), "cierre");
});

test("el minuto exacto de entrada ya es turno, y el de salida ya es cierre", () => {
  // Las fronteras importan: en el minuto de entrada la pantalla no puede seguir
  // diciendo «entras en 0 m», y en el de salida no puede seguir pidiendo venta.
  assert.equal(momentoDelDia({ ...base, minutosAhora: 10 * 60 + 30 }), "turno");
  assert.equal(momentoDelDia({ ...base, minutosAhora: 21 * 60 }), "cierre");
});

test("un dia de descanso NO enseña cuenta atras, aunque traiga horario", () => {
  /*
   * ⚠️ El horario se publica por semana, así que un día libre puede llegar con
   * inicio y fin cargados. Sin esta regla, la pantalla le diría «entras en 1 h»
   * a quien hoy no va a la tienda.
   */
  for (const estado of ["REST", "VACATION", "PAID_DAY"]) {
    assert.equal(
      momentoDelDia({ ...base, minutosAhora: 9 * 60, estadoAsistencia: estado }),
      "libre",
      `${estado} deberia ser libre`
    );
  }
  // Inventario SÍ es día trabajado.
  assert.equal(momentoDelDia({ ...base, minutosAhora: 9 * 60, estadoAsistencia: "INVENTORY" }), "antes");
});

test("sin horario no se inventa uno", () => {
  assert.equal(momentoDelDia({ ...base, inicio: null, fin: null }), "libre");
  assert.equal(momentoDelDia({ ...base, inicio: "10:30", fin: null }), "libre");
  assert.equal(momentoDelDia({ ...base, inicio: "Jornada programada", fin: "21:00" }), "libre");
});

test("haber marcado salida manda sobre el reloj", () => {
  // Quien cerró y se fue a las 20:00 no puede seguir viendo «te faltan».
  assert.equal(momentoDelDia({ ...base, minutosAhora: 20 * 60 + 15, salida: "20:00" }), "cierre");
});

test("un turno que cruza la medianoche no se da por terminado toda la noche", () => {
  const noche: EntradaMomento = { ...base, inicio: "22:00", fin: "06:00" };
  assert.equal(momentoDelDia({ ...noche, minutosAhora: 23 * 60 }), "turno");
  assert.equal(momentoDelDia({ ...noche, minutosAhora: 2 * 60 }), "turno");
  assert.equal(momentoDelDia({ ...noche, minutosAhora: 7 * 60 }), "cierre");
  assert.equal(momentoDelDia({ ...noche, minutosAhora: 21 * 60 }), "cierre");
});

test("sin hora todavia se dice que no se sabe, no se elige un momento", () => {
  // Es el primer pintado de CADA carga, no un caso raro.
  assert.equal(momentoDelDia({ ...base, minutosAhora: null }), null);
  // Pero lo que no depende del reloj sí se puede resolver ya.
  assert.equal(momentoDelDia({ ...base, minutosAhora: null, estadoAsistencia: "REST" }), "libre");
  assert.equal(momentoDelDia({ ...base, minutosAhora: null, salida: "20:00" }), "cierre");
});

test("la cuenta atras nunca va en negativo", () => {
  assert.equal(faltanParaEntrar({ ...base, minutosAhora: 9 * 60 + 10 }), 80);
  assert.equal(faltanParaEntrar({ ...base, minutosAhora: 11 * 60 }), 0);
  assert.equal(faltanParaEntrar({ ...base, minutosAhora: null }), null);
});

test("el avance del turno se queda dentro de la linea", () => {
  assert.equal(avanceDelTurno({ ...base, minutosAhora: 10 * 60 + 30 }), 0);
  assert.equal(avanceDelTurno({ ...base, minutosAhora: 21 * 60 }), 1);
  // Antes de entrar y despues de salir, pegado a los extremos y no fuera.
  assert.equal(avanceDelTurno({ ...base, minutosAhora: 8 * 60 }), 0);
  assert.equal(avanceDelTurno({ ...base, minutosAhora: 23 * 60 }), 1);
  const mitad = avanceDelTurno({ ...base, minutosAhora: 15 * 60 + 45 });
  assert.ok(mitad !== null && Math.abs(mitad - 0.5) < 0.01, `mitad del turno: ${mitad}`);
});

test("horas mal escritas no pasan por buenas", () => {
  assert.equal(minutosDeHora("25:00"), null);
  assert.equal(minutosDeHora("10:75"), null);
  assert.equal(minutosDeHora(""), null);
  assert.equal(minutosDeHora("10:30"), 630);
});

test("la duracion se lee como la diria una persona", () => {
  assert.equal(duracionCorta(80), "1 h 20 m");
  assert.equal(duracionCorta(120), "2 h");
  assert.equal(duracionCorta(45), "45 m");
  assert.equal(duracionCorta(0), "0 m");
});
