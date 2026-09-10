/**
 * Catálogo de contrapartes del kardex: a dónde sale y de dónde entra mercancía.
 *
 * Sale de la `Hoja1` del kardex que lleva la tienda a mano —72 tiendas Tommy con
 * su APTO— más los destinos que usan y no son tienda (CEDIS, UNIFORMES).
 *
 * ## Por qué existe este archivo y no un texto libre
 *
 * En el kardex de papel escriben el nombre corto: «O. MTY», «VALLARTA». Eso
 * funciona hasta que es ambiguo: **«CUERNAVACA» son dos tiendas** (Galerías
 * `03036` y Outlet `03049`), y «METEPEC» otras dos (`03031` y `03073`). Un
 * traspaso anotado así ya no se puede rastrear.
 *
 * Por eso se guarda el APTO junto a la etiqueta: la ambigüedad se resuelve al
 * capturar, que es el único momento en que alguien sabe cuál era.
 *
 * `alias` es el nombre corto que ya escriben. Se busca por él además de por el
 * nombre oficial: quien captura busca «O. MTY», no «TOMMY OUTLET MONTERREY».
 */

export type Counterpart = {
  /** APTO de la tienda, o un código propio para lo que no es tienda. */
  code: string;
  /** Nombre oficial del catálogo. */
  name: string;
  /** Nombre corto que usan al capturar, cuando se conoce. */
  alias?: string;
  /** Destino habitual: se ofrece primero. */
  frequent?: boolean;
  /** No es una tienda del catálogo (CEDIS, uniformes). */
  external?: boolean;
};

export const COUNTERPARTS: Counterpart[] = [
  // No son tiendas, pero son la mayoría de los movimientos: 71 de 129 envíos de
  // la 1ra ronda 2026 fueron a CEDIS.
  { code: "CEDIS", name: "CEDIS", frequent: true, external: true },
  { code: "UNIFORMES", name: "Uniformes", external: true },

  { code: "03001", name: "TOMMY COSTERA ACAPULCO" },
  { code: "03002", name: "TOMMY LA ISLA ACAPULCO" },
  { code: "03003", name: "TOMMY ALTARIA AGUASCALIENTES" },
  { code: "03004", name: "TOMMY ANGELOPOLIS PUEBLA" },
  { code: "03005", name: "TOMMY ANTARA" },
  { code: "03006", name: "TOMMY LA ISLA CANCUN" },
  { code: "03007", name: "TOMMY COYOACAN" },
  { code: "03008", name: "TOMMY OUTLET GUADALAJARA" },
  { code: "03009", name: "TOMMY OUTLET MONTERREY", alias: "O. MTY", frequent: true },
  { code: "03010", name: "TOMMY OUTLET PLAZAS PUEBLA" },
  { code: "03011", name: "TOMMY ANDARES GUARALAJARA" },
  { code: "03012", name: "TOMMY INTERLOMAS" },
  { code: "03013", name: "TOMMY PARQUE LINDAVISTA" },
  { code: "03014", name: "TOMMY MALECON LAS AMERICAS CANCUN" },
  { code: "03015", name: "TOMMY ALTABRISA MERIDA" },
  { code: "03016", name: "TOMMY ALTOZANO MORELIA" },
  { code: "03017", name: "TOMMY OUTLET LERMA" },
  { code: "03018", name: "TOMMY OUTLET LAS PLAZAS CANCUN" },
  { code: "03019", name: "TOMMY OUTLET PUNTA NORTE" },
  { code: "03020", name: "TOMMY REFORMA 222", alias: "REFORMA 222" },
  { code: "03021", name: "TOMMY PLAZA SANBORNS SAN LUIS POTOSI" },
  { code: "03022", name: "TOMMY PARQUE TEZONTLE" },
  { code: "03023", name: "TOMMY TLAQUEPAQUE GUADALAJARA" },
  { code: "03024", name: "TOMMY PARQUE DELTA" },
  { code: "03025", name: "TOMMY SANTA FE" },
  { code: "03026", name: "TOMMY ALTABRISA VILLAHERMOSA" },
  { code: "03027", name: "TOMMY OUTLET ARAGON" },
  { code: "03028", name: "TOMMY LAS AMERICAS MORELIA" },
  { code: "03029", name: "TOMMY SAN AGUSTIN MONTERREY" },
  { code: "03030", name: "TOMMY GALERIAS GUADALAJARA" },
  { code: "03031", name: "TOMMY GALERIAS METEPEC" },
  { code: "03032", name: "TOMMY PLAYA DEL CARMEN" },
  { code: "03033", name: "TOMMY ANTEA QUERETARO" },
  { code: "03034", name: "TOMMY SATELITE" },
  { code: "03035", name: "TOMMY FIESTA ANAHUAC MONTERREY" },
  { code: "03036", name: "TOMMY GALERIAS CUERNAVACA" },
  { code: "03037", name: "TOMMY GALERIAS MONTERREY" },
  { code: "03038", name: "TOMMY FORUM CULIACAN" },
  { code: "03039", name: "TOMMY LEON GUANAJUATO" },
  { code: "03040", name: "TOMMY ANDAMAR VERACRUZ" },
  { code: "03041", name: "TOMMY PARQUE TOREO", alias: "PARQUE TOREO" },
  { code: "03042", name: "TOMMY SAN PEDRO", alias: "SAN PEDRO" },
  { code: "03044", name: "TOMMY TLALNEPANTLA" },
  { code: "03045", name: "Tommy Hilfiger VIA VALLEJO" },
  { code: "03046", name: "TOMMY OUTLET LERMA 2" },
  { code: "03047", name: "TOMMY PUERTO VALLARTA", alias: "VALLARTA" },
  { code: "03048", name: "TOMMY TAMPICO" },
  { code: "03049", name: "TOMMY OUTLET CUERNAVACA" },
  { code: "03050", name: "TOMMY HILFIGER TUXTLA" },
  { code: "03051", name: "TOMMY HILFIGER MANACAR" },
  { code: "03052", name: "TOMMY HILFIGER PARQUE PUEBLA" },
  { code: "03053", name: "TOMMY HILFIGER ANTARA SUR" },
  { code: "03054", name: "TOMMY OUTLET PORTAL CENTRO BOTURINI" },
  { code: "03055", name: "TOMMY HILFIGER LA ISLA MERIDA" },
  { code: "03056", name: "TOMMY HILFIGER PASEO QUERETARO" },
  { code: "03057", name: "TOMMY HILFIGER OUTLET EXPLANADA PUEBLA" },
  { code: "03058", name: "TOMMY HILFIGER MIDTOWN JALISCO" },
  { code: "03059", name: "TOMMY OUTLET PREMIUM QUERETARO" },
  { code: "03060", name: "TOMMY OUTLET EXPLANADA PACHUCA" },
  { code: "03061", name: "TOMMY JEANS LAS ANTENAS" },
  { code: "03062", name: "TOMMY OUTLET PUNTA NORTE 2" },
  { code: "03063", name: "TOMMY JEANS ANTARA" },
  { code: "03064", name: "TOMMY OUTLET OCEANÍA" },
  { code: "03065", name: "TOMMY OUTLET EXPLANADA CULIACAN" },
  { code: "03066", name: "TOMMY OUTLET LAS ANTENAS" },
  { code: "03067", name: "TOMMY HILFIGER MITIKAH" },
  { code: "03068", name: "TOMMY OUTLET RIVIERA MAYA" },
  { code: "03069", name: "TOMMY THE PARK SAN LUIS" },
  { code: "03070", name: "TOMMY JEANS SATÉLITE" },
  { code: "03072", name: "TOMMY HILFIGER ALTACIA", alias: "ALTACIA" },
  { code: "03073", name: "TOMMY HILFIGER METEPEC" },
  { code: "03074", name: "TOMMY HILFIGER ANTEA QRO II" }
];

