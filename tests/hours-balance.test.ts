import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceStatus } from "../lib/attendance";
import { dayBalanceMinutes, dayBalanceParts, formatBalance, totalBalanceMinutes } from "../lib/hours-balance";

// Horario estándar de la tienda: 10:30 a 21:00.
const day = (arrivedAt: string | null, leftAt: string | null, status: AttendanceStatus = "ON_TIME") =>
  ({ status, arrivedAt, leftAt, expectedEntry: "10:30", expectedExit: "21:00" });

test("entrar temprano SUMA horas a favor", () => {
  // "si un día entramos a las 8 pues ya sumamos 2 horas y media más"
  assert.equal(dayBalanceMinutes(day("08:00", "21:00")), 150); // +2:30
  assert.equal(formatBalance(150), "+2:30");
});

test("salir temprano RESTA horas", () => {
  // "si salimos a las 7 pues nos quita dos horas"
  assert.equal(dayBalanceMinutes(day("10:30", "19:00")), -120); // −2:00
  assert.equal(formatBalance(-120), "−2:00");
});

test("un RETARDO no descuenta del banco; un PERMISO de entrar tarde sí", () => {
  // Caso real (17-jul-2026): Alonso marcó 10:52 (retardo). El retardo ya se
  // penaliza aparte (reporte de retardos); el banco NO debe quitarle esos 22 min.
  assert.equal(dayBalanceMinutes(day("10:52", "21:00", "LATE")), 0);
  assert.equal(dayBalanceMinutes(day("11:00", "21:00", "LATE")), 0);
  // Con PERMISO (EXCUSED) sí usa el saldo de horas: se acordó cambiar la jornada.
  assert.equal(dayBalanceMinutes(day("11:00", "21:00", "EXCUSED")), -30);  // −0:30
  assert.equal(dayBalanceMinutes(day("13:00", "21:00", "EXCUSED")), -150); // permiso de entrar a la 1: −2:30
});

test("quedarse más tarde suma", () => {
  assert.equal(dayBalanceMinutes(day("10:30", "22:00")), 60); // +1:00
  assert.equal(formatBalance(60), "+1:00");
});

test("un día exacto no mueve el saldo", () => {
  assert.equal(dayBalanceMinutes(day("10:30", "21:00")), 0);
  assert.equal(formatBalance(0), "+0:00");
});

test("entrada adelantada: llegar unos minutos tarde a la hora en punto igual da crédito completo", () => {
  // Caso real (15-jul-2026): abrieron a las 8:00. Jesús marcó 8:11. Debe sumar
  // +2:30 (10:30 − 8:00), no +2:19: los 11 min caen dentro de la tolerancia, así
  // que cuenta como haber entrado a las 8:00.
  assert.equal(dayBalanceMinutes(day("08:11", "21:00")), 150); // +2:30
  assert.equal(dayBalanceMinutes(day("08:02", "21:00")), 150); // Itzel, ~8:02
  assert.equal(dayBalanceMinutes(day("08:05", "21:00")), 150); // Alonso, ~8:05
  assert.equal(dayBalanceMinutes(day("07:12", "21:00")), 210); // abrieron a las 7 → +3:30
  assert.equal(dayBalanceMinutes(day("09:08", "21:00")), 90);  // abrieron a las 9 → +1:30
});

test("entrada adelantada: pasada la tolerancia de la hora en punto se cuenta lo real", () => {
  // Abrieron a las 8:00 y llegó 8:20 (20 min, fuera de tolerancia): cuenta desde
  // su llegada real, no se le regala hasta las 8:00.
  assert.equal(dayBalanceMinutes(day("08:20", "21:00")), 130); // +2:10
  assert.equal(dayBalanceMinutes(day("08:00", "21:00")), 150); // exacto sigue siendo +2:30
});

test("llegar unos minutos tarde NO resta: está dentro de la tolerancia", () => {
  // Caso real (14 jul 2026): Itzel marcó 10:36 y Jazmín 10:35. La app las
  // clasificó "A tiempo" — pero el banco de horas les restaba 6 y 5 minutos.
  // Solo debe restar cuando de verdad pidieron entrar tarde (11:00, 11:30...).
  assert.equal(dayBalanceMinutes(day("10:36", "21:00")), 0);
  assert.equal(dayBalanceMinutes(day("10:35", "21:00")), 0);
  assert.equal(dayBalanceMinutes(day("10:44", "21:00")), 0); // el límite de la tolerancia
});

test("marcar unos minutos antes o después tampoco regala saldo", () => {
  assert.equal(dayBalanceMinutes(day("10:25", "21:00")), 0);
  assert.equal(dayBalanceMinutes(day("10:30", "21:10")), 0);
  assert.equal(dayBalanceMinutes(day("10:20", "21:12")), 0);
});

test("fuera de la tolerancia: entrada con permiso y salida temprana se cuentan completas", () => {
  // Entrada tarde CON PERMISO: quien entra a las 11:00 debe 30 min, no 16.
  assert.equal(dayBalanceMinutes(day("11:00", "21:00", "EXCUSED")), -30);
  assert.equal(dayBalanceMinutes(day("10:45", "21:00", "EXCUSED")), -15); // primer minuto fuera
  // Salida temprana (no depende de permiso): resta completa.
  assert.equal(dayBalanceMinutes(day("10:30", "20:45")), -15);
});

