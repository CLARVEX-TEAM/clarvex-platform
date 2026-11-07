/**
 * Dibuja las dos tarjetas de WhatsApp con datos inventados, para revisar el
 * diseño sin mandar nada a nadie:
 *
 *   npx tsx scripts/vista-tarjetas-whatsapp.tsx <carpeta-de-salida>
 */
import { writeFileSync } from "node:fs";
import { tarjetaMetas, tarjetaCierre } from "@/lib/whatsapp-tarjeta";
const S = process.argv[2];
const d = (n: number) => new Date(Date.UTC(2026, 10, 8 + n));
const metas = [9154.76, 6210, 0, 6210, 7350, 9800, 12450];
(async () => {
  writeFileSync(`${S}/tarjeta-metas.png`, await tarjetaMetas({ nombre: "ALONSO TREVIÑO", tienda: "TH San Agustín", semana: 46, inicio: d(0), fin: d(6), actualizacion: false,
    dias: metas.map((m, i) => ({ fecha: d(i), meta: m, descansa: i === 2 })) }));
  const ventas = [10320, 5100, 0, 6900, 8010, 7020, 15400];
  writeFileSync(`${S}/tarjeta-cierre.png`, await tarjetaCierre({ nombre: "ALONSO TREVIÑO", tienda: "TH San Agustín", semana: 45, inicio: d(-7), fin: d(-1), ventaAnterior: 48200,
    dias: metas.map((m, i) => ({ fecha: d(i - 7), meta: m, venta: ventas[i], descansa: i === 2, capturado: true })) }));
  console.log("ok");
})();
import { tarjetaHorarios } from "@/lib/whatsapp-tarjeta";
(async () => {
  const st = ["WORKING", "WORKING", "OFF", "WORKING", "INVENTORY", "WORKING", "VACATION"];
  writeFileSync(`${S}/tarjeta-horarios.png`, await tarjetaHorarios({ nombre: "ALONSO TREVIÑO", tienda: "TH San Agustín", semana: 45, inicio: d(0), fin: d(6), actualizacion: false,
    dias: st.map((s, i) => ({ fecha: d(i), status: s, inicio: i === 1 ? "13:00" : "10:30", fin: i === 1 ? "21:00" : "19:00" })) }));
  console.log("horarios ok");
})();
