import { hasRealEmail } from "@/lib/email";

export type OpsFindingSeverity = "critical" | "warning" | "info";

export type OpsFinding = {
  severity: OpsFindingSeverity;
  title: string;
  detail: string;
  recommendation: string;
  count?: number;
};

export type OpsAccessUserInput = {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  role: string;
  active: boolean;
  platformAdmin: boolean;
  checklistOnly: boolean;
  isDemo: boolean;
  biometricEnabled: boolean;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  store: { id: string; name: string };
};

export type OpsAccessUser = {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  role: string;
  storeId: string;
  storeName: string;
  active: boolean;
  platformAdmin: boolean;
  checklistOnly: boolean;
  isDemo: boolean;
  biometricEnabled: boolean;
  hasRealEmail: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  daysSinceLogin: number | null;
  daysSinceSeen: number | null;
  riskFlags: string[];
};

export type OpsAccessReview = {
  summary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    activeManagers: number;
    platformAdmins: number;
    checklistOnlyUsers: number;
    demoUsers: number;
    activeUsersWithoutRealEmail: number;
    inactiveUsersWithRealEmail: number;
    managersWithoutRecentLogin: number;
  };
  findings: OpsFinding[];
  users: OpsAccessUser[];
};

export type OpsAssistantBrief = {
  mode: "deterministic-brief";
  generatedAt: string;
  findings: OpsFinding[];
  guardrails: string[];
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function daysSince(value: Date | null, now: Date): number | null {
  if (!value) return null;
  return Math.floor((now.getTime() - value.getTime()) / 86_400_000);
}

function sortFindings(left: OpsFinding, right: OpsFinding): number {
  const rank: Record<OpsFindingSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title, "es");
}

export function buildAccessReview(users: OpsAccessUserInput[], now = new Date()): OpsAccessReview {
  const rows = users.map((user): OpsAccessUser => {
    const realEmail = hasRealEmail(user.email);
    const loginDays = daysSince(user.lastLoginAt, now);
    const seenDays = daysSince(user.lastSeenAt, now);
    const riskFlags: string[] = [];

    if (user.active && !realEmail) riskFlags.push("correo-inventado");
    if (user.platformAdmin) riskFlags.push("admin-plataforma");
    if (user.checklistOnly) riskFlags.push("kiosko");
    if (user.isDemo) riskFlags.push("demo");
    if (!user.active && realEmail) riskFlags.push("baja-con-correo-real");
    if (user.active && ["GERENTE", "SUBGERENTE"].includes(user.role) && (loginDays === null || loginDays > 30)) {
      riskFlags.push("gerencia-sin-login-reciente");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      employeeNumber: user.employeeNumber,
      role: user.role,
      storeId: user.store.id,
      storeName: user.store.name,
      active: user.active,
      platformAdmin: user.platformAdmin,
      checklistOnly: user.checklistOnly,
      isDemo: user.isDemo,
      biometricEnabled: user.biometricEnabled,
      hasRealEmail: realEmail,
      lastLoginAt: iso(user.lastLoginAt),
      lastSeenAt: iso(user.lastSeenAt),
      daysSinceLogin: loginDays,
      daysSinceSeen: seenDays,
      riskFlags
    };
  });

  const activeUsers = rows.filter((user) => user.active);
  const inactiveUsers = rows.filter((user) => !user.active);
  const activeManagers = activeUsers.filter((user) => ["GERENTE", "SUBGERENTE"].includes(user.role));
  const platformAdmins = activeUsers.filter((user) => user.platformAdmin);
  const activeUsersWithoutRealEmail = activeUsers.filter((user) => !user.hasRealEmail);
  const inactiveUsersWithRealEmail = inactiveUsers.filter((user) => user.hasRealEmail);
  const managersWithoutRecentLogin = activeManagers.filter(
    (user) => user.daysSinceLogin === null || user.daysSinceLogin > 30
  );

  const findings: OpsFinding[] = [];
  if (platformAdmins.length > 0) {
    findings.push({
      severity: "critical",
      title: "Administradores de plataforma activos",
      detail: `${platformAdmins.length} usuario(s) activo(s) tienen platformAdmin=true.`,
      recommendation: "Revisar que solo Adrian conserve acceso de plataforma y que cada alta tenga motivo.",
      count: platformAdmins.length
    });
  }
  if (activeUsersWithoutRealEmail.length > 0) {
    findings.push({
      severity: "warning",
      title: "Usuarios activos sin correo real",
      detail: `${activeUsersWithoutRealEmail.length} usuario(s) activo(s) usan correo inventado.`,
      recommendation: "Pedir correo real antes de moverlos a Slack, Retool o recuperacion automatica de PIN.",
      count: activeUsersWithoutRealEmail.length
    });
  }
  if (inactiveUsersWithRealEmail.length > 0) {
    findings.push({
      severity: "warning",
      title: "Bajas que pueden requerir limpieza externa",
      detail: `${inactiveUsersWithRealEmail.length} usuario(s) inactivo(s) conservan correo real.`,
      recommendation: "Confirmar baja en Retool, Slack y cualquier acceso externo asociado a ese correo.",
      count: inactiveUsersWithRealEmail.length
    });
  }
  if (managersWithoutRecentLogin.length > 0) {
    findings.push({
      severity: "info",
      title: "Gerencia sin login reciente",
      detail: `${managersWithoutRecentLogin.length} gerente/subgerente activo(s) no han iniciado sesion en mas de 30 dias o nunca lo hicieron.`,
      recommendation: "Validar si siguen operando la tienda o si deben desactivarse.",
      count: managersWithoutRecentLogin.length
    });
  }

  return {
    summary: {
      totalUsers: rows.length,
      activeUsers: activeUsers.length,
      inactiveUsers: inactiveUsers.length,
      activeManagers: activeManagers.length,
      platformAdmins: platformAdmins.length,
      checklistOnlyUsers: activeUsers.filter((user) => user.checklistOnly).length,
      demoUsers: activeUsers.filter((user) => user.isDemo).length,
      activeUsersWithoutRealEmail: activeUsersWithoutRealEmail.length,
      inactiveUsersWithRealEmail: inactiveUsersWithRealEmail.length,
      managersWithoutRecentLogin: managersWithoutRecentLogin.length
    },
    findings: findings.sort(sortFindings),
    users: rows.sort((left, right) =>
      left.storeName.localeCompare(right.storeName, "es")
      || Number(right.active) - Number(left.active)
      || left.role.localeCompare(right.role, "es")
      || left.name.localeCompare(right.name, "es")
    )
  };
}

