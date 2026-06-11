# CLARVEX Team

PWA mobile-first para operación retail: KPIs, horarios, plan del día, pendientes, bitácora, comunicados y ranking de asesores.

## Stack

- Next.js 15.5.18 (App Router)
- TypeScript (strict mode)
- Tailwind CSS
- PostgreSQL + Prisma ORM
- JWT firmado con `jose` (HS256)
- PWA instalable

## Instalación

```bash
pnpm install
pnpm exec prisma generate
```

Crea `.env.local` (nunca subas este archivo al repositorio):

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/clarvex_team?schema=public"
AUTH_SECRET="genera-un-secreto-aleatorio-minimo-32-caracteres"
EXCEL_PROXY_WORKER_URL="https://tu-worker.workers.dev"
```

> Genera `AUTH_SECRET` con:
> ```bash
> openssl rand -base64 32
> ```

Levanta el servidor de desarrollo:

```bash
pnpm run dev
```

Abre `http://localhost:3000`.

## Seguridad

- Autenticación vía PIN (4 dígitos) protegida con bcrypt
- Autenticación biométrica (WebAuthn — Face ID / Huella)
- Rate limiting: 10 intentos de login por minuto por IP
- Headers HTTP de seguridad: CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- Cookie de sesión: `httpOnly`, `secure`, `sameSite=strict`
- Tokens JWT con expiración de 7 días

## Vistas incluidas

- `/login` — acceso por número de empleado, PIN y biometría
- `/manager` — dashboard gerente/subgerente
- `/advisor` — dashboard asesor
- `/plan` — plan del día y checklist
- `/pendientes` — pendientes y handover
- `/kpis` — KPIs por asesor y tienda
- `/horarios` — horarios semanales
- `/bitacora` — registros cronológicos
- `/comunicados` — comunicados y lectura por asesor
- `/datos` — centro de datos y sincronización Excel
- `/perfil` — perfil, foto y configuración de biometría
