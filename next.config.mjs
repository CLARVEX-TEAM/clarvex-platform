import FaroSourceMapUploaderPlugin from "@grafana/faro-webpack-plugin";
import { existsSync, readFileSync } from "node:fs";

/*
 * ⚠️ El `.env` se lee AQUI, a mano, y no es redundante.
 *
 * Next lo carga para la aplicacion, pero evalua ESTE archivo antes: cualquier
 * `process.env.X` leido aqui arriba sale vacio aunque la variable exista en el
 * `.env`. Costo un despliegue entero -- la clave guardada, el enlace al `.env`
 * bien puesto, y el build sin generar un solo source map ni decir por que.
 *
 * ⚠️ Escrito a mano y no con `@next/env`: ese paquete es CommonJS y su version
 * publicada va por delante de la de Next, asi que meterlo solo para esto trae
 * un desajuste de versiones a cambio de seis lineas.
 *
 * ⚠️ Solo LEE, y NO pisa lo que ya venga del entorno: una variable exportada en
 * el despliegue manda sobre el archivo, que es el orden que espera cualquiera.
 */
function leerDelEnv(clave) {
  if (process.env[clave]) return process.env[clave];
  // `process.cwd()` y no la URL de este modulo: el build siempre corre desde la
  // raiz del proyecto, y asi no hay que deshacer el `/C:/` que mete `file://`
  // en Windows.
  const ruta = `${process.cwd()}/.env`;
  if (!existsSync(ruta)) return undefined;
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    // ⚠️ El nombre es lo que va hasta el PRIMER `=`; todo lo demas es el valor,
    // que puede llevar mas signos igual --una credencial en base64 termina en
    // `=`--. Cortar por el ultimo se come el valor entero: es exactamente el
    // fallo que costo cuatro intentos con la credencial de Grafana.
    const corte = linea.indexOf("=");
    if (corte > 0 && linea.slice(0, corte).trim() === clave) {
      return linea.slice(corte + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

const faroApiKey = leerDelEnv("FARO_API_KEY");
/** @type {import('next').NextConfig} */


/*
 * A donde puede hablar el navegador, ademas de a nosotros mismos.
 *
 * ⚠️ SIN ESTO, EL NAVEGADOR BLOQUEA FARO Y NO SE ENTERA NADIE. La CSP corta la
 * peticion en el cliente: el colector nunca la ve, Grafana dice «Never received
 * any data» y desde el servidor un `curl` al mismo colector responde 202 --
 * porque `curl` no obedece la CSP--. Se pierde media hora buscando en el sitio
 * equivocado; aqui estuvo el fallo real.
 *
 * ⚠️ Y va el ORIGEN EXACTO, no `*.grafana.net`. Un comodin abriria tambien
 * cualquier otra cuenta de Grafana; lo unico que esta app necesita es hablar
 * con su colector.
 */
const faroColector = "https://faro-collector-prod-us-west-0.grafana.net";

const r2PublicUrl = process.env.R2_PUBLIC_URL ?? "";
const r2Domain = r2PublicUrl
  ? (() => {
      try {
        return new URL(r2PublicUrl).hostname;
      } catch {
        return "";
      }
    })()
  : "";

// Origen de Retool desde el que se incrusta la captura (/escritorio/captura).
// Se deriva de la variable en vez de escribirlo a mano: el dominio cambia según
// la instalación, y una lista fija dejaría la pantalla en blanco sin decir por
// qué. Si no está configurada, no se añade nada y la política queda como estaba.
const retoolOrgUrl = process.env.RETOOL_ORG_URL ?? "";
const retoolOrigin = retoolOrgUrl
  ? (() => {
      try {
        return new URL(retoolOrgUrl).origin;
      } catch {
        return "";
      }
    })()
  : "";
const frameSrc = ["'self'", retoolOrigin].filter(Boolean).join(" ");

// Huella única de cada build. El cliente lleva la suya incrustada; el servidor
// (ya reconstruido) devuelve la nueva. Si difieren, la app sabe que está corriendo
// código viejo y ofrece recargar.
//
// Sin esto, una PWA en Android se queda con el bundle viejo hasta que el usuario
// la cierra desde "recientes" — y nadie hace eso. El equipo puede pasar semanas
// sin recibir un arreglo ya desplegado.
const buildId = process.env.BUILD_ID ?? Date.now().toString(36);

/**
 * ⚠️ **Solo el despliegue puede saltarse lint y tipos, y solo porque la CI ya
 * los corrió sobre ESTE MISMO commit.**
 *
 * Medido: de 64 s de build, 19 s son «Linting and checking validity of types» —
 * casi un tercio. Y es trabajo repetido: el preflight del despliegue **exige**
 * CI verde del mismo SHA, y esa CI ya pasó `tsc --noEmit` y
 * `eslint . --max-warnings 0` completos. El servidor los rehace, y encima es la
 * máquina más lenta de las tres.
 *
 * ⚠️ **Por defecto NO se salta nada.** Un `pnpm build` en cualquier otro sitio
 * sigue comprobando: la bandera la pone `deploy-release.sh`, que es el único
 * camino que tiene la garantía. Al revés --apagarlo siempre y confiar en que
 * alguien mire la CI-- es como se cuela un error de tipos a producción.
 *
 * Si algún día el despliegue dejara de exigir CI verde, esto tiene que volver.
 */
const ciYaVerifico = process.env.CLARVEX_CI_VERIFICADA === "1";

const nextConfig = {
  reactStrictMode: true,
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  typescript: { ignoreBuildErrors: ciYaVerifico },
  eslint: { ignoreDuringBuilds: ciYaVerifico },

  // URL limpia para el manual de uso (archivo estático en /public/manual.html).
  async rewrites() {
    return [{ source: "/manual", destination: "/manual.html" }];
  },

  images: {
    remotePatterns: [
      ...(r2Domain ? [{ protocol: /** @type {"https"} */ ("https"), hostname: r2Domain, pathname: "/**" }] : []),
      {
        protocol: "https",
        hostname: "pub-650b73e1731f47a3b905fb9c615cb596.r2.dev",
        pathname: "/**",
      },
      // Endpoint S3 de R2: destino de las URLs firmadas (evidencias, comunicados,
      // capacitación, fotos de producto). Sin esto next/image las rechaza.
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    // a.espncdn.com: escudos. Klipy CDN: GIFs del chat (hosts allowlisted en servidor).
    // *.r2.cloudflarestorage.com: URLs firmadas de R2 (bucket privado).
    const imgSrc = ["'self'", "data:", "blob:", r2Domain, "https://*.r2.cloudflarestorage.com", "https://a.espncdn.com", "https://*.klipy.com", "https://klipy.com"].filter(Boolean).join(" ");
    // 'unsafe-inline' es necesario para el runtime de Next.js sin nonces en layout;
    // 'unsafe-eval' solo en desarrollo (HMR).
    const scriptSrc = ["'self'", "'unsafe-inline'", process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""].filter(Boolean).join(" ");
    const connectSrc = ["'self'", faroColector].join(" ");

    return [
      {
        // El service worker NUNCA debe cachearse: con max-age los dispositivos se
        // quedan con el SW viejo y no reciben arreglos hasta que caduque (venía
        // con 4 h). no-cache obliga a revalidar en cada comprobación de update.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=(self): el escáner de marbetes (Conteos) usa la cámara.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src ${imgSrc}`,
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "manifest-src 'self'",
              "worker-src 'self'",
              `frame-src ${frameSrc}`,
              `child-src ${frameSrc}`,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  /*
   * ⚠️ Los source maps del cliente se GENERAN solo cuando hay con qué subirlos.
   *
   * Simbolizar un error exige tenerlos, y Next los escribe dentro de
   * `.next/static`, que es la carpeta que se publica. Generarlos sin subirlos
   * ni borrarlos dejaria el codigo fuente de la app servido en internet: la
   * logica de comisiones, como se firma la peticion del aparato, todo, y sin
   * dejar rastro de que alguien lo miro.
   *
   * De borrarlos despues de la subida se encarga `scripts/borrar-sourcemaps.mjs`,
   * que corre al final del build Y COMPRUEBA que no queda ninguno.
   */
  productionBrowserSourceMaps: Boolean(faroApiKey),
};

/*
 * El subidor de source maps a Grafana.
 *
 * ⚠️ Solo si hay clave. Sin ella el build es el de siempre --no se generan
 * mapas, no se sube nada-- para que una maquina de desarrollo no intente subir
 * el codigo fuente a ninguna parte.
 *
 * ⚠️ Y la clave NO va en el codigo, a diferencia de la URL del colector. Esta
 * si es un secreto de verdad: los source maps son la aplicacion sin minificar,
 * y quien pueda escribir --o leer-- ahi la tiene entera.
 */
const conFaro = (config) => {
  if (!faroApiKey) return config;
  const anterior = config.webpack;
  return {
    ...config,
    webpack(webpackConfig, contexto) {
      const base = anterior ? anterior(webpackConfig, contexto) : webpackConfig;
      // Solo el paquete del navegador: los mapas del servidor no salen de la
      // maquina y no hay nada que simbolizar en Grafana.
      if (!contexto.isServer) {
        base.plugins.push(
          new FaroSourceMapUploaderPlugin({
            appName: "clarvex-app",
            endpoint: "https://faro-api-prod-us-west-0.grafana.net/faro/api/v1",
            appId: "5687",
            stackId: "1848107",
            apiKey: faroApiKey,
            gzipContents: true,
            verbose: false,
          })
        );
      }
      return base;
    },
  };
};

/*
 * Sentry se retiro el 29 de septiembre de 2026.
 *
 * ⚠️ El motivo no fue preferencia, fue que los dos NO PUEDEN convivir sobre los
 * source maps: Sentry los genera, los sube y los BORRA, asi que el subidor de
 * Faro no llegaba a verlos --317 chunks con `_sentryDebugId` en el ultimo
 * despliegue-- y sin mapas un error del navegador llega como
 * `at u (chunks/6834-....js:18:106653)`.
 *
 * Lo que hacia se reparte: trazas y errores del servidor por OpenTelemetry al
 * colector, errores del navegador por Faro.
 */
export default conFaro(nextConfig);
