import { LegalDocument } from "@/components/LegalDocument";

export const metadata = {
  title: "Política de Cookies · CLARVEX Team",
  description: "Política de Cookies de CLARVEX Team."
};

export default function CookiesPage() {
  return <LegalDocument docKey="cookies" backHref="/legal" />;
}
