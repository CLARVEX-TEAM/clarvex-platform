/**
 * Dibuja los reconocimientos de Tailored Help con datos de ejemplo:
 *
 *   npx tsx scripts/vista-reconocimientos.tsx <carpeta-de-salida>
 */
import React from "react";
import { writeFileSync } from "node:fs";
import { tarjetaReconocimiento } from "@/lib/whatsapp-reconocimiento";
void React;
const S = process.argv[2];
const T = "TH San Agustín";
(async () => {
  writeFileSync(`${S}/reco-primero.png`, await tarjetaReconocimiento({ tipo: "primero", nombre: "ALONSO TREVIÑO", tienda: T, monto: 25, donativos: 1, cuando: "Sábado 7 de noviembre" }));
  writeFileSync(`${S}/reco-dia.png`, await tarjetaReconocimiento({ tipo: "dia", nombre: "JAZMIN CASTRO ZUÑIGA", tienda: T, monto: 175, donativos: 6, cuando: "Domingo 8 de noviembre" }));
  writeFileSync(`${S}/reco-mvp.png`, await tarjetaReconocimiento({ tipo: "mvp", nombre: "WAIRA ZITLALI POPOCA", tienda: T, monto: 320, donativos: 11, cuando: "Semana 45" }));
  writeFileSync(`${S}/reco-adrian.png`, await tarjetaReconocimiento({ tipo: "dia", nombre: "JESUS ADRIAN HERNANDEZ LUNA", tienda: T, monto: 150, donativos: 4, cuando: "Lunes 9 de noviembre" }));
  writeFileSync(`${S}/reco-sinfoto.png`, await tarjetaReconocimiento({ tipo: "mvp", nombre: "ITZEL SAIDY REYES BAUTISTA", tienda: T, monto: 210, donativos: 7, cuando: "Semana 45" }));
  console.log("ok");
})();
