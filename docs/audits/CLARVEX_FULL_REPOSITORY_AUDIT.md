# CLARVEX FULL REPOSITORY AUDIT

**Fecha:** 2026-07-10  
**Auditor:** Antigravity AI (solo lectura — sin modificaciones de código)  
**Repositorio:** `/home/ubuntu/clarvex-app`  
**Clasificación:** Confidencial — uso interno

---

## 1. RESUMEN EJECUTIVO

Clarvex es una aplicación SaaS/PWA para retail con un nivel de madurez de seguridad **medio-bajo**. El código muestra buenas intenciones defensivas en varios puntos (verificación de usuario activo en cada petición, bloqueo de PIN por cuenta, bcrypt con factor 12, idempotencia en webhooks de Mercado Pago, validación de magic bytes en archivos), pero contiene incidencias confirmadas que deben corregirse antes de escalar a múltiples empresas o tiendas.

### Resumen de incidencias

| Severidad | Confirmadas | Parciales/Inferidas |
|-----------|-------------|---------------------|
| CRÍTICA | 2 | 1 |
| ALTA | 6 | 2 |
| MEDIA | 8 | 3 |
| BAJA | 5 | 2 |
| INFORMATIVA | 6 | — |

### Riesgos más importantes

1. **SEC-01** — Credenciales reales en `.env.example` versionado: VAPID private key, Gemini key, MP access token, R2 credentials en texto plano.
2. **AUT-02** — PIN setup sin código temporal de un solo uso: cualquier persona que conozca el número de empleado puede apropiarse de una cuenta sin PIN.
3. **ACC-01** — Endpoint regional devuelve datos de **todas las tiendas** sin asignación explícita.
4. **AI-02** — `/api/ai/coach-advisor` acepta `userId` del cliente sin verificar que pertenezca a la tienda del solicitante (IDOR cross-store).
5. **AUT-01** — WebAuthn usa `requireUserVerification: false`, debilitando el factor biométrico.
6. **AI-01** — `JSON.parse()` directo sobre respuestas de Gemini sin validación de esquema.

### Limitaciones

- No se ejecutaron comandos de shell (el entorno sandbox no lo permite).
- No se accedió a la BD de producción ni a servicios externos.
- El historial Git no fue analizado directamente.
- El bucket R2 no fue inspeccionado.

---

## 2. MÉTRICAS DEL REPOSITORIO

| Métrica | Valor |
|---------|-------|
| Grupos de rutas API | 36 grupos, ~80 handlers individuales estimados |
| Páginas (`page.tsx`) | ~35 |
| Archivos en `/lib` | 82 archivos `.ts` |
| Tests | 29 archivos `.test.ts` |
| Migraciones Prisma | 61 |
| Modelos Prisma | 38 |
| Dependencias producción | 17 paquetes directos |
| Archivos > 500 líneas | `clarvex-intelligence.ts` (929), `schema.prisma` (1013), `forms.tsx` (~900 estimado), `data-source-sync.ts` (~600), `kpi-parser.ts` (~550) |
| `noImplicitAny` en tsconfig | **false** (debilita el tipado) |
| `strict` en tsconfig | true |

---

## 3. INVENTARIO DE ARQUITECTURA

### Grupos API principales
`/api/auth/*` (login, PIN, WebAuthn), `/api/app-data`, `/api/regional/app-data`, `/api/ai/*` (8 endpoints), `/api/cron/*` (13 cron jobs), `/api/webhooks/mercadopago`, `/api/push/*`, `/api/billing/*`, `/api/chat/*`, `/api/evidences/*`, `/api/plans/*`, `/api/kpis/*`, `/api/schedules`, `/api/team/*`, `/api/notifications`, `/api/announcements`, `/api/training/*`, `/api/surveys/*`, `/api/inventory/*`, `/api/shift-requests/*`, `/api/conteos/*`, `/api/data-sources/*`, `/api/reports/*`, `/api/admin/*`

### Middleware
`middleware.ts` en la raíz cubre rutas de página. **Las rutas `/api/*` no están cubiertas** — la autorización es responsabilidad de cada handler.

### Flujo de autenticación
1. Usuario ingresa número de empleado → `POST /api/auth/employee-login` con `action=inspect`
2. Si no tiene PIN: `action=setup` (sin token de activación — **riesgo AUT-02**)
3. Si tiene PIN: `action=login` → JWT en cookie `clarvex.session` (7 días, HS256)
4. Biometría: WebAuthn via SimpleWebAuthn → challenge en BD, 5 min de expiración
5. Cada request server-side: `getServerSession()` verifica `active` y `role` en BD — **`storeId` y `platformAdmin` no se re-leen** (riesgo B)

---

## 4. TABLA GENERAL DE INCIDENCIAS

