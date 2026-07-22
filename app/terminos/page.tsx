import { LegalDocument } from "@/components/LegalDocument";

export const metadata = {
  title: "Términos de Uso · CLARVEX Team",
  description: "Términos de Uso para Usuario Final de CLARVEX Team."
};

export default function TerminosPage() {
  return <LegalDocument docKey="terms" />;
}
