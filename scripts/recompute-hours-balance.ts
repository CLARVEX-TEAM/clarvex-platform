/**
 * Recalcula Attendance.minutesBalance con las reglas actuales de lib/hours-balance.
 *
 * Por qué hace falta: el saldo se guarda YA CALCULADO (para que el histórico no
 * cambie solo porque mañana se mueva el horario estándar de la tienda). Eso está
 * bien, pero significa que al corregir la fórmula los registros viejos se quedan
 * con el saldo viejo. La sincronización diaria no los arregla: la hoja APERTURA
 * se sobrescribe cada día y solo se resincroniza el día que ella declara.
 *
 * Se ejecuta a mano después de cambiar la fórmula:
 *
 *   pnpm exec tsx scripts/recompute-hours-balance.ts          # solo reporta
 *   pnpm exec tsx scripts/recompute-hours-balance.ts --apply  # escribe
 *
 * No inventa datos: solo recalcula a partir de lo que ya está guardado
 * (expectedAt, expectedLeaveAt, arrivedAt, leftAt, status).
 */

import { PrismaClient } from "@prisma/client";
import { dayBalanceMinutes, formatBalance } from "../lib/hours-balance";
import type { AttendanceStatus } from "../lib/attendance";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const records = await prisma.attendance.findMany({
    orderBy: { date: "asc" },
    include: { user: { select: { name: true } } }
  });

  const changes: Array<{ id: string; name: string; date: Date; from: number; to: number }> = [];

  for (const record of records) {
    const next = dayBalanceMinutes({
      status: record.status as AttendanceStatus,
      expectedEntry: record.expectedAt,
      expectedExit: record.expectedLeaveAt,
      arrivedAt: record.arrivedAt,
      leftAt: record.leftAt
    });
    if (next !== record.minutesBalance) {
      changes.push({ id: record.id, name: record.user.name, date: record.date, from: record.minutesBalance, to: next });
    }
  }

  console.log(`${records.length} registros revisados · ${changes.length} con saldo distinto\n`);
  for (const change of changes) {
    const day = change.date.toISOString().slice(0, 10);
    console.log(`  ${day}  ${change.name.padEnd(30)}  ${formatBalance(change.from)} → ${formatBalance(change.to)}`);
  }

  if (changes.length === 0) {
    console.log("\nNada que corregir.");
    return;
  }

  if (!apply) {
    console.log("\nEn seco. Vuelve a correrlo con --apply para escribir los cambios.");
    return;
  }

  for (const change of changes) {
    await prisma.attendance.update({ where: { id: change.id }, data: { minutesBalance: change.to } });
  }
  console.log(`\n${changes.length} registros actualizados.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
