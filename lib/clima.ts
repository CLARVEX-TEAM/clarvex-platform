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
