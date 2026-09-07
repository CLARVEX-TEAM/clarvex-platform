// Genera el icono de barra de estado a partir del icono real de Clarvex.
//
// La barra de estado de Android pinta el icono como SILUETA: solo usa el canal
// alfa y descarta el color. Por eso no vale el icono a color -- saldria un
// cuadro blanco. Aqui se toma la MARCA (los pixeles blancos del logo) como
// alfa, y se descarta el fondo azul.
//
// Vive en ESTE repositorio y no en clarvex-movil porque aqui ya estan `sharp`
// y el icono de origen; alli habria que anadir una dependencia nativa pesada
// para un asset que cambia cuando cambie la marca, o sea casi nunca.
//
//   node scripts/icono-notificacion.mjs public/icon-512.png \
//        ../clarvex-movil/android/app/src/main/res
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGEN = process.argv[2];
const DESTINO = process.argv[3];

// Densidades de Android para un lienzo de 24dp.
const DENSIDADES = [
  ["mdpi", 24],
  ["hdpi", 36],
  ["xhdpi", 48],
  ["xxhdpi", 72],
  ["xxxhdpi", 96]
];

const { data, info } = await sharp(ORIGEN)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const alfa = Buffer.alloc(width * height);

// La marca es blanca; el fondo, azul. Se separa por luminancia: un pixel claro
// y poco saturado es marca. El umbral es holgado a proposito -- los bordes del
// logo estan suavizados y un corte duro dejaria la silueta dentada.
// ⚠️ Se ignora el BORDE de la imagen antes de buscar la marca. El icono lleva
// un resplandor calido alrededor del cuadrado redondeado (237,230,227) que
// llega hasta la orilla; es casi blanco, asi que cualquier umbral de "blanco"
// se lo traga y la caja delimitadora sale siendo la imagen entera --pasó--.
// Dentro de este recorte solo hay azul de fondo y marca blanca, que si se
// separan limpio. La marca ocupa el centro con holgura: 18 % por lado sobra.
const margen = Math.round(width * 0.18);
const dentro = (x, y) => x >= margen && y >= margen && x < width - margen && y < height - margen;

let minX = width, minY = height, maxX = -1, maxY = -1;
for (let i = 0; i < width * height; i++) {
  const p = i * channels;
  const r = data[p], g = data[p + 1], b = data[p + 2];
  const a = channels === 4 ? data[p + 3] : 255;
  // ⚠️ Se separa por SATURACION, no por luminancia. El azul claro de la esquina
  // del degradado tiene casi tanto brillo como la marca, asi que un umbral de
  // luminancia se traga el fondo entero -- comprobado: la caja delimitadora
  // salia siendo la imagen completa. El canal MINIMO si los separa: en el
  // blanco vale 255 y en el azul de marca (#2563EB) vale 37.
  const minCanal = Math.min(r, g, b);
  let valor = Math.round(Math.max(0, (minCanal - 90) / (255 - 90)) * 255);
  valor = Math.round((valor * a) / 255);
  const x = i % width, y = Math.floor(i / width);
  if (!dentro(x, y)) {
    alfa[i] = 0;
    continue;
  }
  alfa[i] = valor;
  if (valor > 128) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

if (maxX < 0) throw new Error("No se encontro la marca dentro del icono.");
console.log(`Marca encontrada en ${minX},${minY} .. ${maxX},${maxY}`);

// Blanco puro con el alfa calculado. El color da igual (Android lo tiñe) pero
// dejarlo en blanco evita halos oscuros al escalar.
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  rgba[i * 4] = 255;
  rgba[i * 4 + 1] = 255;
  rgba[i * 4 + 2] = 255;
  rgba[i * 4 + 3] = alfa[i];
}

const anchoMarca = maxX - minX + 1;
const altoMarca = maxY - minY + 1;
const lado = Math.max(anchoMarca, altoMarca);

const recortado = await sharp(rgba, { raw: { width, height, channels: 4 } })
  .extract({
    left: Math.max(0, minX - Math.round((lado - anchoMarca) / 2)),
    top: Math.max(0, minY - Math.round((lado - altoMarca) / 2)),
    width: Math.min(width - minX, lado),
    height: Math.min(height - minY, lado)
  })
  .png()
  .toBuffer();

for (const [densidad, lienzo] of DENSIDADES) {
  // La guia de Android deja el glifo dentro del lienzo, no pegado al borde:
  // ~2dp de margen sobre 24dp.
  const glifo = Math.round(lienzo * (20 / 24));
  const png = await sharp(recortado)
    .resize(glifo, glifo, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .extend({
      top: Math.floor((lienzo - glifo) / 2),
      bottom: Math.ceil((lienzo - glifo) / 2),
      left: Math.floor((lienzo - glifo) / 2),
      right: Math.ceil((lienzo - glifo) / 2),
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toBuffer();
  const carpeta = join(DESTINO, `drawable-${densidad}`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "ic_stat_clarvex.png"), png);
  console.log(`drawable-${densidad}/ic_stat_clarvex.png  ${lienzo}x${lienzo}  ${png.length} bytes`);
}
