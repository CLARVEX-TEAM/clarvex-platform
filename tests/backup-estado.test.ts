import assert from "node:assert/strict";
import test from "node:test";
import { evaluarRespaldo, type EstadoRespaldo } from "../lib/backup-estado";

const AHORA = new Date("2026-09-04T12:00:00.000Z");
const HACE = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

const estado = (extra: Partial<EstadoRespaldo> = {}): EstadoRespaldo => ({
  terminadoEn: HACE(3),
  r2: { estado: "ok", objeto: "r2://clarvex-backups/backups/2026-09-04.dump", bytes: 12_582_912 },
  s3: { estado: "ok", objeto: "s3://clarvex-backups/backups/2026-09-04.dump", bytes: 12_582_912 },
  ...extra
});

test("con las dos copias, sano y con el objeto confirmado", () => {
  const v = evaluarRespaldo(estado(), AHORA);
  assert.equal(v.sano, true);
  assert.deepEqual(v.problemas, []);
  assert.deepEqual(v.degradaciones, []);
  assert.match(v.resumen ?? "", /en R2 y S3/);
  // El objeto va en el resumen: sin el, «ok» es una opinion.
  assert.match(v.resumen ?? "", /2026-09-04\.dump/);
  assert.match(v.resumen ?? "", /12\.0 MB/);
});

test("⚠️ REGRESION: si S3 falla, NO se anuncia «en R2 y S3»", () => {
  /*
   * El fallo: el monitor buscaba «subido a r2://» en el registro y de ahi
   * concluia «Respaldo: ... en R2 y S3». La copia cruzada podia haber fallado
   * --falla sin tumbar el respaldo, y eso es deliberado-- y el aviso decia que
   * estaba hecha.
   */
  const v = evaluarRespaldo(estado({ s3: { estado: "fallo", error: "AccessDenied" } }), AHORA);

  assert.equal(v.resumen?.includes("en R2 y S3"), false, "no puede afirmar S3");
  assert.match(v.resumen ?? "", /solo en R2/);
  assert.equal(v.problemas.length, 0, "el respaldo principal SI se hizo");
  assert.equal(v.degradaciones.length, 1);
  assert.match(v.degradaciones[0], /S3 falló/);
  assert.match(v.degradaciones[0], /AccessDenied/);
  assert.equal(v.sano, false, "no esta sano: falta la segunda nube");
});

test("⚠️ el respaldo de R2 se conserva correcto aunque S3 falle", () => {
  // Es la regla que no se puede romper: perder la copia cruzada no puede
  // invalidar el respaldo que si se hizo.
  const v = evaluarRespaldo(estado({ s3: { estado: "fallo", error: "timeout" } }), AHORA);
  assert.deepEqual(v.problemas, []);
  assert.match(v.resumen ?? "", /r2:\/\//);
});

test("si falla R2, ESO si es un problema", () => {
  const v = evaluarRespaldo(
    estado({ r2: { estado: "fallo", error: "NoSuchBucket" } }),
    AHORA
  );
  assert.equal(v.problemas.length, 1);
  assert.match(v.problemas[0], /R2 FALLÓ/);
  assert.equal(v.resumen, null, "sin copia principal no hay resumen que dar");
});

test("⚠️ un fallo de HOY no queda tapado por un exito de AYER", () => {
  /*
   * El monitor miraba las ultimas veinte lineas del registro, asi que la linea
   * de exito de ayer seguia ahi y casaba. El estado se sobrescribe entero en
   * cada corrida: lo que se lee es siempre la ultima.
   */
  const ayerBien = estado({ terminadoEn: HACE(30) });
  const hoyMal = estado({ terminadoEn: HACE(1), r2: { estado: "fallo", error: "disco lleno" } });

  assert.equal(evaluarRespaldo(ayerBien, AHORA).problemas.length, 1, "30 h pasa del umbral de 26");
  const v = evaluarRespaldo(hoyMal, AHORA);
  assert.match(v.problemas.join(" "), /disco lleno/);
});

test("sin S3 configurado se avisa, pero como degradacion", () => {
  const v = evaluarRespaldo(estado({ s3: { estado: "sin-configurar" } }), AHORA);
  assert.deepEqual(v.problemas, []);
  assert.match(v.degradaciones[0], /un solo proveedor/);
});

test("un respaldo viejo es un problema aunque las dos copias esten bien", () => {
  const v = evaluarRespaldo(estado({ terminadoEn: HACE(40) }), AHORA);
  assert.match(v.problemas[0], /no corre desde hace 40 h/);
});

test("sin estado ninguno: el respaldo nunca corrio o no pudo escribirlo", () => {
  const v = evaluarRespaldo(null, AHORA);
  assert.equal(v.sano, false);
  assert.match(v.problemas[0], /nunca ha corrido/);
});

test("una fecha ilegible no se toma por buena", () => {
  const v = evaluarRespaldo(estado({ terminadoEn: "ayer por la tarde" }), AHORA);
  assert.equal(v.sano, false);
  assert.match(v.problemas[0], /fecha ilegible/);
});
