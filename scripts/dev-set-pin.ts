/**
 * Pone un PIN nuevo en la base LOCAL de desarrollo.
 *
 * Existe porque la base local es una copia: su PIN puede ser viejo y aquí no
 * hay correo configurado, así que el flujo de «¿Olvidaste tu PIN?» no llega a
 * ninguna parte. Sin esto, una base copiada se queda sin forma de entrar.
 *
 * ⚠️ **Se niega a correr si `DATABASE_URL` no apunta a localhost.** Es un script
 * que reescribe credenciales: apuntado a producción cambiaría el PIN de una
 * persona real, y quien lo ejecuta suele estar mirando otra cosa.
 *
 * El PIN se teclea al vuelo y **no se hace eco**: así no queda en el historial
 * del terminal ni en una captura de pantalla.
 *
 *   pnpm exec tsx scripts/dev-set-pin.ts <numeroDeEmpleado>
 */

import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { hashPin } from "@/lib/security";

const empleado = process.argv[2];
if (!empleado) {
  console.error("Uso: pnpm exec tsx scripts/dev-set-pin.ts <numeroDeEmpleado>");
  process.exit(1);
}

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
  console.error("ABORTA: DATABASE_URL no apunta a localhost. Esto es solo para desarrollo.");
  process.exit(1);
}

/** Lee sin mostrar lo tecleado. */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const salida = process.stdout as NodeJS.WriteStream & { _write?: unknown };
    process.stdout.write(pregunta);

    // Se silencia el eco mientras dura la pregunta.
    const escribirOriginal = salida.write.bind(salida);
    (salida as { write: unknown }).write = () => true;

    rl.question("", (respuesta) => {
      (salida as { write: unknown }).write = escribirOriginal;
      process.stdout.write("\n");
      rl.close();
      resolve(respuesta.trim());
    });
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { employeeNumber: empleado },
      select: { name: true, storeId: true }
    });
    if (!user) {
      console.error(`No existe el empleado ${empleado} en la base local.`);
      process.exit(1);
    }

    console.log(`Empleado: ${user.name}`);
    const pin = await preguntarOculto("PIN nuevo (4 a 6 digitos, no se muestra): ");
    if (!/^\d{4,6}$/.test(pin)) {
      console.error("El PIN debe tener de 4 a 6 digitos.");
      process.exit(1);
    }

    await prisma.user.update({
      where: { employeeNumber: empleado },
      // Se limpia el candado a la vez: dejarlo puesto haria que el PIN nuevo
      // pareciera no funcionar, que es el peor fallo posible aqui.
      data: {
        pinHash: await hashPin(pin),
        failedPinAttempts: 0,
        pinLockedUntil: null,
        pinLockoutCount: 0
      }
    });

    console.log("Listo. PIN cambiado solo en la base local.");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
