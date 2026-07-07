"use client";

// Último recurso: error en el layout raíz. Sin estilos de la app (el layout
// pudo no cargar), HTML mínimo y legible.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#0f172a", color: "#fff", textAlign: "center", padding: "0 2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem" }}>⚠️ Algo salió mal</h1>
          <p style={{ fontSize: ".9rem", opacity: 0.7 }}>
            No se pudo cargar la aplicación.{error.digest ? ` Código: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: "1rem", padding: ".7rem 2rem", borderRadius: "999px", border: 0, background: "#2563eb", color: "#fff", fontWeight: 700 }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
