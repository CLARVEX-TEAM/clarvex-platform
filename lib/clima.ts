/**
 * El clima de la tienda, para la entrada de «Mi día».
 *
 * ⚠️ **La fuente es Open-Meteo y se eligió por no llevar llave.** No hay que dar
 * de alta una cuenta, no hay token que guardar en el `.env`, no hay nada que
 * rotar y no hay factura que se dispare. Las alternativas conocidas
 * --OpenWeatherMap y compañía-- piden una API key: un secreto más que mantener
 * y otra cosa que se cae en silencio el día que caduque.
 *
 * https://open-meteo.com/en/docs — uso no comercial gratuito, sin registro.
 *
 * ⚠️ **Si el clima falla, no pasa NADA.** Es decoración informativa: la entrada
 * se salta y «Mi día» abre directo. Un dato de adorno no puede retrasar ni
 * romper la pantalla donde se consulta el turno y la venta.
 */

/** Lo que se pinta: un icono, una palabra y los grados. */
export type Clima = {
  /** Grados centígrados, ya redondeados. */
  temperatura: number;
  /** «Despejado», «Nublado»… en español y en una sola palabra donde se pueda. */
  descripcion: string;
  /** Qué dibujo toca. Lo traduce el componente a un icono concreto. */
  icono: IconoClima;
  /** De día o de noche: el mismo cielo despejado es sol o luna. */
  esDeDia: boolean;
};

export type IconoClima =
  | "despejado"
  | "algo-nublado"
  | "nublado"
  | "niebla"
  | "llovizna"
  | "lluvia"
  | "aguacero"
  | "nieve"
  | "tormenta";

/**
 * Códigos WMO que devuelve Open-Meteo en `weather_code`.
 *
 * ⚠️ La tabla es EXPLÍCITA, código por código, y no por rangos. Los rangos se
 * ven más cortos y mienten: 56 y 57 son llovizna HELADA, 66 y 67 lluvia helada,
 * y caen justo en medio de los tramos de llovizna y lluvia normales. En
 * Monterrey da igual, pero la tienda siguiente puede no estar en Monterrey.
 */
const TABLA: Record<number, { icono: IconoClima; descripcion: string }> = {
  0: { icono: "despejado", descripcion: "Despejado" },
  1: { icono: "despejado", descripcion: "Mayormente despejado" },
  2: { icono: "algo-nublado", descripcion: "Parcialmente nublado" },
  3: { icono: "nublado", descripcion: "Nublado" },
  45: { icono: "niebla", descripcion: "Niebla" },
  48: { icono: "niebla", descripcion: "Niebla helada" },
  51: { icono: "llovizna", descripcion: "Llovizna ligera" },
  53: { icono: "llovizna", descripcion: "Llovizna" },
  55: { icono: "llovizna", descripcion: "Llovizna fuerte" },
  56: { icono: "llovizna", descripcion: "Llovizna helada" },
  57: { icono: "llovizna", descripcion: "Llovizna helada" },
  61: { icono: "lluvia", descripcion: "Lluvia ligera" },
  63: { icono: "lluvia", descripcion: "Lluvia" },
  65: { icono: "lluvia", descripcion: "Lluvia fuerte" },
  66: { icono: "lluvia", descripcion: "Lluvia helada" },
  67: { icono: "lluvia", descripcion: "Lluvia helada" },
  71: { icono: "nieve", descripcion: "Nieve ligera" },
  73: { icono: "nieve", descripcion: "Nieve" },
  75: { icono: "nieve", descripcion: "Nieve fuerte" },
  77: { icono: "nieve", descripcion: "Aguanieve" },
  80: { icono: "aguacero", descripcion: "Chubascos" },
  81: { icono: "aguacero", descripcion: "Chubascos" },
  82: { icono: "aguacero", descripcion: "Aguacero" },
  85: { icono: "nieve", descripcion: "Chubascos de nieve" },
  86: { icono: "nieve", descripcion: "Chubascos de nieve" },
  95: { icono: "tormenta", descripcion: "Tormenta" },
  96: { icono: "tormenta", descripcion: "Tormenta con granizo" },
  99: { icono: "tormenta", descripcion: "Tormenta con granizo" }
};