export function buildAssistantBrief(input: {
  generatedAt?: Date;
  staleStores: Array<{ name: string; captureStatus: string; daysSinceKpi: number | null }>;
  draftWeeklyCloses: number;
  highPriorityPendings: number;
  syncErrors: Array<{ storeName: string; sourceType: string; message: string }>;
  accessFindings: OpsFinding[];
}): OpsAssistantBrief {
  const findings: OpsFinding[] = [];

  if (input.staleStores.length > 0) {
    findings.push({
      severity: "critical",
      title: "Captura atrasada",
      detail: input.staleStores
        .map((store) => `${store.name}: ${store.captureStatus}${store.daysSinceKpi === null ? "" : ` (${store.daysSinceKpi} dias)`}`)
        .join("; "),
      recommendation: "Abrir hilo operativo y pedir captura pendiente antes del cierre del dia.",
      count: input.staleStores.length
    });
  }
  if (input.draftWeeklyCloses > 0) {
    findings.push({
      severity: "warning",
      title: "Cierres semanales en borrador",
      detail: `${input.draftWeeklyCloses} cierre(s) semanal(es) vencidos siguen como DRAFT.`,
      recommendation: "Revisar Cuota Justa/RDS y cerrar o corregir el periodo.",
      count: input.draftWeeklyCloses
    });
  }
  if (input.highPriorityPendings > 0) {
    findings.push({
      severity: "warning",
      title: "Pendientes altos abiertos",
      detail: `${input.highPriorityPendings} pendiente(s) de prioridad alta o critica siguen abiertos.`,
      recommendation: "Asignar responsable y fecha limite desde Clarvex.",
      count: input.highPriorityPendings
    });
  }
  if (input.syncErrors.length > 0) {
    findings.push({
      severity: "info",
      title: "Errores historicos de sincronizacion",
      detail: input.syncErrors.slice(0, 3).map((entry) => `${entry.storeName}/${entry.sourceType}`).join(", "),
      recommendation: "Mantenerlos como contexto historico; no reactivar Excel sin validar el reemplazo en Retool.",
      count: input.syncErrors.length
    });
  }

  return {
    mode: "deterministic-brief",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    findings: [...findings, ...input.accessFindings].sort(sortFindings),
    guardrails: [
      "No ejecutar mutaciones automaticamente.",
      "Pedir confirmacion humana para bajas, cambios de rol o ajustes de kardex.",
      "Usar estos hallazgos como contexto para Retool Agents o Slack, no como fuente para saltarse permisos."
    ]
  };
}
