"use client";

import { DesktopShell } from "@/components/desktop/DesktopShell";

export default function EscritorioLayout({ children }: { children: React.ReactNode }) {
  return <DesktopShell>{children}</DesktopShell>;
}