/**
 * ⚠️ Un código que no esté en la tabla NO inventa un dibujo bonito: cae en
 * «nublado», que es lo más neutro que hay, y conserva la temperatura, que es el
 * dato que de verdad se mira. Adivinar entre sol y tormenta por un número
 * desconocido es peor que no decir nada.
 */
export function climaDelCodigo(codigo: number, temperatura: number, esDeDia: boolean): Clima {
  const encontrado = TABLA[codigo];
  return {
    temperatura: Math.round(temperatura),
    descripcion: encontrado?.descripcion ?? "Sin detalle",
    icono: encontrado?.icono ?? "nublado",
    esDeDia
  };
}

/** Lo que devuelve Open-Meteo dentro de `current`. */
type RespuestaCruda = {
  current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown };
};

/**
 * Traduce la respuesta de Open-Meteo, o `null` si no trae lo que hace falta.
 *
 * ⚠️ Se comprueba que los tres campos sean NÚMEROS de verdad. Un servicio
 * gratuito que cambie de formato, o una respuesta de error con 200, dejarían
 * `undefined` donde va la temperatura y la pantalla pintaría «NaN °C».
 */
export function leerRespuesta(crudo: unknown): Clima | null {
  const actual = (crudo as RespuestaCruda | null)?.current;
  if (!actual) return null;
  const temperatura = actual.temperature_2m;
  const codigo = actual.weather_code;
  if (typeof temperatura !== "number" || !Number.isFinite(temperatura)) return null;
  if (typeof codigo !== "number" || !Number.isFinite(codigo)) return null;
  // `is_day` llega como 1 o 0. Si faltara, se asume de día: el sol es el dibujo
  // menos llamativo de los dos y no despierta a nadie con una luna a mediodía.
  const esDeDia = actual.is_day === undefined ? true : Number(actual.is_day) === 1;
  return climaDelCodigo(codigo, temperatura, esDeDia);
}

/* ------------------------------------------------------------------------- *
 * El AMBIENTE: qué color y qué se mueve para cada clima.
 * ------------------------------------------------------------------------- */

/** Lo que se anima encima del degradado. */
export type EfectoClima = "sol" | "luna" | "nubes" | "niebla" | "lluvia" | "nieve" | "tormenta";

export type AmbienteClima = {
  /** El degradado de la tarjeta, listo para `background`. */
  fondo: string;
  /** El color del dibujo SOBRE ese degradado. */
  acento: string;
  /**
   * ⚠️ El MISMO color, oscurecido para que se lea sobre el PAPEL.
   *
   * El icono pequeño que se queda en la pantalla vive sobre el fondo crema, no
   * sobre el degradado. Un sol de `#FFC53D` sobre azul marino se ve de lejos y
   * sobre crema desaparece: es exactamente lo que pasaba, con el sol pintado en
   * un azul clarísimo que solo existía para el degradado.
   */
  acentoPapel: string;
  efecto: EfectoClima;
  /** Cuántas gotas o copos caen: distingue la llovizna del aguacero. */
  intensidad: number;
};

const NOCHE_DESPEJADA = "linear-gradient(150deg,#050B1C 0%,#132A5E 58%,#2A4E9E 100%)";

/**
 * ⚠️ La NOCHE no es el mismo dibujo con menos brillo: es otro fondo.
 *
 * Un cielo azul claro a las nueve de la noche se lee como que el dato está
 * viejo. Cada clima trae su degradado de día y el de noche; lo único que cambia
 * de dibujo es el cielo despejado, que pasa de sol a luna --no existe una
 * «luna con lluvia» en el juego de iconos, y tampoco hace falta.
 */
