/** @type {import('next').NextConfig} */

import path from "node:path";

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

const nextConfig = {
  reactStrictMode: true,

  // Necesario para que three.js / react-three-fiber / drei se transpilen al target
  // del navegador y no truenen en el build de producción (mapa 3D).
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],

  // Fuerza UNA sola copia de React. react-three-fiber trae su propio
  // react-reconciler; si éste resuelve otra instancia de React, los internals
  // (ReactCurrentBatchConfig) quedan undefined y la escena 3D truena.
  webpack: (config, { isServer }) => {
    // Solo en cliente: en servidor rompería las condiciones "react-server" (RSC).
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        react: path.resolve(process.cwd(), "node_modules/react"),
        "react-dom": path.resolve(process.cwd(), "node_modules/react-dom"),
      };
    }
    return config;
  },

  images: {
    remotePatterns: [
      ...(r2Domain ? [{ protocol: /** @type {"https"} */ ("https"), hostname: r2Domain, pathname: "/**" }] : []),
      {
        protocol: "https",
        hostname: "pub-650b73e1731f47a3b905fb9c615cb596.r2.dev",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    const imgSrc = ["'self'", "data:", "blob:", r2Domain].filter(Boolean).join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `img-src ${imgSrc}`,
              "font-src 'self' data:",
              "connect-src 'self'",
              "manifest-src 'self'",
              "worker-src 'self'",
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

export default nextConfig;