const BY_CODE = new Map(COUNTERPARTS.map((entry) => [entry.code, entry]));

/**
 * Códigos que usa el SISTEMA del corporativo y que el catálogo de la tienda
 * llama de otra forma.
 *
 * ⚠️ La hoja de traspaso imprime «Ubicación de recepción: 03000 - TOMMY», con la
 * razón «CGRAL - Devolución A. Gral.»: es el almacén general, que en el kardex
 * de papel de la tienda siempre se anotó como **CEDIS**. Son el mismo sitio con
 * dos nombres, y sin esta equivalencia un traspaso leído de la hoja se
 * rechazaría con «la contraparte 03000 no está en el catálogo».
 *
 * ⚠️ **Va como equivalencia y NO como entrada nueva del catálogo.** Dos filas
 * para el mismo destino partirían el histórico en dos, y ninguna de las dos
 * sumaría lo que de verdad salió — con 71 de los 129 envíos de la 1ra ronda
 * yendo ahí, eso es la mayor parte del movimiento de la tienda.
 */
const EQUIVALENTES: Record<string, string> = {
  "03000": "CEDIS"
};

export function findCounterpart(code: string): Counterpart | null {
  const limpio = code.trim().toUpperCase();
  return BY_CODE.get(EQUIVALENTES[limpio] ?? limpio) ?? null;
}

/** Etiqueta que se muestra: el nombre corto si lo hay, si no el oficial. */
export function counterpartLabel(entry: Counterpart): string {
  return entry.alias ?? entry.name;
}

/**
 * El catálogo para el desplegable, con los habituales primero.
 *
 * El resto va por código, que es como viene el catálogo original y como lo
 * reconocen en tienda.
 */
export function counterpartOptions(): (Counterpart & { label: string })[] {
  const frequent = COUNTERPARTS.filter((entry) => entry.frequent);
  const rest = COUNTERPARTS.filter((entry) => !entry.frequent).sort((left, right) =>
    left.code.localeCompare(right.code)
  );
  return [...frequent, ...rest].map((entry) => ({ ...entry, label: counterpartLabel(entry) }));
}
