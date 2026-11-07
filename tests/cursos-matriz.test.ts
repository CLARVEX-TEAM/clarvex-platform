import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceDeMatriz, cursoDelCertificado, esDeLaPersona, textoAvance } from "../lib/cursos-matriz";

const cursos = ["Ligas de pago y donativos", "POS Xstore", "Omnicanalidad", "POS Xstore Admin", "SAP Fiori", "Sistema One Axo"].map((nombre, i) => ({
  id: `c${i + 1}`,
  orden: i + 1,
  nombre,
  completadoAt: null as Date | null
}));

test("el certificado de «POS Xstore Admin» no completa «POS Xstore»", () => {
  assert.equal(cursoDelCertificado("POS Xstore Admin", cursos)?.id, "c4");
  assert.equal(cursoDelCertificado("POS Xstore", cursos)?.id, "c2");
  assert.equal(cursoDelCertificado("Curso: POS XSTORE ADMIN ", cursos)?.id, "c4");
});

test("acentos y mayúsculas no importan; un curso ajeno no encaja", () => {
  assert.equal(cursoDelCertificado("OMNICANALIDAD", cursos)?.id, "c3");
  assert.equal(cursoDelCertificado("Excel avanzado", cursos), null);
  assert.equal(cursoDelCertificado(null, cursos), null);
});

test("el nombre del certificado contra el de la app", () => {
  assert.equal(esDeLaPersona("EDUARDO ALONSO TREVIÑO VAZQUEZ", "ALONSO TREVIÑO"), true);
  assert.equal(esDeLaPersona("EDUARDO ALONSO TREVIÑO VAZQUEZ", "WAIRA ZITLALI POPOCA"), false);
  // Una sola palabra en común no basta cuando la app tiene dos o más.
  assert.equal(esDeLaPersona("ALONSO PÉREZ", "ALONSO TREVIÑO"), false);
});

test("el avance", () => {
  const hechos = cursos.map((c, i) => ({ ...c, completadoAt: i < 2 ? new Date() : null }));
  assert.deepEqual(avanceDeMatriz(hechos).hechos, 2);
  assert.match(textoAvance("Expertos One Axo", hechos), /2 de 6.*Te faltan: Omnicanalidad, POS Xstore Admin, SAP Fiori, Sistema One Axo/);
  assert.match(textoAvance("Expertos One Axo", cursos.map((c) => ({ ...c, completadoAt: new Date() }))), /Completaste los 6/);
});

test("la respuesta del modelo, tal como llega de Bedrock (con bloque ```json)", async () => {
  const { leerJson } = await import("../lib/certificado-ia");
  const r = leerJson('```json\n{ "esCertificado": true, "nombre": "EDUARDO ALONSO TREVIÑO VAZQUEZ", "curso": "POS Xstore Admin", "fecha": "07-11-2026" }\n```');
  assert.equal(r?.esCertificado, true);
  assert.equal(cursoDelCertificado(r?.curso, cursos)?.nombre, "POS Xstore Admin");
  assert.equal(esDeLaPersona(r?.nombre, "ALONSO TREVIÑO"), true);
  assert.equal(leerJson("no pude leerlo"), null);
});
