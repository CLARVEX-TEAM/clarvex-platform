import { LegalDocument } from "@/components/LegalDocument";

export const metadata = {
  title: "Política de Reembolsos y Cancelaciones · CLARVEX Team",
  description: "Política de Reembolsos y Cancelaciones de CLARVEX Team."
};

export default function ReembolsosPage() {
  return <LegalDocument docKey="refunds" backHref="/legal" />;
}
