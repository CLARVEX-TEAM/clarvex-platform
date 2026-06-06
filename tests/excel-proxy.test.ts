import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkerDownloadUrl } from "../lib/excel-proxy";

test("construye la descarga del Worker usando /download", () => {
  const sourceUrl = "https://tenant.sharepoint.com/:x:/r/sites/Tienda/horarios.xlsx?d=abc&web=1";
  const result = buildWorkerDownloadUrl(
    "https://clarvexteam.jhernandezl2c.workers.dev",
    sourceUrl
  );

  assert.equal(
    result,
    `https://clarvexteam.jhernandezl2c.workers.dev/download?url=${encodeURIComponent(sourceUrl)}`
  );
});

test("rechaza una variable del Worker que ya contiene una ruta", () => {
  assert.throws(() => buildWorkerDownloadUrl(
    "https://clarvexteam.jhernandezl2c.workers.dev/download",
    "https://example.com/file.xlsx"
  ), /URL no es una URL valida/);
});
