import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkerDownloadUrl } from "../lib/excel-proxy";

test("construye la descarga del Worker usando /download", () => {
  const sourceUrl = "https://tenant.sharepoint.com/:x:/r/sites/Tienda/horarios.xlsx?d=abc&web=1";
  const result = buildWorkerDownloadUrl(
    "https://clarvexteam.jhernandezl2c.workers.dev",
    sourceUrl
  );

  assert.equal(result.origin, "https://clarvexteam.jhernandezl2c.workers.dev");
  assert.equal(result.pathname, "/download");
  assert.equal(result.searchParams.get("url"), sourceUrl);
  assert.match(result.toString(), /\/download\?url=/);
});

test("reemplaza cualquier ruta previa del Worker por /download", () => {
  const result = buildWorkerDownloadUrl(
    "https://clarvexteam.jhernandezl2c.workers.dev/old-route?legacy=1",
    "https://example.com/file.xlsx"
  );

  assert.equal(result.pathname, "/download");
  assert.equal(result.searchParams.has("legacy"), false);
});
