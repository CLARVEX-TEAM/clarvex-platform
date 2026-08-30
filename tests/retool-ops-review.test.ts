import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessReview, buildAssistantBrief, type OpsAccessUserInput } from "../lib/retool-ops-review";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function user(overrides: Partial<OpsAccessUserInput>): OpsAccessUserInput {
  return {
    id: "user-1",
    name: "Usuario Prueba",
    email: "usuario@clarvex.local",
    employeeNumber: "100",
    role: "ASESOR",
    active: true,
    platformAdmin: false,
    checklistOnly: false,
    isDemo: false,
    biometricEnabled: true,
    lastLoginAt: new Date("2026-08-29T12:00:00.000Z"),
    lastSeenAt: new Date("2026-08-29T12:00:00.000Z"),
    store: { id: "store-1", name: "TH SAN AGUSTIN" },
    ...overrides
  };
}

test("detecta riesgos de permisos sin depender de texto JSON", () => {
  const review = buildAccessReview([
    user({
      id: "adrian",
      name: "Adrian",
      email: "adrian@example.com",
      employeeNumber: "102259",
      role: "ADMIN",
      platformAdmin: true
    }),
    user({
      id: "gerencia",
      name: "Gerencia sin login",
      email: "gerencia@clarvex.local",
      employeeNumber: "200",
      role: "GERENTE",
      lastLoginAt: new Date("2026-07-01T12:00:00.000Z")
    }),
    user({
      id: "baja",
      name: "Baja con correo",
      email: "baja@example.com",
      employeeNumber: "300",
      active: false
    })
  ], NOW);

  assert.equal(review.summary.totalUsers, 3);
  assert.equal(review.summary.platformAdmins, 1);
  assert.equal(review.summary.activeUsersWithoutRealEmail, 1);
  assert.equal(review.summary.inactiveUsersWithRealEmail, 1);
  assert.equal(review.summary.managersWithoutRecentLogin, 1);
  assert.deepEqual(
    review.users.find((row) => row.id === "gerencia")?.riskFlags,
    ["correo-inventado", "gerencia-sin-login-reciente"]
  );
  assert.deepEqual(
    review.findings.map((finding) => finding.severity),
    ["critical", "warning", "warning", "info"]
  );
});

test("arma un brief deterministico para Retool Agents sin mutaciones automaticas", () => {
  const accessReview = buildAccessReview([
    user({ id: "admin", email: "admin@example.com", platformAdmin: true })
  ], NOW);
  const brief = buildAssistantBrief({
    generatedAt: NOW,
    staleStores: [{ name: "GUESS GALERIAS", captureStatus: "stale", daysSinceKpi: 4 }],
    draftWeeklyCloses: 2,
    highPriorityPendings: 1,
    syncErrors: [{ storeName: "TH SAN AGUSTIN", sourceType: "KPIS", message: "fallo" }],
    accessFindings: accessReview.findings
  });

  assert.equal(brief.mode, "deterministic-brief");
  assert.equal(brief.generatedAt, NOW.toISOString());
  assert.equal(brief.findings[0]?.severity, "critical");
  assert.ok(brief.findings.some((finding) => finding.title === "Captura atrasada"));
  assert.ok(brief.guardrails.some((guardrail) => guardrail.includes("No ejecutar mutaciones")));
});
