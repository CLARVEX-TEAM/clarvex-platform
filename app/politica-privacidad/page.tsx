import { LegalDocument } from "@/components/LegalDocument";

export const metadata = {
  title: "Política de Privacidad · CLARVEX Team",
  description: "Política de Privacidad de CLARVEX Team."
};

export default function PoliticaPrivacidadPage() {
  return <LegalDocument docKey="privacy_policy" backHref="/legal" />;
}
