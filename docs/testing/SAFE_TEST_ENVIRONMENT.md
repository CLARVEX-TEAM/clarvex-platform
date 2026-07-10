# Safe Testing Environment

Para garantizar que las pruebas automatizadas y de integración nunca alteren, expongan o destruyan datos reales de Clarvex en el servidor de producción, se ha establecido un esquema de **Aislamiento Total del Entorno de Pruebas**.

---

## 1. Reglas de Aislamiento y Seguridad

Cualquier prueba de integración o script de testing que realice modificaciones en la base de datos debe cumplir estrictamente con las siguientes políticas. El sistema abortará inmediatamente si detecta una anomalía:

1. **NODE_ENV Obligatorio:** El entorno debe ser obligatoriamente `NODE_ENV=test`.
2. **Flag de Aceptación:** Debe estar presente la variable de entorno `ALLOW_INTEGRATION_TEST_DATABASE=true`.
3. **Base de Datos Dedicada (`clarvex_test`):**
   - Las pruebas deben apuntar exclusivamente a la base de datos de pruebas configurada en `TEST_DATABASE_URL`.
   - La base de datos debe contener explícitamente la palabra `test` en su nombre (ej. `clarvex_test`).
   - Queda estrictamente prohibido usar el nombre `clarvex_team` o la URL de producción.
4. **Protección de Registros de Producción:**
   - La función de seguridad realiza una consulta previa sobre la base de datos cargada.
   - Si existe algún usuario cuyo `employeeNumber` **no empiece con el prefijo `"TEST-"`** (como los empleados de producción reales), la prueba abortará al instante previniendo cualquier escritura en la base real.

---

## 2. Inyección Dinámica en Prisma

El inicializador del cliente Prisma ([`lib/prisma.ts`](file:///home/ubuntu/clarvex-app/lib/prisma.ts)) detecta automáticamente si la aplicación corre en entorno de pruebas (`NODE_ENV === "test"`) y realiza el intercambio dinámico de `DATABASE_URL` con `TEST_DATABASE_URL` antes de inicializar la conexión:

```typescript
if (process.env.NODE_ENV === "test") {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || !testUrl.includes("test")) {
    throw new Error("ERROR DE SEGURIDAD: TEST_DATABASE_URL incorrecta o no configurada.");
  }
  process.env.DATABASE_URL = testUrl;
}
```

---

## 3. Simulación de Servicios Externos (Mocks)

Cuando `MOCK_EXTERNAL_SERVICES=true` o `NODE_ENV=test`, los conectores externos interceptan las llamadas salientes y devuelven respuestas controladas:

* **Gemini AI:** Las llamadas en `ClarvexIntelligence.callGemini` se interceptan y devuelven JSONs estructurados simulados (perfil de coaching, planes diarios optimizados, predicciones de KPI) sin consumir la API real.
* **Mercado Pago:** La creación de preferencias de pago y consulta de transacciones devuelven estados aprobados y referencias simuladas sin realizar llamadas a la API de producción de Mercado Pago.
* **Cloudflare R2:** Los métodos de almacenamiento (`uploadToR2`, `getFromR2`, `deleteFromR2ByKey`) operan simulando la carga y descarga en memoria o de forma local, evitando interactuar con el bucket R2 de producción.
* **Web Push:** El despachador `dispatchPushToUsers` simula los envíos en consola, evitando disparar notificaciones reales a dispositivos móviles de usuarios activos.

---

## 4. Ejecución del Servidor y Pruebas

### Archivo de Configuración (`.env.test`)
Crea un archivo `.env.test` (ignorado por Git) con el siguiente contenido:

```env
NODE_ENV=test
ALLOW_INTEGRATION_TEST_DATABASE=true
TEST_DATABASE_URL=postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public
TEST_BASE_URL=http://127.0.0.1:3101
MOCK_EXTERNAL_SERVICES=true
GEMINI_API_KEY=mock-gemini-key
MP_ACCESS_TOKEN=mock-mercadopago-token
R2_BUCKET_NAME=clarvex-test-uploads
VAPID_PUBLIC_KEY=mock-vapid-public-key
VAPID_PRIVATE_KEY=mock-vapid-private-key
CRON_SECRET=mock-cron-secret
```

### Inicialización de Base de Datos de Test (Migraciones y Seed)
Antes de correr las pruebas, prepara el esquema y los datos sintéticos de prueba:

```bash
# Sincroniza el esquema en la base de datos de pruebas
DATABASE_URL=postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public pnpm prisma db push

# Poblar la base con datos semilla de prueba (usuarios TEST-GER-001, TEST-ADV-001, etc.)
NODE_ENV=test ALLOW_INTEGRATION_TEST_DATABASE=true pnpm exec tsx tests/seed-test-db.ts
```

### Comandos de Testing
Los comandos configurados en `package.json` son:

```bash
# Ejecutar todas las pruebas unitarias
pnpm test

# Ejecutar las verificaciones de la protección del entorno
pnpm test:security-protection

# Ejecutar pruebas de integración apuntando a la base de pruebas clarvex_test
pnpm test:integration
```
