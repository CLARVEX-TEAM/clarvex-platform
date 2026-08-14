import { redirect } from "next/navigation";

/** Compatibilidad para favoritos antiguos del escritorio gerencial. */
export default function LegacyDesktopDataCenterRedirect() {
  redirect("https://captura.adrianluna.mx/rr/app/captura-clarvex/ticket-electronico");
}
