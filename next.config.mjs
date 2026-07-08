/** @type {import('next').NextConfig} */

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
    ],
  },

  async headers() {
    // a.espncdn.com: escudos de las selecciones en la sección Mundial.
    const imgSrc = ["'self'", "data:", "blob:", r2Domain, "https://a.espncdn.com"].filter(Boolean).join(" ");
    // 'unsafe-eval' solo es necesario para el HMR de desarrollo; en producción debilita el CSP.
    const scriptSrc = ["'self'", "'unsafe-inline'", process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""].filter(Boolean).join(" ");

    return [
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
              "connect-src 'self'",
              "manifest-src 'self'",
              "worker-src 'self'",
              // Transmisión del partido ("Ver partido"): dominios permitidos en iframe
              "frame-src 'self' https://embedindia.st https://tvhd1.com https://www.youtube.com https://www.youtube-nocookie.com",
              "child-src 'self' https://embedindia.st https://tvhd1.com https://www.youtube.com https://www.youtube-nocookie.com",
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
