# CLARVEX Team

PWA mobile-first para operacion retail: KPIs, horarios, plan del dia, pendientes, bitacora, comunicados y ranking de asesores.

## Stack

- Next.js 14 (App Router)
- TypeScript (strict mode)
- Tailwind CSS
- PostgreSQL + Prisma ORM
- JWT firmado con `jose` (HS256)
- PWA instalable

## Instalacion

```bash
npm install
```

Crea `.env.local` (nunca subas este archivo al repositorio):

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/clarvex_team?schema=public"
AUTH_SECRET="genera-un-secreto-aleatorio-minimo-32-caracteres"
EXCEL_PROXY_WORKER_URL="https://tu-worker.workers.dev"
```

> **AUTH_SECRET** debe ser una cadena aleatoria larga. Genera una con:
> ```bash
> openssl rand -base64 32
> ```

Genera el cliente Prisma, aplica migraciones y carga datos demo:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Levanta el servidor de desarrollo:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Login demo

El seed crea los siguientes usuarios. Para entrar, escribe el numero de empleado en la pantalla de login y configura tu PIN en el primer acceso.

| Nombre  | Rol         | Numero de empleado |
|---------|-------------|-------------------|
| Itzel   | GERENTE     | 81893             |
| Adrian  | SUBGERENTE  | 102259            |
| Waira   | ASESOR      | 95739             |
| Jazmin  | ASESOR      | 96383             |
| Alonso  | ASESOR      | 113642            |

> No hay contrasenas por defecto. La autenticacion es por numero de empleado + PIN de 4 digitos configurado en el primer acceso.

## Seguridad

- Autenticacion via PIN (4 digitos) protegida con bcrypt
- Rate limiting: 10 intentos de login por minuto por IP, 30 inspecciones por minuto
- Headers HTTP de seguridad: CSP, X-Frame-Options, HSTS, X-Content-Type-Options
- Cookie de sesion: `httpOnly`, `secure`, `sameSite=strict`
- Tokens JWT con expiracion de 7 dias

## Vistas incluidas

- `/login` — acceso por numero de empleado y PIN
- `/manager` — dashboard gerente/subgerente
- `/advisor` — dashboard asesor
- `/plan` — plan del dia y checklist
- `/pendientes` — pendientes y handover
- `/kpis` — KPIs por asesor y tienda
- `/horarios` — horarios semanales
- `/bitacora` — registros cronologicos
- `/comunicados` — comunicados y lectura por asesor
- `/datos` — centro de datos y sincronizacion Excel