test("las dos puntas se suman", () => {
  // Entra 1 h antes y se va 1 h después: 2 h a favor.
  assert.equal(dayBalanceMinutes(day("09:30", "22:00")), 120);
  // Entra tarde CON PERMISO Y se va temprano: castigo doble.
  assert.equal(dayBalanceMinutes(day("11:00", "20:00", "EXCUSED")), -90); // −0:30 − 1:00
});

test("si no marcó salida NO se le castiga con un saldo enorme", () => {
  // Solo se cuenta la punta capturada, igual que el ISNUMBER() del Excel.
  // Sin esta guarda, no marcar salida daría −21:00 de golpe.
  assert.equal(dayBalanceMinutes(day("10:30", null)), 0);
  assert.equal(dayBalanceMinutes(day("08:00", null)), 150); // solo la entrada
});

test("descanso, vacaciones y falta no generan saldo", () => {
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "REST" }), 0);
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "VACATION" }), 0);
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "PAID_DAY" }), 0);
  // Una falta se reporta como falta; no se convierte además en horas debidas.
  assert.equal(dayBalanceMinutes({ ...day(null, null), status: "ABSENT" }), 0);
});

test("vino a trabajar en su descanso: se le acreditan las horas que estuvo", () => {
  // Caso real (15-jul-2026): Jazmín descansaba pero vino a un curso de 8:00 a
  // 10:30. Ese día no contaba, así que las 2:30 que estuvo son todas extra.
  assert.equal(dayBalanceMinutes({ status: "REST", arrivedAt: "08:00", leftAt: "10:30", expectedEntry: "10:30", expectedExit: "21:00" }), 150);
  // Marcó 8:01 (1 min): la tolerancia lo redondea a 8:00 → sigue siendo +2:30.
  assert.equal(dayBalanceMinutes({ status: "REST", arrivedAt: "08:01", leftAt: "10:30", expectedEntry: "10:30", expectedExit: "21:00" }), 150);
  // Media jornada extra un domingo de descanso.
  assert.equal(dayBalanceMinutes({ status: "REST", arrivedAt: "14:00", leftAt: "18:00", expectedEntry: "10:30", expectedExit: "21:00" }), 240);
});

test("descanso con solo la entrada marcada no acredita (no se sabe cuánto se quedó)", () => {
  assert.equal(dayBalanceMinutes({ status: "REST", arrivedAt: "08:00", leftAt: null, expectedEntry: "10:30", expectedExit: "21:00" }), 0);
});

test("el desglose explica el saldo y suma exactamente igual", () => {
  const parts = dayBalanceParts(day("08:11", "22:00")); // entró temprano y salió tarde
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.find((p) => p.part === "entry"), { part: "entry", minutes: 150 }); // 8:11 → 8:00, 10:30 − 8:00
  assert.deepEqual(parts.find((p) => p.part === "exit"), { part: "exit", minutes: 60 });    // 22:00 − 21:00
  // La suma del desglose es el saldo del día.
  assert.equal(parts.reduce((t, p) => t + p.minutes, 0), dayBalanceMinutes(day("08:11", "22:00")));
});

test("el desglose de un permiso de entrar tarde", () => {
  const parts = dayBalanceParts({ status: "EXCUSED", arrivedAt: "13:00", leftAt: null, expectedEntry: "10:30", expectedExit: "21:00" });
  assert.deepEqual(parts, [{ part: "entry", minutes: -150 }]); // entró a la 1: −2:30
});

test("el desglose del descanso trabajado", () => {
  const parts = dayBalanceParts({ status: "REST", arrivedAt: "08:00", leftAt: "10:30", expectedEntry: "10:30", expectedExit: "21:00" });
  assert.deepEqual(parts, [{ part: "rest", minutes: 150 }]);
});

test("un día sin movimiento no genera desglose", () => {
  assert.deepEqual(dayBalanceParts(day("10:35", "21:00")), []); // dentro de tolerancia
  assert.deepEqual(dayBalanceParts({ ...day(null, null), status: "VACATION" }), []);
});

test("el acumulado suma los días", () => {
  const total = totalBalanceMinutes([
    day("08:00", "21:00"),  // +2:30
    day("10:30", "19:00"),  // −2:00
    day("10:30", "21:00"),  // 0
    { ...day(null, null), status: "REST" } // 0
  ]);
  assert.equal(total, 30);
  assert.equal(formatBalance(total), "+0:30");
});

test("formatBalance usa el mismo formato que la hoja CONTROL HORAS", () => {
  assert.equal(formatBalance(240), "+4:00");   // el saldo de Itzel en el Excel
  assert.equal(formatBalance(90), "+1:30");    // el de Waira
  assert.equal(formatBalance(-60), "−1:00");
  assert.equal(formatBalance(5), "+0:05");
});
