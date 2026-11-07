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
import { tarjetaCampana } from "@/lib/whatsapp-tarjeta";
(async () => {
  // Semana 44 de San Agustín tal cual: metas reales y nada juntado todavía.
  const metas44 = [43, 22, 22, 22, 22, 33, 54];
  const nombres = ["JESUS ADRIAN HERNANDEZ LUNA", "WAIRA ZITLALI POPOCA", "ALONSO TREVIÑO", "ITZEL SAIDY REYES BAUTISTA", "JAZMIN CASTRO ZUÑIGA"];
  writeFileSync(`${S}/tarjeta-campana.png`, await tarjetaCampana({ tienda: "TH San Agustín", semana: 44, totalSemana: 0, metaSemana: 218, totalCampana: 0, proximaMeta: 292,
    dias: metas44.map((m, i) => ({ fecha: d(i - 7), meta: m, total: 0, capturado: false })),
    ranking: nombres.map((nombre) => ({ nombre, total: 0, donativos: 0 })) }));
  // Y una semana con donativos, para ver el ranking.
  writeFileSync(`${S}/tarjeta-campana-ranking.png`, await tarjetaCampana({ tienda: "TH San Agustín", semana: 45, totalSemana: 138, metaSemana: 292, totalCampana: 138,
    dias: [43, 22, 22, 43, 43, 54, 65].map((m, i) => ({ fecha: d(i), meta: m, total: [50, 18, 30, 40, 0, 0, 0][i], capturado: i < 4 })),
    ranking: [[nombres[0], 52], [nombres[1], 38], [nombres[2], 26], [nombres[3], 22], [nombres[4], 0]].map(([nombre, total]) => ({ nombre: String(nombre), total: Number(total), donativos: 0 })) }));
  console.log("campaña ok");
})();
