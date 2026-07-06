import assert from "node:assert/strict";
import test from "node:test";
import { translateTeam } from "../lib/world-cup-teams";

test("traduce selecciones de ESPN al español con su bandera", () => {
  assert.deepEqual(translateTeam("Norway"), { name: "Noruega", flag: "🇳🇴" });
  assert.deepEqual(translateTeam("England"), { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" });
  assert.deepEqual(translateTeam("South Africa"), { name: "Sudáfrica", flag: "🇿🇦" });
  assert.deepEqual(translateTeam("Ivory Coast"), { name: "Costa de Marfil", flag: "🇨🇮" });
  assert.deepEqual(translateTeam("Netherlands"), { name: "Países Bajos", flag: "🇳🇱" });
  assert.deepEqual(translateTeam("MEXICO"), { name: "México", flag: "🇲🇽" });
});

test("equipo desconocido conserva su nombre sin bandera", () => {
  assert.deepEqual(translateTeam("Atlantis FC"), { name: "Atlantis FC", flag: "" });
});
