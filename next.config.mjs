/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

// Origen exacto de ingesta de Sentry (p. ej. https://oXXXX.ingest.us.sentry.io).
// Se deriva del DSN para abrir el CSP solo a ese host, no a *.sentry.io.
const sentryIngest = sentryDsn
  ? (() => {
      try {
        return new URL(sentryDsn).origin;
      } catch {
        return "";
      }
    })()
  : "";

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
    // Sentry: solo se abre si hay DSN configurado. Sin DSN, el CSP queda igual.
    const connectSrc = ["'self'", sentryIngest].filter(Boolean).join(" ");

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
};

// Solo se envuelve con Sentry si hay DSN. Sin DSN el build es idéntico al previo
// (no se ejecuta el plugin ni se intentan subir source maps).
export default sentryDsn
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Sin SENTRY_AUTH_TOKEN no se suben source maps: el build no falla, solo
      // los stack traces salen minificados.
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      silent: true,
      webpack: { treeshake: { removeDebugLogging: true } }
    })
  : nextConfig;
