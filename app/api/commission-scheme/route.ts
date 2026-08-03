import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  GUESS_BRACKETS,
  GUESS_ROLES,
  isGuessStore,
  schemeToRules,
  validateCapturedScheme,
  type CapturedScheme
} from "@/lib/guess-scheme";

export const dynamic = "force-dynamic";

/**
 * Captura del tabulador de comisiones de una tienda GUESS.
 *
 * En GUESS los importes cambian según la etiqueta de cada tienda (E, D, C…), y
 * central no publica una tabla única. Por eso el tabulador no viene precargado:
 * lo captura la propia gerencia desde la pantalla que aparece al entrar.
 *
 * Solo GERENTE y SUBGERENTE, y solo de SU tienda: `session.storeId` manda, no
 * llega por parámetro. Así nadie puede escribirle el tabulador a otra tienda.
 */

const bracketInput = z.object({
  minAchievement: z.number(),
  regular: z.number(),
  high: z.number().nullable().optional()
});

const schemeInput = z.object({
  // La etiqueta es texto libre corto: hoy son letras, pero si central cambia la
  // nomenclatura no queremos que la app rechace un valor válido.
  tier: z.string().trim().max(20).nullable().optional(),
  rows: z.array(z.object({
    role: z.enum(["GERENTE", "SUBGERENTE", "ASESOR"]),
    brackets: z.array(bracketInput)
  }))
});

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    select: { id: true, name: true, commissionTier: true }
  });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const isGuess = isGuessStore(store.name);

  // "Ya capturado" = existe al menos una regla de importe fijo activa. Es la
  // huella que solo deja este esquema: las reglas del esquema histórico son
  // todas de porcentaje.
  const rules = await prisma.commissionRule.findMany({
    where: { storeId: store.id, active: true },
    orderBy: [{ role: "asc" }, { minAchievement: "asc" }]
  });
  const captured = rules.some((rule) => rule.payoutType === "FIXED");

  return NextResponse.json({
    isGuess,
    storeName: store.name,
    tier: store.commissionTier,
    needsCapture: isGuess && !captured,
    captured,
    // Se devuelve lo que haya para poder REVISAR y corregir, no solo capturar.
    rules: rules.map((rule) => ({
      role: rule.role,
      minAchievement: Number(rule.minAchievement),
      payoutType: rule.payoutType,
      commissionPercent: Number(rule.commissionPercent),
      fixedAmount: rule.fixedAmount === null ? null : Number(rule.fixedAmount),
      fixedAmountHigh: rule.fixedAmountHigh === null ? null : Number(rule.fixedAmountHigh)
    }))
  });
}

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const demoBlocked = denyDemo(session);
  if (demoBlocked) return demoBlocked;

  const parsed = await parseJson(request, schemeInput);
  if ("response" in parsed) return parsed.response;

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    select: { id: true, name: true }
  });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  // El esquema es exclusivo de GUESS. Se comprueba en el servidor y no solo al
  // pintar la pantalla: si se aceptara para cualquier tienda, una llamada
  // directa podría cambiarle el modelo de pago a una marca que no lo usa.
  if (!isGuessStore(store.name)) {
    return NextResponse.json(
      { error: "Este esquema de comisiones es exclusivo de las tiendas GUESS." },
      { status: 409 }
    );
  }

  const scheme = parsed.data as CapturedScheme;
  const issues = validateCapturedScheme(scheme);
  if (issues.length > 0) {
    return NextResponse.json({ error: "Hay datos incompletos o fuera de rango.", issues }, { status: 400 });
  }

  const rules = schemeToRules(scheme, store.id);

  await prisma.$transaction(async (tx) => {
    // Las reglas anteriores se DESACTIVAN, no se borran: si más adelante hay que
    // auditar una comisión pagada con el esquema viejo, la fila sigue ahí.
    await tx.commissionRule.updateMany({
      where: { storeId: store.id, active: true },
      data: { active: false }
    });
    await tx.commissionRule.createMany({ data: rules });
    if (scheme.tier !== undefined) {
      await tx.store.update({ where: { id: store.id }, data: { commissionTier: scheme.tier || null } });
    }
  });

  await recordAudit({
    session,
    action: "commission.scheme",
    entity: "Store",
    entityId: store.id,
    storeId: store.id,
    storeName: store.name,
    detail: `Capturó el tabulador GUESS${scheme.tier ? ` (etiqueta ${scheme.tier})` : ""}: ${rules.length} reglas en ${GUESS_ROLES.length} puestos y ${GUESS_BRACKETS.length} escalones.`
  });

  return NextResponse.json({ ok: true, rules: rules.length });
}
