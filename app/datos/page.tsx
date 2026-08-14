import { redirect } from "next/navigation";

/** Compatibilidad para enlaces antiguos: Centro de Datos fue retirado. */
export default function LegacyDataCenterRedirect() {
  redirect("https://captura.adrianluna.mx/rr/app/captura-clarvex/ticket-electronico");
}
