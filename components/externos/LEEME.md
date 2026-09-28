# `components/externos` — lo que llega de fuera

Aquí aterriza lo que se copia de **21st.dev** con el CLI de shadcn. Nada de
esto lo escribimos nosotros, y por eso vive aparte.

## Por qué no va en `components/ui`

⚠️ El alias por omisión de shadcn es `@/components/ui`, que en este proyecto ya
es **nuestra** carpeta: `AppFrame`, `AppHeader`, `GlassCard`, las dos barras del
teléfono. Mezclarlas tiene dos costes concretos:

1. Un `shadcn add card` escribiría `components/ui/card.tsx` al lado de nuestro
   `GlassCard`, y en una lista de importaciones «Card» pasaría a significar dos
   cosas distintas según de dónde venga.
2. Al revisar un cambio ya no se distingue lo que decidimos nosotros de lo que
   llegó pegado. Y lo pegado se actualiza con un comando que **sobrescribe**.

`components.json` apunta el alias `ui` aquí para que esa frontera no dependa de
que alguien se acuerde.

## Antes de pegar un componente

⚠️ **Dos nombres de color significan lo CONTRARIO que en shadcn.** El puente de
`tailwind.config.ts` traduce los quince que faltaban, pero estos dos ya estaban
ocupados y no se pueden reasignar sin repintar la app entera:

| En el componente | Qué pinta aquí | Qué poner |
|---|---|---|
| `bg-muted` | el gris del TEXTO, oscuro | `bg-secondary` |
| `bg-accent` | el azul del ESCRITORIO | `bg-secondary` |

No dan error: pintan un color que no toca, que es peor de encontrar.

## El límite

21st permite **2 copias al día** en total entre web, MCP y CLI. No se gastan
explorando: primero se decide qué hace falta, y solo entonces se baja.
