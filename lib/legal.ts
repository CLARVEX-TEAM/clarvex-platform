// Documentos legales que el usuario debe ACEPTAR (firma digital tipo click-wrap)
// dentro de la app. Cada aceptación se guarda por documento + versión, con IP y
// user-agent, en la tabla LegalAcceptance (evidencia de consentimiento).
//
// Subir la `version` de un documento re-solicita SOLO ese documento en el
// siguiente ingreso de cada usuario (los demás quedan aceptados).

export type LegalDocKey = "terms" | "privacy" | "acceptable_use";

export type LegalDoc = {
  key: LegalDocKey;
  /** Nombre visible en la compuerta de aceptación. */
  label: string;
  /** Versión vigente. Cambiarla re-solicita la aceptación de ESTE documento. */
  version: string;
  /** Ruta pública donde se lee el documento. */
  url: string;
};

export const LEGAL_DOCUMENTS: readonly LegalDoc[] = [
  { key: "terms", label: "Términos y Condiciones", version: "2026-07", url: "/terminos" },
  { key: "privacy", label: "Aviso de Privacidad", version: "2026-07", url: "/privacidad" },
  { key: "acceptable_use", label: "Política de Uso Aceptable", version: "2026-07", url: "/uso-aceptable" }
] as const;

/** Compatibilidad con el mecanismo anterior (User.termsAcceptedVersion). */
export const TERMS_VERSION = "2026-07";

/** Clave estable "documento:versión" para comparar aceptaciones. */
export function acceptanceKey(document: string, version: string): string {
  return `${document}:${version}`;
}