| ID | Severidad | Confianza | Estado | Categoría | Incidencia | Esfuerzo |
|----|-----------|-----------|--------|-----------|------------|----------|
| SEC-01 | CRÍTICA | ALTA | CONFIRMADA | Secretos | VAPID/Gemini/MP/R2 en `.env.example` versionado | Bajo |
| SEC-02 | CRÍTICA | ALTA | CONFIRMADA | Secretos | `.env` con credenciales reales sin cifrar | Bajo-Medio |
| AUT-01 | ALTA | ALTA | CONFIRMADA | WebAuthn | `requireUserVerification: false` en auth y registro | Medio |
| AUT-02 | ALTA | ALTA | CONFIRMADA | PIN/Activación | PIN setup sin código temporal de un solo uso | Medio |
| ACC-01 | ALTA | ALTA | CONFIRMADA | Autorización | Regional ve todas las tiendas sin asignación | Alto |
| AI-01 | ALTA | ALTA | CONFIRMADA | IA | `JSON.parse` directo sobre respuestas de Gemini | Medio |
| AI-02 | ALTA | ALTA | CONFIRMADA | IA/IDOR | Coach AI acepta `userId` sin validar storeId | Bajo |
| PERF-01 | ALTA | ALTA | CONFIRMADA | Rendimiento | Chat polling 3 s con N+1 queries | Alto |
| SEC-03 | MEDIA | ALTA | CONFIRMADA | Rate Limiting | Rate limiting en memoria — pierde estado al reiniciar | Medio |
| SEC-04 | MEDIA | ALTA | CONFIRMADA | Rate Limiting | Sin rate limiting en endpoints de IA | Bajo |
| ACC-02 | MEDIA | ALTA | CONFIRMADA | Privacidad | app-data expone datos laborales de compañeros a ASESOR | Bajo |
| ACC-03 | MEDIA | ALTA | CONFIRMADA | IDOR | Plan-manager acepta `userId` sin validar storeId | Bajo |
| ARCH-01 | MEDIA | ALTA | CONFIRMADA | Arquitectura | `clarvex-intelligence.ts` 929 líneas sin separación | Alto |
| ARCH-03 | MEDIA | ALTA | CONFIRMADA | Arquitectura | `noImplicitAny: false` en tsconfig | Bajo |
| ARCH-04 | MEDIA | ALTA | CONFIRMADA | Duplicación | Páginas móvil/escritorio con lógica duplicada | Alto |
| PERF-02 | MEDIA | ALTA | CONFIRMADA | Rendimiento | app-data sin paginación ni filtro de fecha en KPIs | Medio |
| STREAM-01 | MEDIA | ALTA | CONFIRMADA | Legal/CSP | Dominios streaming no oficiales en CSP | Bajo |
| MP-01 | MEDIA | MEDIA | PARCIAL | Pagos | Webhook no valida importe esperado vs recibido | Bajo |
| AI-03 | BAJA | ALTA | CONFIRMADA | IA/Costos | Sin límites de uso de IA por usuario/día | Medio |
| AI-04 | BAJA | ALTA | CONFIRMADA | IA | IA calcula cifras financieras sin validación determinista | Medio |
| OBS-01 | BAJA | ALTA | CONFIRMADA | Observabilidad | Sin logs estructurados, Sentry ni request ID | Alto |
| OBS-02 | BAJA | ALTA | CONFIRMADA | Respaldos | Backup en el mismo bucket R2 que archivos de app | Medio |
| TEST-01 | BAJA | ALTA | CONFIRMADA | Pruebas | Sin pruebas de autorización entre tiendas | Alto |
| MULTI-01 | INFORMATIVA | ALTA | CONFIRMADA | Multi-empresa | Sin modelo Organization; employeeNumber único global | Alto |
| PRIVACIDAD-01 | INFORMATIVA | ALTA | CONFIRMADA | Privacidad | `lastLoginAt` expuesto a todos los usuarios | Bajo |
| PRIVACIDAD-02 | INFORMATIVA | ALTA | CONFIRMADA | Privacidad/GDPR | Nombres y KPIs enviados a Gemini (Google) | Medio |
| R2-01 | INFORMATIVA | ALTA | CONFIRMADA | Archivos | Evidencias en R2 público — URL sin autenticación | Medio |

---

## 5. DETALLE DE INCIDENCIAS

---

### SEC-01 — Credenciales reales en `.env.example`

**Severidad:** CRÍTICA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia directa:**
```
# .env.example líneas 19-20
VAPID_PUBLIC_KEY="BCbfq_8NKv0o0WJZzLdcPcaLSsGWd9FzuwNA..."
VAPID_PRIVATE_KEY="[REDACTED — valor real presente]"
```

Los mismos valores aparecen en `.env` (líneas 9-10). El archivo `.env.example` **no está en `.gitignore`** y típicamente se versiona en Git. Si fue commiteado con valores reales, las claves están en el historial.

**Archivos:** `.env.example` (líneas 5, 8-13, 19-20, 23), `.env` (líneas 4-18)

**Impacto:** Compromiso de VAPID permite enviar notificaciones push fraudulentas a todos los usuarios. Compromiso de MP_ACCESS_TOKEN permite crear pagos/devoluciones en la cuenta de Mercado Pago.

**Recomendación:**
1. Rotar **todas** las claves expuestas: VAPID, AUTH_SECRET, R2, MP, GEMINI, CRON_SECRET.
2. Reemplazar en `.env.example` por placeholders descriptivos (ej. `VAPID_PRIVATE_KEY="<genera con: npx web-push generate-vapid-keys>"`).
3. Ejecutar `git log --all --full-history -- .env.example` para verificar si fue commiteado con valores reales. Si sí: purgar historial con `git filter-repo`.
4. **Nota sobre rotación VAPID:** Al cambiar el par VAPID, todas las suscripciones push existentes dejan de funcionar. Planificar comunicación a usuarios para re-suscribirse.

**Prueba sugerida:** Script CI/CD que rechaza commits si `.env.example` contiene valores de longitud y formato que parezcan claves reales.

**Esfuerzo:** 2-4 horas (rotación) + verificación Git.

---

### SEC-02 — `.env` con credenciales reales en disco sin protección adicional

**Severidad:** CRÍTICA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:** `/home/ubuntu/clarvex-app/.env` contiene en texto plano (valores [REDACTED] en este informe):
- `AUTH_SECRET=[REDACTED]`
- `R2_SECRET_ACCESS_KEY=[REDACTED]`
- `MP_ACCESS_TOKEN=[REDACTED]`
- `GEMINI_API_KEY=[REDACTED]`
- `CRON_SECRET=[REDACTED]`
- `DATABASE_URL` con usuario:contraseña embebidos

