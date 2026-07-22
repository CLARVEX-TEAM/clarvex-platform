import { LegalDocument } from "@/components/LegalDocument";

export const metadata = {
  title: "Política de Seguridad de la Información · CLARVEX Team",
  description: "Política de Seguridad de la Información de CLARVEX Team."
};

export default function SeguridadPage() {
  return <LegalDocument docKey="security" backHref="/legal" />;
}