const AMBIENTE: Record<IconoClima, Omit<AmbienteClima, "fondo"> & { dia: string; noche: string }> = {
  despejado: {
    dia: "linear-gradient(150deg,#0B4DA8 0%,#1E7BE0 50%,#63B6F7 100%)",
    noche: NOCHE_DESPEJADA,
    acento: "#FFC53D",
    acentoPapel: "var(--clima-sol)",
    efecto: "sol",
    intensidad: 0
  },
  "algo-nublado": {
    dia: "linear-gradient(150deg,#12599E 0%,#3E8FD8 52%,#93C8EE 100%)",
    noche: "linear-gradient(150deg,#08142E 0%,#1B3766 58%,#365C9E 100%)",
    acento: "#FFC53D",
    acentoPapel: "var(--clima-sol)",
    efecto: "nubes",
    intensidad: 2
  },
  nublado: {
    dia: "linear-gradient(150deg,#2B4360 0%,#4E6C8C 52%,#93ABC2 100%)",
    noche: "linear-gradient(150deg,#141C2B 0%,#2C3D55 58%,#4E6480 100%)",
    acento: "#FFFFFF",
    acentoPapel: "var(--clima-nubes)",
    efecto: "nubes",
    intensidad: 3
  },
  niebla: {
    dia: "linear-gradient(150deg,#46586B 0%,#7A8B9C 52%,#BFCAD4 100%)",
    noche: "linear-gradient(150deg,#1A222C 0%,#38444F 58%,#5E6C79 100%)",
    acento: "#FFFFFF",
    acentoPapel: "var(--clima-niebla)",
    efecto: "niebla",
    intensidad: 0
  },
  llovizna: {
    dia: "linear-gradient(150deg,#153A5E 0%,#2A6191 52%,#5B93BC 100%)",
    noche: "linear-gradient(150deg,#081527 0%,#16304C 58%,#2B5273 100%)",
    acento: "#A7DBFF",
    acentoPapel: "var(--clima-lluvia)",
    efecto: "lluvia",
    intensidad: 7
  },
  lluvia: {
    dia: "linear-gradient(150deg,#0E2A4A 0%,#1D4E7C 52%,#4285AE 100%)",
    noche: "linear-gradient(150deg,#050F1E 0%,#102540 58%,#224765 100%)",
    acento: "#9ED8FF",
    acentoPapel: "var(--clima-lluvia)",
    efecto: "lluvia",
    intensidad: 12
  },
  aguacero: {
    dia: "linear-gradient(150deg,#08203B 0%,#143F68 52%,#2E6F99 100%)",
    noche: "linear-gradient(150deg,#030A15 0%,#0B1C33 58%,#173854 100%)",
    acento: "#8FD2FF",
    acentoPapel: "var(--clima-lluvia)",
    efecto: "lluvia",
    intensidad: 20
  },
  nieve: {
    dia: "linear-gradient(150deg,#28527A 0%,#5E8CB5 52%,#C3DDF0 100%)",
    noche: "linear-gradient(150deg,#0D1B2C 0%,#24405C 58%,#476F94 100%)",
    acento: "#FFFFFF",
    acentoPapel: "var(--clima-nieve)",
    efecto: "nieve",
    intensidad: 14
  },
  tormenta: {
    dia: "linear-gradient(150deg,#0A1330 0%,#28205A 52%,#544295 100%)",
    noche: "linear-gradient(150deg,#05081C 0%,#1A1440 58%,#3B2E72 100%)",
    acento: "#FFD84D",
    acentoPapel: "var(--clima-tormenta)",
    efecto: "tormenta",
    intensidad: 14
  }
};

/** El dibujo y los colores que le tocan a este clima. */
export function ambienteDe(clima: Clima): AmbienteClima {
  const base = AMBIENTE[clima.icono] ?? AMBIENTE.nublado;
  const fondo = clima.esDeDia ? base.dia : base.noche;

  // El cielo despejado es lo único que cambia de dibujo con la hora.
  if (clima.icono === "despejado" && !clima.esDeDia) {
    return { fondo, acento: "#DCE6FF", acentoPapel: "var(--clima-luna)", efecto: "luna", intensidad: 0 };
  }

  return { fondo, acento: base.acento, acentoPapel: base.acentoPapel, efecto: base.efecto, intensidad: base.intensidad };
}