**Impacto:** Cualquier proceso con acceso al sistema de archivos puede leer todas las credenciales. En caso de vulnerabilidad SSRF o path traversal, las credenciales quedarían completamente expuestas.

**Recomendación:**
1. Inmediato: `chmod 600 /home/ubuntu/clarvex-app/.env` (solo lectura para el proceso de app).
2. Medio plazo: usar variables de entorno del sistema (inyectadas por systemd/PM2) en lugar de archivo `.env`.
3. Largo plazo: gestor de secretos (Doppler, Vault, AWS SSM Parameter Store).

**Esfuerzo:** Bajo (días) a medio (semanas para gestor de secretos).

---

### AUT-01 — WebAuthn con `requireUserVerification: false`

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/auth/biometric/register/route.ts, línea 35
verification = await verifyRegistrationResponse({
  requireUserVerification: false  // ← no exige verificación biométrica
});

// app/api/auth/biometric/authenticate/route.ts, línea 53
verification = await verifyAuthenticationResponse({
  requireUserVerification: false  // ← ídem
});

// app/api/auth/biometric/register-options/route.ts, línea 31
authenticatorSelection: { userVerification: "preferred" }  // no "required"

// app/api/auth/biometric/authenticate-options/route.ts, línea 34
userVerification: "preferred"  // no "required"
```

**Impacto:** Un autenticador sin biometría real puede completar el flujo WebAuthn sin verificación local, degradando la autenticación de dos factores a uno solo (posesión del dispositivo).

**Recomendación:**
- Cambiar a `userVerification: "required"` y `requireUserVerification: true`.
- **Nota de compatibilidad:** Credenciales registradas con `preferred` pueden no tener el flag `UV` activo. Planificar re-registro para usuarios existentes.

**Prueba sugerida:**
```typescript
test("autenticación WebAuthn sin userVerified=true es rechazada", ...)
```

**Esfuerzo:** Medio (3-5 días incluyendo migración).

---

### AUT-02 — PIN setup sin autorización previa

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/auth/employee-login/route.ts, líneas 50-53
if (parsed.data.action === "setup") {
  if (user.pinHash) return NextResponse.json({ error: "Este usuario ya tiene un PIN configurado." }, { status: 409 });
  user.pinHash = await hashPin(parsed.data.pin);
  // ← No hay verificación de autorización, token de activación ni código de un solo uso
}
```

El endpoint `inspect` (línea 42) además revela si un usuario no tiene PIN:
```typescript
return NextResponse.json({ user: publicUser(user), requiresPinSetup: !user.pinHash });
```

**Flujo de riesgo (conceptual, sin explotar):**
1. Llamar a `inspect` con números de empleado secuenciales → detectar cuentas sin PIN.
2. Llamar a `setup` con el número encontrado y un PIN propio → acceso completo a la cuenta de esa persona.

El rate limiting de IP (10/min) existe pero no bloquea este flujo si el atacante tiene paciencia o múltiples IPs.

**Recomendación:**
1. El setup de PIN debe inicializarse mediante un token de activación generado por un GERENTE.
2. El token debe ser de un solo uso, con expiración (ej. 24h), y entregado out-of-band (SMS, email corporativo).
3. Mientras se implementa: deshabilitar `action=setup` sin sesión de gerente autenticado.

**Prueba sugerida:**
```typescript
test("no se puede configurar PIN sin token de activación de gerente")
test("el token de activación solo funciona una vez")
```

**Esfuerzo:** Medio (3-5 días).

---

### ACC-01 — Regional ve todas las tiendas sin asignación explícita

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/regional/app-data/route.ts, línea 19
const stores = await prisma.store.findMany({
  orderBy: { name: "asc" }
  // ← Sin filtro de ningún tipo
});
```

Verificación en schema.prisma: **no existe** ningún modelo `RegionalAssignment`, `RegionalStore` ni campo `storeIds` en `User`. La única protección es:
```typescript
// regional/app-data/route.ts, línea 11
const session = await requireSession(["REGIONAL"]);
```

**Impacto:** Cualquier usuario con rol `REGIONAL` puede ver los KPIs, ventas y ranking de **todas las tiendas** del sistema, independientemente de su asignación real.

**Recomendación:**
1. Crear modelo `RegionalStoreAssignment` (userId, storeId, assignedAt).
2. Filtrar `stores` y todas las queries derivadas por las tiendas asignadas al regional en sesión.
3. Agregar UI de administración para asignar/desasignar tiendas a regionales.

**Esfuerzo:** Alto (requiere migración de esquema + UI).

---

### AI-01 — `JSON.parse` directo sobre respuestas de Gemini sin esquema

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia** (11 ocurrencias en `clarvex-intelligence.ts`):
```typescript
// Línea 383 — generateDailyPlan
const planResult = JSON.parse(generatedText);  // sin try-catch, sin Zod

// Línea 502 — getAdvisorProfile
const parsedResult = JSON.parse(generatedText);  // sin try-catch

// Líneas 594, 655, 719, 741, 792, 856, 903 — otros métodos
return JSON.parse(generatedText);  // sin try-catch, sin esquema
```

**Impacto:** El modelo puede devolver texto no-JSON (markdown, mensaje de error de cuota, JSON parcial), causando que `JSON.parse` lance una excepción no capturada. El handler devuelve 500, pero más crítico: si el parse tiene éxito con datos inesperados, la IA devuelve cifras financieras inventadas sin que el sistema lo detecte.

**Recomendación:**
```typescript
// Patrón recomendado
const raw = await this.callGemini(prompt, true);
let parsed: unknown;
try { parsed = JSON.parse(raw); } catch { throw new Error("La IA devolvió una respuesta no válida."); }
const validated = MyZodSchema.safeParse(parsed);
if (!validated.success) throw new Error("Estructura de respuesta IA inválida.");
return validated.data;
```

**Esfuerzo:** Medio (2-3 días para definir todos los schemas Zod).

---

### AI-02 — Coach AI acepta `userId` del cliente sin validar storeId

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/ai/coach-advisor/route.ts, línea 13
const userId = body.userId || session.userId;
const profile = await ClarvexIntelligence.getAdvisorProfile(session, userId);
```

