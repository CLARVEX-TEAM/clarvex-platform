import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ambienteDe, climaDelCodigo } from "../lib/clima";
import type { IconoClima } from "../lib/clima";

/**
 * El ambiente del clima: qué color y qué se mueve.
 *
 * ⚠️ Lo que aquí falla no da error. Un color mal elegido se pinta igual de
 * bien: el navegador no tiene opinión sobre si se ve. El sol del recuadro
 * pequeño estaba en `#BAE6FD` --precioso sobre el degradado azul marino de la
 * entrada, y con 1.22 de contraste sobre el papel crema donde de verdad vive--,
 * así que durante días los grados salieron con un hueco al lado. Se reportó
 * como «no se ve el sol», que es exactamente lo que pasaba.
 */

const RAIZ = join(__dirname, "..");
const GLOBALS = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");

/** El papel y su noche, tal como los declara `[data-surface="papel"]`. */
const CREMA = "#F7F5F0";
const TINTA = "#15171C";

/**
 * Contraste WCAG entre dos colores. La fórmula es la del estándar y se puede
 * comprobar contra cualquier calculadora pública: negro sobre blanco da 21.
 */
function luminancia(hex: string): number {
  const limpio = hex.replace("#", "");
  const canales = [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [alta, baja] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (baja + 0.05);
}

const TODOS: IconoClima[] = [
  "despejado", "algo-nublado", "nublado", "niebla",
  "llovizna", "lluvia", "aguacero", "nieve", "tormenta"
];

/** Un clima de ese tipo, sin pasar por la tabla de códigos. */
function climaDe(icono: IconoClima, esDeDia: boolean) {
  const codigo = { despejado: 0, "algo-nublado": 2, nublado: 3, niebla: 45, llovizna: 53, lluvia: 63, aguacero: 82, nieve: 73, tormenta: 95 }[icono];
  const clima = climaDelCodigo(codigo, 24, esDeDia);
  assert.equal(clima.icono, icono, `el codigo ${codigo} ya no da ${icono}`);
  return clima;
}

test("la formula de contraste es la del estandar", () => {
  // Anclas comprobables sin ejecutar nada: son los dos extremos de la escala.
  assert.equal(Math.round(contraste("#000000", "#FFFFFF")), 21);
  assert.equal(Math.round(contraste("#FFFFFF", "#FFFFFF")), 1);
});

test("todos los climas tienen su ambiente, de dia y de noche", () => {
  for (const icono of TODOS) {
    for (const esDeDia of [true, false]) {
      const ambiente = ambienteDe(climaDe(icono, esDeDia));
      assert.ok(ambiente.fondo.startsWith("linear-gradient"), `${icono}: fondo raro`);
      assert.ok(ambiente.acento.startsWith("#"), `${icono}: el dibujo va sobre el degradado, con un color fijo`);
    }
  }
});

test("⚠️ la noche NO es el mismo fondo", () => {
  // Un cielo azul claro a las nueve de la noche se lee como un dato viejo.
  for (const icono of TODOS) {
    assert.notEqual(
      ambienteDe(climaDe(icono, true)).fondo,
      ambienteDe(climaDe(icono, false)).fondo,
      `${icono} se pinta igual de dia que de noche`
    );
  }
});

test("el cielo despejado cambia de dibujo con la hora, y solo ese", () => {
  assert.equal(ambienteDe(climaDe("despejado", true)).efecto, "sol");
  assert.equal(ambienteDe(climaDe("despejado", false)).efecto, "luna");
  // Una «luna con lluvia» no existe: lo demas se dibuja igual a cualquier hora.
  for (const icono of TODOS.filter((i) => i !== "despejado")) {
    assert.equal(
      ambienteDe(climaDe(icono, true)).efecto,
      ambienteDe(climaDe(icono, false)).efecto,
      `${icono} cambia de dibujo de noche sin motivo`
    );
  }
});

test("la llovizna cae MENOS que el aguacero", () => {
  const gotas = (i: IconoClima) => ambienteDe(climaDe(i, true)).intensidad;
  assert.ok(gotas("llovizna") < gotas("lluvia"), "la llovizna cae igual que la lluvia");
  assert.ok(gotas("lluvia") < gotas("aguacero"), "el aguacero cae igual que la lluvia");
  assert.equal(gotas("despejado"), 0, "cae algo de un cielo despejado");
});

/**
 * ⚠️ Esta es la que habria atrapado el fallo real.
 *
 * El icono pequeño vive sobre el PAPEL, que de noche se convierte en tinta. Un
 * color fijo no sirve para los dos fondos --lo demuestran los numeros de abajo,
 * que la prueba calcula, no copia-- asi que tiene que salir de una variable que
 * el tema voltea. Un hex a secas aqui es el fallo, aunque se vea bien hoy.
 */
test("⚠️ el color del icono pequeño sale de una variable, nunca de un hex", () => {
  const culpables: string[] = [];
  for (const icono of TODOS) {
    for (const esDeDia of [true, false]) {
      const { acentoPapel } = ambienteDe(climaDe(icono, esDeDia));
      if (!/^var\(--clima-[a-z]+\)$/.test(acentoPapel)) {
        culpables.push(`${icono}${esDeDia ? "" : " (noche)"} = ${acentoPapel}`);
      }
    }
  }
  assert.deepEqual(
    culpables,
    [],
    `Estos pintan el icono con un color fijo, asi que se veran en un tema y no ` +
      `en el otro: ${culpables.join(", ")}. Tiene que ser var(--clima-…), ` +
      `declarada en :root y en .dark de globals.css.`
  );
});

test("⚠️ cada variable del clima existe en los DOS temas y se lee en los dos", () => {
  const usadas = new Set<string>();
  for (const icono of TODOS) {
    for (const esDeDia of [true, false]) {
      usadas.add(ambienteDe(climaDe(icono, esDeDia)).acentoPapel.replace(/^var\(|\)$/g, ""));
    }
  }

  const bloque = (selector: string) => {
    const inicio = GLOBALS.lastIndexOf(`${selector} {`);
    assert.ok(inicio > -1, `no encuentro el bloque ${selector} con las variables del clima`);
    return GLOBALS.slice(inicio, GLOBALS.indexOf("}", inicio));
  };
  const claro = bloque(":root");
  const oscuro = bloque(".dark");

  for (const nombre of usadas) {
    for (const [tema, fuente, fondo] of [["claro", claro, CREMA], ["oscuro", oscuro, TINTA]] as const) {
      const valor = new RegExp(`${nombre}:\\s*(#[0-9A-Fa-f]{6})`).exec(fuente)?.[1];
      assert.ok(valor, `${nombre} no esta declarada en el tema ${tema}: el icono saldria sin color`);
      const razon = contraste(valor, fondo);
      assert.ok(
        razon >= 3,
        `${nombre} en el tema ${tema} da ${razon.toFixed(2)} de contraste sobre ${fondo}. ` +
          `Por debajo de 3 el icono se pierde en el fondo, que es lo que paso con #BAE6FD (1.22).`
      );
    }
  }
});

test("el color roto sigue estando roto, para que la medida no mienta", () => {
  // Si alguien toca la formula y esto deja de ser bajo, la prueba de arriba
  // habria dejado de proteger nada.
  assert.ok(contraste("#BAE6FD", CREMA) < 1.5, "el azul clarisimo ya no sale bajo sobre crema");
  assert.ok(contraste("#F59E0B", CREMA) < 3, "el ambar del proyecto ya no sale bajo sobre crema");
});
