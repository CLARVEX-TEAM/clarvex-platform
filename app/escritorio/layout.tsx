"use client";

import { DesktopShell } from "@/components/desktop/DesktopShell";

// Sistema visual del escritorio. Todo su contenido vive bajo [data-surface="desk"],
// así que importarlo aquí no puede filtrarse a la versión móvil.
import "./desktop.css";

export default function EscritorioLayout({ children }: { children: React.ReactNode }) {
  return <DesktopShell>{children}</DesktopShell>;
}