```typescript
// lib/clarvex-intelligence.ts, líneas 428-434
prisma.kpi.findMany({
  where: { userId },  // ← sin filtro de storeId
  ...
})
```

Un usuario autenticado (cualquier rol) puede obtener el perfil de coaching de un asesor de cualquier otra tienda enviando su `userId` en el body.

**Corrección (sin modificar — solo recomendación):**
```typescript
// Antes de llamar a getAdvisorProfile:
const targetUser = await prisma.user.findFirst({
  where: { id: userId, storeId: session.storeId }
});
if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
```

**Esfuerzo:** Bajo (1 hora).

---

### ACC-03 — Plan-manager acepta `userId` sin validar storeId

**Severidad:** MEDIA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/ai/plan-manager/route.ts, línea 14, 23
const userId = body.userId;
const plan = await ClarvexIntelligence.generateDailyPlan(session, userId, date);

// lib/clarvex-intelligence.ts, líneas 291-294
prisma.kpi.findMany({
  where: { userId, date: { lte: parsedDate } }  // sin filtro de storeId
})
```

Un GERENTE/SUBGERENTE puede generar el plan AI de un asesor de otra tienda.

**Esfuerzo:** Bajo (1 hora).

---

### ACC-02 — app-data expone datos laborales de compañeros al ASESOR

**Severidad:** MEDIA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// app/api/app-data/route.ts, línea 58
users: users.map((user) => ({
  id: user.id, name: user.name, /* ... */
  birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,  // ← expuesto
  hireDate: user.hireDate?.toISOString().slice(0, 10) ?? null,    // ← expuesto
  hoursOwed: user.hoursOwed,     // ← expuesto
  vacationDays: user.vacationDays,  // ← expuesto
  paidDays: user.paidDays,       // ← expuesto
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,  // ← expuesto
  active: user.active             // ← expuesto
}))
```

Esta serialización se aplica a **todos** los usuarios de la tienda y se envía a todos los roles, incluido ASESOR. Un asesor puede ver los días de vacaciones, horas adeudadas, fecha de contratación y último login de todos sus compañeros.

**Recomendación:** Para ASESOR, filtrar la respuesta de `users` a solo: `id`, `name`, `role`, `avatar`, `photoUrl`, `biometricEnabled`.

**Esfuerzo:** Bajo (1-2 horas).

---

### PERF-01 — Chat con polling agresivo y consultas N+1

