# CLARVEX Team

PWA mobile-first para operacion retail: KPIs, horarios, plan del dia, pendientes, bitacora, comunicados y ranking de asesores.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- JWT simple
- PWA instalable

## Instalacion

```bash
npm install
```

Crea `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/clarvex_team?schema=public"
JWT_SECRET="cambia-este-secreto"
```

Genera Prisma, corre migracion y seed:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Levanta el proyecto:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Login demo

La pantalla de login permite entrar con usuarios demo sin base de datos para revisar la UI desde el primer arranque.

Usuarios seed con password `demo1234` y numero de empleado:

- Itzel, gerente, `81893`
- Adrian, subgerente, `102259`
- Waira, asesor, `95739`
- Jazmin, asesor, `93383`
- Alonso, asesor, `113642`

La pantalla de login demo detecta automaticamente el usuario al escribir su numero de empleado.

## Vistas incluidas

- `/login`: acceso demo
- `/manager`: dashboard gerente
- `/advisor`: dashboard asesor
- `/plan`: plan del dia y checklist
- `/pendientes`: pendientes, handover y vista de gerencia
- `/kpis`: KPIs por asesor y tienda
- `/horarios`: horarios semanales demo
- `/bitacora`: registros cronologicos
- `/comunicados`: comunicados y lectura por asesor

## Siguiente fase sugerida

Conectar las vistas a Prisma mediante Server Actions o API routes, guardar checklist en base de datos, activar CRUD real para pendientes/comunicados y agregar importacion de horarios desde Excel.
