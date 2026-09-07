import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **En Android, `env(safe-area-inset-*)` MIENTE.** Solo reporta el recorte de
 * la pantalla --la muesca de la cámara--, nunca la barra de estado ni la de
 * navegación. En iOS y en la PWA de Chrome vale; dentro del WebView de la app
 * vale CERO. Con `targetSdk 35` la app va de borde a borde por obligación, así
 * que los títulos quedaban bajo el reloj y la barra inferior encima de la
 * barrita de gestos.
 *
 * El arreglo es indirecto y por eso frágil: la app de Android publica las
 * medidas reales en cuatro variables CSS (`BarrasDelSistema.java`) y el estilo
 * las lee. Nada en el editor avisa si alguien vuelve a escribir `env(...)`
 * directamente --sigue siendo CSS válido, sigue funcionando en el navegador y
 * en el iPhone-- y el fallo solo reaparece dentro de la app de Android, que es
 * justo donde nadie compila.
 *
 * De ahí que se comprueben las dos mitades del contrato: que las variables
 * existan con `env()` de respaldo, y que quien las necesita las use.
 */

const raiz = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

test("las cuatro variables existen y su respaldo es env()", () => {
  const css = leer("app/globals.css");
  for (const lado of ["top", "bottom", "left", "right"]) {
    // ⚠️ El respaldo NO es opcional. Sin él, el navegador y la PWA --donde
    // `env()` sí funciona-- se quedarían sin inset ninguno, y una versión
    // vieja de la app de Android, que no publica nada, empeoraría en vez de
    // seguir igual.
    assert.match(
      css,
      new RegExp(`--safe-${lado}:\\s*env\\(safe-area-inset-${lado},\\s*0px\\)`),
      `falta --safe-${lado} con respaldo env()`
    );
  }
});

test("las utilidades de arriba leen la variable, no env() directo", () => {
  const css = leer("app/globals.css");
  const ptSafe = /\.pt-safe\s*\{([^}]*)\}/.exec(css);
  const topSafe = /\.top-safe\s*\{([^}]*)\}/.exec(css);
  assert.ok(ptSafe, "no se encontró .pt-safe");
  assert.ok(topSafe, "no se encontró .top-safe");

  for (const [nombre, regla] of [
    [".pt-safe", ptSafe[1]],
    [".top-safe", topSafe[1]]
  ] as const) {
    assert.match(regla, /var\(--safe-top\)/, `${nombre} no usa var(--safe-top)`);
    assert.doesNotMatch(
      regla,
      /env\(safe-area-inset/,
      `${nombre} vuelve a usar env() directo: dentro de la app de Android vale cero`
    );
  }

  // La base sigue sumándose: es lo que conserva el padding propio de cada
  // cabecera (`--pt-safe-base`). Perderla dejaría los títulos pegados al reloj.
  assert.match(ptSafe[1], /--pt-safe-base/);
});

test("la barra inferior y el hueco de las pantallas suben con la barrita de gestos", () => {
  // Los dos van JUNTOS. Subir solo la barra la deja tapando el último renglón;
  // subir solo el hueco deja la barra encima de la barrita de gestos.
  assert.match(
    leer("components/ui/LiquidBottomNav.tsx"),
    /bottom-\[calc\(0\.5rem\+var\(--safe-bottom\)\)\]/,
    "la barra inferior no despeja la barrita de gestos"
  );
  assert.match(
    leer("components/ui/AppFrame.tsx"),
    /pb-\[calc\(6rem\+var\(--safe-bottom\)\)\]/,
    "el hueco inferior de las pantallas no crece con la barra"
  );
});

test("ninguna imagen de la app móvil se abre en el navegador", () => {
  /*
   * ⚠️ Dentro del WebView no hay pestañas: un `target="_blank"` se lo pasa a
   * Chrome y SACA de la app. Para una imagen eso es un fallo --hay visor
   * propio--; para un PDF o un enlace de verdad es lo correcto, así que se
   * miran solo los sitios que muestran una imagen.
   */
  const sospechosos = [
    "components/ui/NotificationCard.tsx",
    "components/ResourceDiscussion.tsx",
    "app/checklist/page.tsx",
    "app/faltantes/page.tsx"
  ];
  for (const ruta of sospechosos) {
    const fuente = leer(ruta);
    const enlaces = fuente.match(/<a[^>]*target="_blank"[^>]*>[\s\S]{0,240}?<\/a>/g) ?? [];
    for (const enlace of enlaces) {
      assert.ok(
        !/<(Next)?Image\b|<img\b/.test(enlace),
        `${ruta} vuelve a abrir una imagen fuera de la app; usa <ImagenAmpliable>`
      );
    }
  }
});

test("el visor apila UNA parada de historial, no una por pintado", () => {
  /*
   * ⚠️ Quien monta el visor pasa `onClose` como función anónima, así que cambia
   * de identidad en cada pintado. Con `onClose` en las dependencias del efecto,
   * cada pintado apilaría una parada nueva y harían falta muchos «atrás» para
   * salir. La referencia es lo que lo impide.
   */
  const fuente = leer("components/VisorImagen.tsx");
  const efecto = /window\.history\.pushState[\s\S]*?\}, \[([^\]]*)\]\);/.exec(fuente);
  assert.ok(efecto, "no se encontró el efecto que apila la parada de historial");
  assert.equal(efecto[1].trim(), "", "el efecto del historial tiene dependencias: apilará una parada por pintado");
  assert.match(fuente, /refCerrar\.current\(\)/, "el visor debe avisar por referencia, no por la prop directa");
});