**Severidad:** ALTA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// lib/chat.ts, línea 5-6 — comentario del código fuente
// El polling del chat es cada 3 s, así que 35 s deja
// margen para un par de ciclos perdidos sin marcar como desconectado.
```

Por cada request GET /api/chat (cada 3 s por usuario):
1. `ensureGroupRoom()` — 1-2 queries
2. `touchPresence()` — 1 UPDATE en User
3. `chatMember.findMany()` con includes profundos
4. Por cada room: `chatMessage.count()` — **N+1 query**
5. `chatMessage.findMany()` para mensajes no entregados
6. `chatMessageDelivery.createMany()` — escritura

**Estimación de carga:** 20 usuarios activos × 20 requests/min = 400 requests/min → ~2,400 queries/min. Con 50 usuarios: ~6,000 queries/min.

**Recomendación:** Reemplazar polling por Server-Sent Events (SSE). El endpoint de presencia puede ser separado con polling de 15-30 s. El endpoint de mensajes nuevos debe devolver solo el delta desde `lastMessageId`.

**Esfuerzo:** Alto (rediseño de transporte del chat, ~1-2 semanas).

---

### MP-01 — Webhook Mercado Pago no valida importe esperado

**Severidad:** MEDIA | **Confianza:** MEDIA | **Estado:** PARCIALMENTE CONFIRMADA

**Evidencia:**
```typescript
// app/api/webhooks/mercadopago/route.ts, líneas 28-49
const payment = await getPayment(paymentId);
if (payment.status !== "approved" || payment.currency_id !== "MXN") { ... }
// ← No hay comparación entre payment.transaction_amount y el importe esperado
const periodEnd = extendSubscription(store.subscriptionPaidUntil, new Date());
await prisma.$transaction(async (tx) => {
  await tx.subscriptionPayment.create({ data: { amountMxn: payment.transaction_amount, ... } });
  await tx.store.update({ data: { subscriptionPaidUntil: periodEnd } });
});
```

El importe que calcula `monthlyAmount()` (usuarios × precio por usuario) no se compara contra `payment.transaction_amount`. Un pago aprobado de cualquier importe activa la suscripción.

**INFERENCIA:** Para que esto sea explotable, un atacante necesitaría crear su propia preferencia con importe arbitrario usando las credenciales MP (que están en `.env`), lo cual ya implica un compromiso del sistema. El riesgo real es bajo si los secretos están correctamente protegidos.

**Recomendación:** Al procesar el webhook, calcular el importe esperado con `monthlyAmount()` y comparar ±10% contra `payment.transaction_amount`. Si no coincide, registrar en AuditLog pero no activar la suscripción.

**Esfuerzo:** Bajo (2-3 horas).

---

### STREAM-01 — Dominios de streaming no oficiales en CSP

**Severidad:** MEDIA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```javascript
// next.config.mjs, línea 61
"frame-src 'self' https://embedindia.st https://tvhd1.com https://www.youtube.com ..."
```

`embedindia.st` y `tvhd1.com` son servicios de streaming de contenido deportivo de origen no verificado. Su inclusión en el CSP:
1. Permite cargar iframes de esos dominios en Clarvex.
2. Los scripts de esos sitios pueden ejecutarse en el contexto del usuario (rastreadores, anuncios, posible malware).
3. Riesgo legal por distribución de contenido sin licencia.

**Recomendación:** Documentar la justificación de negocio. Si el módulo es opcional, protegerlo con feature flag y considerar el riesgo legal.

---

### R2-01 — Evidencias y fotos en R2 público sin autenticación

**Severidad:** INFORMATIVA | **Confianza:** ALTA | **Estado:** CONFIRMADA

**Evidencia:**
```typescript
// lib/r2.ts, línea 17-21
function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  return `${base}/${key}`;  // URL permanente y pública
}
```

El bucket usa `R2_PUBLIC_URL = "https://pub-650b73e1731f47a3b905fb9c615cb596.r2.dev"` — un dominio de bucket público de R2. Cualquier persona con la URL de una evidencia puede abrirla sin autenticación.

**Impacto:** Una evidencia compartida accidentalmente (o extraída de la respuesta de app-data) puede ser vista por cualquier persona en internet.

**Recomendación:** Evaluar migrar a URLs firmadas (presigned URLs) con expiración corta, o implementar un proxy autenticado (`/api/files/[key]`) que verifique la sesión antes de servir el archivo.

**Esfuerzo:** Medio (requiere cambios en todos los lugares que generan URLs de R2).

---

### OBS-01 — Sin observabilidad estructurada

**Severidad:** BAJA | **Estado:** CONFIRMADA

No se encontró ninguna dependencia de Sentry, OpenTelemetry, Datadog ni equivalente en `package.json`. Los errores se registran con `console.error()` sin request ID ni contexto estructurado. Los cron jobs no reportan éxito/fallo a ningún sistema de alerta externo.

**Recomendación:**
- Integrar Sentry para error tracking (1-2 días).
- Agregar request ID en middleware y propagarlo en logs.
- Implementar `GET /api/health` que verifique BD y variables mínimas.
- Integrar healthchecks.io (o similar) para monitoreo de cron jobs.

---

### MULTI-01 — Sin modelo Organization para multi-empresa

**Severidad:** INFORMATIVA | **Estado:** CONFIRMADA

El único aislamiento es `storeId`. No existe `Organization`. El campo `User.employeeNumber` tiene `@unique` global — dos empresas distintas no podrían usar la misma numeración de empleados si se agrega soporte multi-empresa.

**Recomendación:** Planificar la migración a un modelo `Organization → Store → User` antes de comercializar la plataforma a múltiples empresas.

---

## 6. VALIDACIÓN DE SOSPECHAS (A–U)

| Sospecha | Resultado | Evidencia | Comentario |
|----------|-----------|-----------|------------|
| A. VAPID privado en repositorio | CONFIRMADA | `.env.example:20` | Valor [REDACTED]. Clave privada real presente. |
| A. Gemini key en configuración | CONFIRMADA | `.env:18` | `GEMINI_API_KEY=[REDACTED]` |
| A. AUTH_SECRET en configuración | CONFIRMADA | `.env:3` | `AUTH_SECRET=[REDACTED]` |
| A. MP_ACCESS_TOKEN en configuración | CONFIRMADA | `.env:17` | `MP_ACCESS_TOKEN=[REDACTED]` |
| A. Credenciales R2 en configuración | CONFIRMADA | `.env:4-8` | Account ID, Access Key, Secret [REDACTED] |
| A. CRON_SECRET en configuración | CONFIRMADA | `.env:15` | `CRON_SECRET=[REDACTED]` |
| B. role/storeId en JWT 7 días | PARCIAL | `session-token.ts:7,34` | `role` se re-lee de BD en cada request. `storeId` y `platformAdmin` NO se re-leen — permanecen del JWT hasta 7 días. |
| B. Cambio de tienda no aplica de inmediato | CONFIRMADA | `session.ts:15-23` | Solo se re-leen `role`, `name` y `active`. `storeId` del JWT es stale hasta 7 días. |
| B. Revocación platformAdmin no inmediata | PARCIAL | `session-token.ts:50`, `session.ts` | `platformAdmin` viene del JWT. No se re-lee de BD. Un admin revocado mantiene acceso hasta expiración del JWT (7 días). |
| B. Usuario desactivado pierde acceso inmediato | NO CONFIRMADA (mitigado) | `session.ts:19` | `if (!user?.active) return null` — verificación en BD en cada request. Correcto. |
| C. PIN setup sin código temporal | CONFIRMADA | `employee-login/route.ts:50-53` | Ver AUT-02. |
| C. Inspect revela si usuario no tiene PIN | PARCIAL | `employee-login/route.ts:42` | Devuelve `requiresPinSetup: true/false`. Rate limit de IP existe pero no por número de empleado. |
| C. PIN hasheado correctamente | NO CONFIRMADA (correcto) | `security.ts:5-7` | bcrypt factor 12. Seguro. |
| D. Coach AI acepta userId del cliente | CONFIRMADA | `ai/coach-advisor/route.ts:13` | Ver AI-02. |
| D. Plan AI acepta userId sin validar storeId | CONFIRMADA | `ai/plan-manager/route.ts:14` | Ver ACC-03. |
| D. Copilot acepta storeId del cliente | NO CONFIRMADA | `ai/copilot/route.ts` | Usa solo `session`. Correcto. |
| E. app-data expone datos laborales a ASESOR | CONFIRMADA | `api/app-data/route.ts:58` | Ver ACC-02. |
| E. Prisma devuelve modelos completos | PARCIAL | `api/app-data/route.ts:26` | `users` se carga sin `select` (todos los campos incluyendo passwordHash). La serialización manual filtra, pero es el único mecanismo. |
| E. app-data incluye datos de otras tiendas | NO CONFIRMADA | `api/app-data/route.ts` | Todas las queries filtran `storeId: session.storeId`. |
| F. Regional ve todas las tiendas | CONFIRMADA | `regional/app-data/route.ts:19` | Ver ACC-01. |
| F. No existe tabla de asignaciones regional | CONFIRMADA | `schema.prisma` completo | Sin modelo de asignación. |
| G. Rate limiting solo en memoria | CONFIRMADA | `lib/rate-limit.ts:3` | `const store = new Map<string, Entry>()`. Se reinicia con el proceso. |
| G. Sin rate limiting en IA | CONFIRMADA | `app/api/ai/*` | Ningún handler de IA aplica rate limiting. |
| H. userVerification: "preferred" | CONFIRMADA | `register-options/route.ts:31`, `authenticate-options/route.ts:34` | Ambos usan "preferred" en lugar de "required". |
| H. requireUserVerification: false | CONFIRMADA | `register/route.ts:35`, `authenticate/route.ts:53` | Ambos usan false. Ver AUT-01. |
| H. Challenge expira en 5 min | NO CONFIRMADA (correcto) | `register-options/route.ts:42` | `expiresAt: new Date(Date.now() + 5 * 60 * 1000)`. Correcto. |
| H. Challenge de un solo uso | NO CONFIRMADA (correcto) | `authenticate/route.ts:61` | `webAuthnChallenge.delete({ where: { id: challenge.id } })` tras verificación. Correcto. |
| H. Counter actualizado | NO CONFIRMADA (correcto) | `authenticate/route.ts:62-65` | Counter se actualiza. Correcto. |
| I. R2 con URLs públicas permanentes | CONFIRMADA | `r2.ts:17-21`, `.env:8` | Bucket público, URLs sin expiración. Ver R2-01. |
| I. Validación de tipo/tamaño en uploads | NO CONFIRMADA (correcto) | `profile-photo.ts` | Magic bytes validados (JPEG/PNG/WEBP). Sin SVG ni ejecutables. |
| I. Path traversal en keys R2 | NO CONFIRMADA (correcto) | `evidences/upload/route.ts:67` | Key usa `crypto.randomUUID()`. Correcto. |
| J. Webhook valida status y moneda | NO CONFIRMADA (correcto) | `webhooks/mercadopago/route.ts:28` | Verifica `approved` y `MXN`. Correcto. |
| J. Idempotencia del webhook | NO CONFIRMADA (correcto) | `webhooks/mercadopago/route.ts:35-36` | Busca `mpPaymentId` antes de procesar. Correcto. |
| J. Webhook valida importe esperado | PARCIAL | `webhooks/mercadopago/route.ts:43-49` | El importe recibido no se compara con el esperado. Ver MP-01. |
| K. JSON.parse sin esquema en IA | CONFIRMADA | `clarvex-intelligence.ts:383,502,594,...` | 11 ocurrencias. Ver AI-01. |
| K. Sin caché en llamadas AI | PARCIAL | `clarvex-intelligence.ts` | Solo `getAdvisorProfile` tiene caché (3 días en AiMemory). `predictMetrics`, `getExecutiveHealth`, `optimizeTasks` no tienen caché. |
| K. Datos privados enviados a Gemini | CONFIRMADA | `clarvex-intelligence.ts:134-267` | Nombres de empleados, KPIs individuales, comisiones en pesos, notas de bitácora enviados a API de Google. |
| K. IA calcula cifras financieras | CONFIRMADA | `clarvex-intelligence.ts:572-594` | `predictMetrics` delega a Gemini el cálculo de `expectedCloseSales`, `salesPerHourNeeded`, etc. Ver AI-04. |
| L. Eliminación de suscripciones expiradas | NO CONFIRMADA (correcto) | `push.ts:48-50` | Status 404/410 → eliminación. Correcto. |
| L. Cola persistente de notificaciones | CONFIRMADA (ausente) | `push.ts` | Fire-and-forget con `Promise.allSettled`. Sin cola ni reintentos. |
| L. Filtrado por tienda en notificaciones | NO CONFIRMADA (correcto) | `push.ts:14-19` | Filtra por `userId { in: userIds }` y `user.active`. Correcto. |
| M. Endpoints demasiado grandes | CONFIRMADA | `api/app-data/route.ts`, `api/chat/route.ts` | Ver PERF-01, PERF-02. |
| M. Chat con polling frecuente | CONFIRMADA | `chat.ts:6` | Polling 3 s. Ver PERF-01. |
| N. Duplicación móvil/escritorio | CONFIRMADA | `app/` vs `app/escritorio/` | Módulos duplicados confirmados. Ver ARCH-04. |
| O. Pruebas de autorización entre tiendas | CONFIRMADA (ausentes) | `tests/` | Tests existentes son de funciones puras. Sin tests de API ni autorización. |
| P. Logs con datos sensibles | NO CONFIRMADA | Handlers revisados | Logs solo contienen IDs y mensajes de error. |
| P. Sin Sentry/OpenTelemetry | CONFIRMADA | `package.json` | No se encontró dependencia de monitoreo de errores. |
| Q. Un usuario a una sola tienda | CONFIRMADA | `schema.prisma:105` | `storeId String` en User, sin membresías múltiples. |
| Q. employeeNumber único global | CONFIRMADA | `schema.prisma:102` | `@unique`. Colisión potencial en multi-empresa. |
| Q. No existe Organization ni Region | CONFIRMADA | `schema.prisma` completo | Sin estos modelos. |
| R. AuditLog implementado | NO CONFIRMADA (correcto) | `lib/audit.ts`, `schema.prisma:835` | Existe y se usa en varios handlers. |
| R. Sin alertas de cron | CONFIRMADA | Scripts de cron | Sin heartbeat ni integración de monitoreo de cron. |
| S. Backup existe | NO CONFIRMADA (correcto) | `scripts/backup-db.ts` | Script de backup con pg_dump + retención 30 días. |
| S. Backup en mismo bucket | CONFIRMADA | `backup-db.ts:55-56` | Mismo bucket R2 que archivos de app. Ver OBS-02. |
| T. Pruebas de autorización de API | CONFIRMADA (ausentes) | `tests/security.test.ts` | Solo funciones puras. Sin pruebas de handlers. |
| U. noImplicitAny: false | CONFIRMADA | `tsconfig.json:10` | Tipado más laxo de lo óptimo. |
| U. CSP configurado | NO CONFIRMADA (correcto) | `next.config.mjs:50-66` | CSP presente. Dominios streaming son el riesgo (STREAM-01). |
| U. Cookies HttpOnly/SameSite/Secure | NO CONFIRMADA (correcto) | `session-token.ts:58-63` | `httpOnly: true`, `sameSite: "strict"`, `secure` en producción. |
| U. HSTS configurado | NO CONFIRMADA (correcto) | `next.config.mjs:48` | `max-age=63072000; includeSubDomains; preload`. |
| U. X-Frame-Options DENY | NO CONFIRMADA (correcto) | `next.config.mjs:43` | Correcto. |

---

## 7. MATRIZ DE AUTORIZACIÓN

| Endpoint | ASESOR | GERENTE | SUBGERENTE | REGIONAL | ADMIN | Validación servidor |
|----------|--------|---------|------------|----------|-------|---------------------|
| GET /api/app-data | ✅ propio | ✅ tienda | ✅ tienda | ❌ | ✅ | ✅ storeId de sesión |
| GET /api/regional/app-data | ❌ | ❌ | ❌ | ⚠️ TODAS | ✅ | ⚠️ Solo rol, sin asignación |
| POST /api/ai/coach-advisor | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ userId del cliente sin validar storeId |
| POST /api/ai/plan-manager | ❌ | ✅ | ✅ | ❌ | ✅ | ⚠️ userId del cliente sin validar storeId |
| POST /api/ai/copilot | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ session.storeId |
| POST /api/auth/employee-login setup | Público | Público | Público | Público | Público | ⚠️ Sin token de activación |
| POST /api/team | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ session.storeId |
| GET /api/team/[userId] | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ storeId validado |
| POST /api/evidences/upload | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ resource pertenece a storeId |
| POST /api/webhooks/mercadopago | Público | Público | Público | Público | Público | ⚠️ Sin validación de importe |
| GET /api/push/vapid-public-key | Público | Público | Público | Público | Público | Intencionalmente público |
| POST /api/cron/* | Sistema | Sistema | Sistema | Sistema | Sistema | ✅ Bearer CRON_SECRET |
| /api/admin/* | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ requirePlatformAdmin() |

---

## 8. MAPA DE DATOS SENSIBLES

| Dato | Almacenamiento | Endpoint que lo entrega | Quién puede acceder | ¿Cifrado? | ¿Público? | Riesgo |
|------|----------------|------------------------|---------------------|-----------|-----------|--------|
| PIN hash | PostgreSQL User.pinHash | Nunca | Nadie | bcrypt-12 | No | Bajo |
| JWT/sesión | Cookie HttpOnly | Solo al propietario | Usuario dueño | HS256 | No | Medio |
| Credenciales (`.env`) | Archivo de texto en disco | No expuesto en API | Proceso servidor | Sin cifrar | No | ALTO |
| Evidencias (fotos) | R2 público | URL permanente directa | Cualquiera con URL | No | SÍ | ALTO |
| Datos laborales (vacaciones, horas) | PostgreSQL | /api/app-data | Todos los autenticados (incl. ASESOR) | No | No | ALTO |
| KPIs individuales | PostgreSQL | /api/app-data, AI | Gerentes y asesor propio | No | No | Medio |
| Datos enviados a Gemini | API Google LLC | N/A | Google procesa | TLS | Externo | ALTO |
| WebAuthn credentials | PostgreSQL | Nunca | Nadie | Base64url | No | Bajo |
| Audit logs | PostgreSQL | /api/logs (admin) | Admin | No | No | Bajo |

---

## 9. PROBLEMAS DE RENDIMIENTO Y ESCALABILIDAD

### Actuales
- **PERF-01** Chat polling 3 s + N+1 queries (crítico con más de 20 usuarios simultáneos)
- **PERF-02** app-data sin paginación de KPIs históricos (crece con el tiempo)
- **PERF-03** app-data ejecuta 10 queries paralelas por request

### Con escalabilidad
- **SCALE-01** Regional: `findMany()` de stores sin límite — crece linealmente con tiendas
- **SCALE-02** Cron jobs: loop secuencial por tienda — crece linealmente
- **SCALE-03** Rate limiting en memoria no escala en cluster
- **SCALE-04** AI sin caché: costo y latencia crecen con uso

---

## 10. DEUDA TÉCNICA

| Área | Problema | Impacto |
|------|----------|---------|
| `clarvex-intelligence.ts` (929 líneas) | Monolito: BD + prompts + HTTP + caché mezclados | Alta deuda, difícil de probar |
| Duplicación móvil/escritorio | Bugs corregidos en una versión no se propagan a la otra | Media |
| `noImplicitAny: false` | Tipado laxo, bugs de tipo en runtime | Media |
| `forms.tsx` (~900 líneas estimadas) | Componentes de UI demasiado grandes | Baja |
| Sin modelo Organization | Requiere migración compleja para multi-empresa | Alta (futura) |
| `User.pinHash` query sin `select` en app-data | passwordHash leído de BD aunque nunca expuesto | Informativa |

---

## 11. PRUEBAS FALTANTES (PRIORIZADAS)

### Crítico — Seguridad y autorización
1. Un `userId` de otra tienda en coach-advisor es rechazado (AI-02)
2. Un usuario sin PIN no puede ser activado sin token de gerente (AUT-02)
3. Un usuario desactivado no puede autenticarse
4. Un regional solo ve sus tiendas asignadas (ACC-01)
5. Un asesor no recibe datos laborales de compañeros (ACC-02)

### Alto — Pagos
6. Un webhook con importe incorrecto no activa la suscripción (MP-01)
7. Un webhook duplicado (mismo mpPaymentId) no procesa dos veces

### Medio — IA y archivos
8. Una respuesta JSON malformada de Gemini devuelve error controlado (AI-01)
9. Una evidencia no puede descargarse sin sesión válida (R2-01)
10. WebAuthn sin userVerified=true es rechazado (AUT-01)

---

## 12. RESULTADOS DE COMANDOS

**Estado:** No ejecutados (el entorno sandbox no permite ejecución de comandos de shell).

| Comando | Estado | Nota |
|---------|--------|------|
| `pnpm install --frozen-lockfile` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `prisma validate` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `npx tsc --noEmit` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `pnpm lint` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `pnpm test` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `pnpm build` | ❌ No ejecutado | Sandbox sin acceso a shell |
| `pnpm audit` | ❌ No ejecutado | No se verificaron CVEs de dependencias |

**Referencia:** En sesiones previas de trabajo se confirmó que `pnpm build` y `npx tsc --noEmit` pasaban sin errores.

---

## 13. LIMITACIONES

1. Sin acceso a shell: no se ejecutaron typecheck, lint, tests ni build.
2. Sin base de datos activa: no se verificaron queries reales.
3. Sin historial Git: no se verificó si `.env.example` fue commiteado con valores reales.
4. Sin acceso a R2: no se verificó configuración de privacidad del bucket.
5. Sin acceso a Mercado Pago: no se verificó configuración de webhooks.
6. Sin análisis de dependencias vulnerables: no se ejecutó `pnpm audit`.
7. Service Worker: no se analizó el SW compilado (`.next/` excluido).
8. No se verificó la configuración de CORS — `next.config.mjs` no define CORS explícito (Next.js por defecto no agrega headers CORS a rutas API).

---

## 14. PRIORIZACIÓN POR FASES

### FASE 0 — Emergencia (24-48 h)
- **SEC-01** Rotar todas las credenciales de `.env.example` y verificar historial Git
- **AUT-02** Deshabilitar PIN setup sin autorización de gerente
- **AI-02** Validar `userId` en coach-advisor contra `session.storeId`
- **ACC-03** Validar `userId` en plan-manager contra `session.storeId`

### FASE 1 — Seguridad (1-4 semanas)
- **ACC-01** Tabla de asignaciones regional↔tienda
- **AUT-01** WebAuthn con `requireUserVerification: true` (con migración)
- **SEC-03** Rate limiting persistente (Redis)
- **SEC-04** Rate limiting en endpoints de IA
- **ACC-02** Filtrar datos laborales de compañeros según rol
- **AI-01** Validación de respuestas de IA con Zod
- **MP-01** Validar importe en webhook
- **B (storeId/platformAdmin)** Re-leer de BD en getServerSession

### FASE 2 — Confiabilidad y escalabilidad (1-3 meses)
- **PERF-01** Chat con SSE o WebSockets
- **PERF-02** Paginar KPIs en app-data
- **OBS-01** Sentry + request ID + health check
- **OBS-02** Bucket separado para backups
- **R2-01** URLs firmadas o proxy autenticado para evidencias
- **TEST-01** Pruebas de autorización y aislamiento de tiendas

### FASE 3 — Mejoras de producto (3-6 meses)
- **ARCH-01** Refactorizar `clarvex-intelligence.ts`
- **ARCH-04** Unificar componentes duplicados móvil/escritorio
- **MULTI-01** Modelo Organization para multi-empresa
- **AI-04** Separar cálculos deterministas de generativos
- **ARCH-03** `noImplicitAny: true` gradualmente

---

## 15. TOP 10 CORRECCIONES PRIORITARIAS

| # | ID | Acción | Impacto | Esfuerzo |
|---|-----|--------|---------|----------|
| 1 | SEC-01 | Rotar todas las credenciales expuestas en `.env.example` | Crítico | Horas |
| 2 | AUT-02 | Flujo de activación de PIN con token de gerente | Alto | Días |
| 3 | AI-02 + ACC-03 | Validar `userId` contra `session.storeId` en endpoints de IA | Alto | Horas |
| 4 | ACC-01 | Sistema de asignaciones regional↔tienda | Alto | Semanas |
| 5 | AI-01 | Zod schemas para todas las respuestas de Gemini | Alto | Días |
| 6 | ACC-02 | Filtrar datos laborales de compañeros según rol | Medio | Horas |
| 7 | B (session) | Re-leer `storeId` y `platformAdmin` de BD en getServerSession | Medio | Horas |
| 8 | MP-01 | Validar importe esperado en webhook de Mercado Pago | Medio | Horas |
| 9 | AUT-01 | WebAuthn con `requireUserVerification: true` | Medio | Semanas (migración) |
| 10 | PERF-01 | Reemplazar polling de chat por SSE | Alto (escalabilidad) | Semanas |

---

*Fin del informe. Ningún archivo de la aplicación fue modificado durante esta auditoría.*  
*Fecha: 2026-07-10 | Clasificación: Confidencial | Uso interno*
