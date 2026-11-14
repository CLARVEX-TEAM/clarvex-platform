import assert from "node:assert/strict";
import test from "node:test";
import { tiendasParaCierreBuenFin } from "../lib/cierre-buen-fin";
import { resolveMonterreyDate } from "../lib/cron-time";

const tienda = "clarvex-demo-store";

const cortes = [
  ["plaza", "03:05", "04:05"],
  ["diario", "03:30", "04:30"],
  ["desempeno", "03:45", "04:45"],
  ["semanal", "04:00", "05:00"]
] as const;

for (const [corte, habitual, especial] of cortes) {
  test(`${corte}: cambia solo San Agustín y conserva los límites locales`, () => {
    const tiendas = (diaUtc: string, hora: string) => {
      const ahora = new Date(`2026-11-${diaUtc}T${hora}:00Z`);
      return tiendasParaCierreBuenFin(corte, resolveMonterreyDate(ahora), ahora);
    };

    assert.equal(tiendas("13", habitual), undefined);
    assert.deepEqual(tiendas("14", habitual), { id: { not: tienda } });
    assert.deepEqual(tiendas("14", especial), { id: tienda });
    assert.deepEqual(tiendas("18", habitual), { id: { not: tienda } });
    assert.deepEqual(tiendas("18", especial), { id: tienda });
    assert.equal(tiendas("19", habitual), undefined);
  });
}
