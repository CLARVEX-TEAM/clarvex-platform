"use client";

import { Component, type ReactNode } from "react";

/**
 * Aísla fallos de la escena 3D (WebGL no disponible, GPU bloqueada, etc.)
 * para que no tumben toda la app: muestra un fallback 2D en su lugar.
 */
export class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Queda en la consola para diagnóstico.
    console.error("[StoreMap3D] error en la vista 3D:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
