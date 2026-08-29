# Clarvex Team — CLAUDE.md

## Centro operativo Slack / Retool / AWS — 29 de agosto de 2026

Se empezó la fase de control administrativo encima de lo que ya estaba en
producción, sin tocar la lógica de KPIs, comisiones ni captura de tienda.

### Slack como centro de mando

`sendOpsAlert` conserva el camino viejo por n8n (`WEBHOOK_URL`) y ahora agrega
un camino directo por bot si existe `SLACK_OPS_CHANNEL`. El mensaje lleva tres
acciones:

```
Marcar revisado  -> /api/webhooks/slack/actions -> AuditLog slack.ops.ack
Abrir auditoria  -> Retool /auditoria
Abrir Clarvex    -> /escritorio/admin
```

- El endpoint de acciones verifica la firma con `SLACK_SIGNING_SECRET`, igual
  que el espejo del chat. Si Slack no firma, se rechaza con 401.
- Las acciones se registran en `AuditLog`, no ejecutan una mutación de negocio
  todavía. `slack.ops.approve` y `slack.ops.reject` ya quedan reservadas para
  conectar aprobaciones reales después.
- Para que los botones funcionen, la app de Slack debe tener Interactivity
  apuntando a
  `https://team.clarvex.tech/api/webhooks/slack/actions`.
- `SLACK_OPS_CHANNEL` es distinto de `SLACK_CHAT_CHANNELS`: no mezclar alertas
  administrativas con el espejo del chat de tienda.
- Canal operativo encontrado: `#clarvex-alertas` = `C0BQFQM6CHX`. El bot no es
  miembro y `conversations.join` devolvió `missing_scope`; por eso no se dejó
  `SLACK_OPS_CHANNEL` activo todavía. Secuencia pendiente: invitar el bot a ese
  canal, poner `SLACK_OPS_CHANNEL=C0BQFQM6CHX` en `.env` y reiniciar PM2.

### Retool: Auditoría privada

Nueva ruta del App Builder: `/auditoria`.

- Solo se muestra cuando la metadata del usuario Retool trae
  `platformAdmin=true` o `role=PLATFORM_ADMIN`.
- La función backend `backend/ops/getOpsCenter.ts` exige esa metadata y solo
  entonces llama a Clarvex con `X-Clarvex-Platform-Admin: true`.
- Clarvex expone `GET /api/admin/retool/ops`, protegido por
  `ADMIN_CAPTURE_SECRET` y por ese encabezado. Devuelve resumen operativo,
  frescura por tienda, últimas entradas de auditoría y errores recientes de
  sincronización.
- Las cuentas de gerencia de tienda no deben recibir `platformAdmin=true`.

### AWS: costos antes de que duelan

Se agregó `scripts/aws-cost-guardrails.ps1`.

Hace dos cosas:

- Budget mensual `clarvex-aws-activate-guardrail`, por omisión 120 USD/mes,
  midiendo gasto bruto antes de créditos (`IncludeCredit=false`) para que los
  créditos Activate no escondan consumo real.
- Cost Anomaly Detection por servicio con umbral diario de 5 USD.

No se pudo aplicar en esta corrida porque el token SSO del perfil `clarvex`
expiró. Secuencia:

```powershell
aws sso login --profile clarvex
powershell -ExecutionPolicy Bypass -File scripts\aws-cost-guardrails.ps1
```

El correo por omisión es `contacto@clarvex.adrianluna.mx`; si se quiere otro:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\aws-cost-guardrails.ps1 -AlertEmails admin@dominio.com
```

## Captura por Telegram — 26 al 28 de agosto de 2026

Cuatro cosas nuevas, todas por el bot de Clarvex (`@AdrianAssitBot`) en **chat
privado**. El mismo bot manda las evidencias al grupo, así que cada flujo filtra
por el chat: los mensajes del grupo no disparan nada.

### Pase de lista: «sin novedad» y solo la excepción

`POST|GET /api/admin/capture/attendance/roll-call`, con `ADMIN_CAPTURE_SECRET`.
Marca a su hora a todo el que tenía horario ese día; solo se nombra a quien se
salió de lo normal.

```
asistencia                            enseña la plantilla del día (NO escribe)
sin novedad                           marca a cada quien según su horario
sin novedad, Itzel 11:05, Jazmin falta
```

- ⚠️ **NO decide estados.** La hora que pone es la que el horario ya esperaba, y
  clasifica `captureAttendance` con las reglas de siempre. Dejar que esta vía
  marcara «a tiempo» por su cuenta permitiría blanquear un retardo.
- ⚠️ **No pisa lo ya capturado** — salvo que nombres a la persona. Mandarlo dos
  veces, o después de corregir en Retool, no deshace ese trabajo en silencio.
  Nombrar a alguien sí manda: es explícito, y lo que se protege es el descuido.
- ⚠️ **Incluye a quien descansa o está de vacaciones**, y a esos se les manda
  **sin hora**: `classifyDay` deriva el estado de su horario. Ponerles la hora
  esperada los marcaría como si hubieran venido. Comprobado: su banco de minutos
  queda en 0.
- Un nombre que casa con **dos** personas no marca a ninguna. Elegir mal tocaría
  el sueldo de dos a la vez y en silencio.
- Las reglas viven en `lib/attendance-roll-call-plan.ts`, **sin Prisma a
  propósito**: `lib/prisma` lanza fuera de la configuración de integración, y eso
  hacía imposible cubrirlas con pruebas.

### El lector del POS empareja por cualquier parte del nombre

Antes solo miraba el apellido y por prefijo de cinco letras. Eso cubría los
nombres que el visor **corta** (`POPOCA, WAIRA ZITLAL`) y la Ñ estropeada
(`TREVIÃO`), pero no que el lector metiera una letra a mitad de palabra.

⚠️ Pasó con un reporte real: leyó `POPCOCA` por POPOCA, el prefijo común se
quedó en 3 letras y **la venta del día de Waira no se cargó**. El aviso decía
«revisa que estén dados de alta con ese apellido», que manda a buscar donde no
estaba el problema.

Ahora basta con que coincida cualquier parte del nombre con cualquier parte del
suyo, y se tolera **una** errata en apellidos de cinco letras o más. La red no
cambia: un nombre que encaja con dos personas se reporta ambiguo y no se asigna.

### Reporte fotográfico semanal

`GET|POST /api/admin/capture/visual`. Lee las fotos que el bot dejó en
`/home/ubuntu/visual/pendientes`, las coloca en `plantilla.pptx` y devuelve el
archivo bautizado `RF_W34_SAN_AGUSTIN.pptx`.

```
visual                    muestra los huecos y cuáles faltan
visual <etiqueta>         con una foto: la guarda con ese nombre
visual                    con una foto SIN pie: la guarda sin zona
visual reconocer          propone a qué zona va cada foto sin pie
visual cambiar 3 = MSW ZONA 1   corrige una del reparto
visual confirmar          aplica el reparto
visual armar              devuelve el .pptx
```

- Los **huecos y su nombre se deducen de la plantilla**: la etiqueta es el texto
  que cae justo debajo del hueco y centrado en su ancho. No hay que marcar nada.
- ⚠️ **Una diapositiva puede llevar VARIAS fotos.** La de Licencias trae dos
  desde el 27 de agosto de 2026. El ancho se reparte a partes **iguales** entre
  las etiquetas de esa lámina, ordenadas de izquierda a derecha — no según dónde
  caiga cada rótulo: dos fotos lado a lado tienen que salir del mismo tamaño, y
  repartir por la posición del texto las dejaba con medio centímetro de
  diferencia, que es justo lo que se nota. Con una sola etiqueta el reparto
  devuelve el ancho entero, así que las demás láminas no cambian.
- ⚠️ **Las etiquetas de la plantilla traen espacios DOBLES** («Ventana&nbsp;&nbsp;Caballero»,
  «Licencias&nbsp;&nbsp;2») y el bot los colapsa al nombrar el archivo. Comparar literal
  hacía que la foto se colocara bien pero siguiera figurando como que faltaba y
  no se borrara de pendientes. Comparar **siempre** con `plano()` de
  `lib/visual-pptx.ts`.
- ⚠️ Las fotos **no se recortan**: llegan ya editadas, así que se escalan para
  caber enteras y se centran. El hueco es muy apaisado (31.7 × 12.4 cm), así que
  una foto vertical sale como una tira estrecha — es correcto, pero conviene
  mandarlas panorámicas.
- ⚠️ Las fotos **no viajan por HTTP**: son doce y pesadas, y en base64 dentro de
  un JSON crecen un tercio. Se dejan en un volumen compartido y el endpoint las
  lee del disco.
- ⚠️ El número de semana **se lee de `Kpi.weekNumber`**, no se calcula. Inventar
  aquí una cuenta propia crearía una segunda numeración que acabaría separándose
  de la real.
- Solo se borran las fotos que se colocaron. Las que no casaron con ningún hueco
  se quedan: son las que hay que revisar.

### Reconocer la zona sin pie de foto — 28 de agosto de 2026

`GET|POST /api/admin/capture/visual/reconocer`. Las trece tomas son siempre las
mismas zonas de la misma tienda, así que **la foto de la semana pasada es la
mejor referencia** de cómo se ve cada sitio. Se mandan sin escribir nada y el
bot propone el reparto.

Medido contra reportes reales, con referencias de **tres semanas antes y cambio
de temporada** de por medio —el peor caso, porque en uso normal tienen siete
días—: **13 de 13**.

- ⚠️ **Se reparten TODAS a la vez, una por hueco.** Preguntando foto por foto
  acierta 10 de 13, y los tres fallos son el mismo: manda una foto de caballero
  a un hueco de dama que ya estaba ocupado por la suya. **WSW y MSW son
  secciones espejo, con los mismos muebles.** La restricción de uno a uno es
  información, y sale gratis.
- ⚠️ **Aquí sí hace falta el modelo grande.** Con Haiku, 11 de 13 (confunde MSW 1
  con MSW 2); con Sonnet, 13. Es una llamada por semana, ~24 mil tokens: bajar de
  modelo ahorra centavos y cuesta un cruce de zonas. Variable
  `VISUAL_RECONOCER_MODEL`; usa las mismas credenciales `BEDROCK_*`.
- ⚠️ **Nada de huella visual.** La mercancía cambia cada semana y es lo que más
  ocupa la foto; lo que identifica la zona está en las orillas —señales de
  evacuación y hacia dónde apuntan, las tiendas vecinas que se ven por el
  cristal (GARMIN, CALZEDONIA), una columna roja, un arco de madera, un espejo—.
  Una huella pesaría sobre todo la ropa. Además el **encuadre varía**: la misma
  zona sale más cerca o más lejos según la semana.
- ⚠️ **Proponer y aplicar van SEPARADOS.** Un cruce entre dos zonas sale impreso
  y no lo nota nadie: son doce fotos parecidas de la misma tienda. Reconocer
  solo **renombra** archivos; todo lo de después es el camino de siempre.
- ⚠️ **Corregir INTERCAMBIA** con quien tuviera esa zona. Reasignar a secas
  dejaría dos fotos en una zona y otra sin ninguna, rompiendo justo lo que hace
  que esto funcione.
- Nada de lo que devuelve el modelo se da por bueno (`lib/visual-reconocer.ts`):
  el reparto tiene que ser completo y uno a uno, las zonas tienen que existir en
  la plantilla y ninguna puede repetirse. Un reparto a medias se rechaza
  diciendo qué fotos quedaron sueltas.
- Las referencias **se siembran solas**: al armar, cada foto colocada se guarda
  en `/home/ubuntu/visual/referencias/<clave>.jpg` antes de borrarla, encogida a
  900 px. Se encogen porque **no caben**: veintiséis fotos a tamaño real pesan
  ~18 MB y en base64 se pasan del límite de la petición.
- Con fotos sin reconocer, **`visual armar` se detiene**. Sin ese freno el
  reporte saldría con láminas vacías en silencio.
- El primer arranque necesita referencias: se sembraron a mano con las fotos del
  reporte de la semana 34, extraídas del propio `.pptx`.

### Y el copiloto flotante se retiró

Nadie lo usaba y su botón estorbaba en todas las pantallas. Se quitó el
**montaje** en `app/layout.tsx`, no el componente: devolverlo es una línea.

⚠️ Esto **no desactiva la IA del resto de la app**. Cada pantalla tiene su
propio endpoint y siguen igual: `coach-advisor`, `announcements-gen`, `reports`,
`tasks-optimize` y `plan-manager`.

---

## Cuota Justa y cierre semanal nativos — 22 de agosto de 2026

La Cuota Justa y el RDS se administran en Retool desde `/cuota-justa`; el Excel
deja de ser la base y pasa a ser una exportacion.

**Son periodos independientes:** Retool tiene un selector para RDS y otro para
Cuota Justa. Por defecto abre RDS en la semana anterior y CJ en la semana
actual, que es el flujo real de los domingos. El API usa `reportWeekStart` y
`quotaWeekStart`; `weekStart` queda solo como compatibilidad heredada.

- `lib/fair-quota.ts`: minimo diario + 15 %, gerente 10 %, subgerente 15 % y
  remanente entre asesores presentes. `INVENTORY` cuenta como laborado. Cada dia
  suma 100 % y el dinero cierra al centavo.
- `WeeklyPerformanceClose`: un registro por tienda/semana. Borrador editable y
  cierre final congelado con snapshot; una semana finalizada no se reabre.
- API: `GET|POST /api/admin/capture/weekly-performance` y
  `GET /api/admin/capture/weekly-performance/export`, con
  `ADMIN_CAPTURE_SECRET`. Guardar actualiza solo metas diarias y el presupuesto
  semanal de WhatsApp; no toca ventas.
- El export acepta `document=quota|rds|combined`. Retool muestra tres acciones:
  `Exportar Cuota Justa`, `Exportar RDS` y `Archivo completo`. Los nombres son
  `CUOTA-JUSTA-S{n}.xlsx`, `RDS-S{n}.xlsx` y el combinado de ambas semanas.
- El mismo endpoint acepta `output=xlsx|pdf` (XLSX por omision). Los PDF se
  generan directamente con `pdf-lib`, sin depender de Excel o LibreOffice en
  el servidor. Cuota Justa replica el formato corporativo en una pagina Carta
  horizontal: tienda, semana, minimo/meta, Punto de Venta y WhatsApp. RDS usa
  una pagina independiente con Punto de Venta, indicadores, perdidas,
  indicador a trabajar y WhatsApp. `document=combined&output=pdf` produce ambas
  paginas en un solo archivo.
- La plantilla exacta esta en `templates/cuota-justa-rds.xlsx`. El exportador
  usa JSZip para conservar hojas, estilos y formato de impresion, limpia los
  `#REF!` de la hoja oculta `HORARIOS` y fuerza recalculo al abrir. En las
  descargas individuales no elimina hojas: oculta la otra seccion y selecciona
  la pestaña correcta, para preservar formulas y nombres definidos.
- Los encabezados de asesores usan el nombre corto de operacion en las dos
  tablas de `CJ` y en `RDS`: Itzel, Adrian, Waira, Jazmin y Alonso. La unica
  excepcion explicita es `JESUS ADRIAN ...`, que se muestra como `Adrian`; esto
  no cambia el orden, porcentajes, cuotas ni formulas del archivo.
- El importador por pegado de CJ **se retiró** el 23 de agosto de 2026 (Retool
  `0448797`, publish `1c80ce6`). Existía como respaldo mientras las metas
  vivían en el Excel; con Cuota Justa escribiéndolas era una segunda puerta al
  mismo dato, y pegar un bloque viejo sobrescribía metas ya aplicadas sin que
  nada avisara. El endpoint `POST /api/admin/capture/goals` sigue en Clarvex,
  ya sin nadie que lo llame.
- ⚠️ **Los importes se muestran CON CENTAVOS** desde el 28 de agosto de 2026
  (Retool `eaaa231`, publish `4256e45`). Cuota Justa y el escritorio redondeaban
  a pesos, y el dato siempre los tuvo: las metas guardadas son `9,154.76` y
  `3,269.56`, no cifras redondas. Recortarlos hacía que **una columna no sumara
  su total** —lo que se veía daba $31,356 y el real era $31,355—, lo que parece
  un error de cálculo y no lo es; y tampoco cuadraba con el Excel exportado ni
  con el reporte del POS, que sí los enseñan. Los **conteos** (tickets, piezas,
  tráfico, personas) siguen en entero: medio ticket no existe. La regla vive en
  `fmtMoney` de `frontend/utils/dashboard.ts` y en `MONEY` de
  `frontend/pages/WeeklyPerformance.tsx`.
- ⚠️ **Guardar Cuota Justa debe mandar porcentajes COMPLETOS** desde el 29 de
  agosto de 2026 (Retool `bf77d5f`, publish/post-publish `4f79fdb`). La UI
  completaba visualmente con `live.days`: por eso podia enseñar 100 %, pero el
  payload seguia mandando `percentages` parcial desde el estado editado. En un
  dia como `2026-09-04`, el backend recibia 60 % y rechazaba correctamente el
  guardado. `WeeklyPerformance.tsx` ahora materializa `percentages` desde
  `live.days` antes de guardar, tambien al recargar el estado tras un GET/POST.
  `quotaDirty` dejo de usar `JSON.stringify` y compara semanticamente
  `minimums`, `whatsappBudget` y porcentajes por fecha/persona con tolerancia
  numerica.
- ⚠️ **En el XLSX de Cuota Justa, los bloques diarios son celdas combinadas.**
  Desde el 29 de agosto de 2026, `lib/weekly-performance-xlsx.ts` escribe
  `MINIMO`, fecha y WhatsApp solo en la celda izquierda de cada par (`D`, `F`,
  `H`, ...). La plantilla deja la derecha (`E`, `G`, `I`, ...) vacia y sus
  totales hacen `SUM(D:Q)` esperando esos huecos vacios. Escribir el mismo
  minimo en ambos lados hacia que la suma no cuadrara en el Excel exportado.
  La regresion vive en `tests/weekly-performance-xlsx.test.ts`.
- Retool: `backend/weeklyPerformance/*`, `frontend/pages/WeeklyPerformance.tsx`
  y ruta `/cuota-justa`. Desplegar siempre Clarvex antes que Retool.

Desplegado el 22 de agosto de 2026: Clarvex `2c358cb`, migracion
`20260822183000_weekly_performance_close` y Retool `7fb6cbf` (commit posterior
al publish `d433df9`). Respaldo previo:
`/root/pre-weekly-performance-20260822.dump`. Produccion cargo TH San Agustin,
semana 33, 7 dias y 5 colaboradores, y genero
`CUOTA-JUSTA-RDS-SEMANA-33.xlsx` valido (51,098 bytes). PM2 quedo con dos
instancias online y `/api/health` en estado `ok`.

Correccion de periodos desplegada el mismo dia: Clarvex `17c1826` y Retool
`ce2b0f3` (commit posterior al publish `ae511d5`). Produccion devolvio RDS S33
con su meta historica de $132,962.06 y CJ S34 por separado; el export fue
`CUOTA-JUSTA-S34-RDS-S33.xlsx` (51,058 bytes). No requirio migracion.

Selectores independientes desplegados el mismo dia: Clarvex `ada8c46` y Retool
`afa34f8` (commit posterior al publish `e617f3f`). Produccion acepto RDS S33 con
CJ S35 en una prueba de solo lectura, demostrando que ya no fuerza semanas
consecutivas. Al guardar el primer borrador, la pareja elegida queda fija para
evitar mover metas ya aplicadas a otra semana.

Exportaciones separadas desplegadas el mismo dia: Clarvex `72c011a`; Retool
`1136ccf`, con commit posterior al publish `586cc23`. Cuota Justa abre en `CJ`, RDS
abre en `RDS` y el archivo completo conserva ambas visibles. Los dos archivos
individuales se abrieron y recalcularon con Microsoft Excel, sin errores de
formula. Produccion genero `CUOTA-JUSTA-S34.xlsx` (51,060 bytes),
`RDS-S33.xlsx` (51,063 bytes) y el combinado (51,057 bytes). La validacion queda
en 900 pruebas, lint, tipos y build limpios; `retool check` pasa sus cuatro
fases, PM2 tiene dos procesos online y health esta `ok`.

Nombres cortos del Excel ajustados el mismo dia: `lib/weekly-close.ts` concentra
la regla y `lib/weekly-performance-xlsx.ts` la aplica a `CJ!C14:C23`,
`CJ!C29:C38` y `RDS!D6:M6`. Validacion local: 900 pruebas, ESLint, tipos y build
limpios. Desplegado en Clarvex `434cc6a`, sin migracion ni cambios en Retool.
Una exportacion real de TH San Agustin confirmo `Itzel`, `Adrian`, `Alonso`,
`Jazmin` y `Waira` en las tres zonas; PM2 quedo con dos procesos online y health
en `ok`.

Guardado independiente preparado el 22 de agosto de 2026: Cuota Justa y RDS ya
no comparten una accion de borrador/cierre. `POST /weekly-performance` acepta
`scope=quota|report`; cuota escribe sus metas y RDS guarda su propio snapshot.
La migracion `20260823004500_weekly_performance_independent_documents` agrega
marcas de guardado separadas y conserva los cierres anteriores. Retool coloca
`Guardar` y `Exportar` dentro de cada seccion, mantiene `Exportar Excel completo`
y avisa si los datos del RDS cambiaron desde su ultimo guardado. Validacion
local: 903 pruebas, ESLint, tipos, build y `retool check` limpios.

Desplegado el 22 de agosto de 2026: Clarvex `3c5a3f0`, migracion aplicada y
Retool funcional `4781945` (commit posterior al publish `c8d3873`). Respaldo en
R2 y S3: `backups/clarvex_team-2026-08-23-01-13.dump`. La prueba real guardo
solo Cuota Justa S34 y confirmo que RDS S33 siguio sin guardar. Build de
produccion limpio, dos procesos PM2 online y health en `ok`.

Exportacion PDF preparada el 22 de agosto de 2026: Clarvex `20edcb3` ya esta
desplegado en Vultr. Produccion genero `CUOTA-JUSTA-S34.pdf` valido (22,408
bytes), una pagina Carta horizontal; PM2 conserva dos procesos online y health
esta `ok`. Validacion local: 905 pruebas, ESLint, tipos y build limpios; Cuota,
RDS y combinado se renderizaron a PNG y se revisaron visualmente sin cortes ni
traslapes. Retool `cfc5e4a` agrega `Exportar Excel` y `Exportar PDF` dentro de
cada seccion y conserva `Exportar Excel completo`. Se publico el 22 de agosto de
2026 despues de renovar la sesion del CLI con el flujo de dispositivo; Retool
avanzo la rama al commit posterior a publicacion `820daca`. `retool push` paso
hooks, validacion, tipos y build, y la publicacion aprobo explicitamente la
funcion de backend modificada.

Correccion del XLSX de RDS desplegada el 22 de agosto de 2026 en Clarvex
`d63da30`, sin cambios en Retool. Las metas del RDS ya se escriben desde
`report.goal` y `report.waMeta`, no mediante formulas hacia la CJ de la semana
siguiente. El exportador tambien expande las formulas compartidas antes de
vaciar espacios sin colaborador y elimina las partes huerfanas de calculo; esto
quita la alerta **Fix it** de Excel. Cuota, RDS y combinado abrieron y
recalcularon en Microsoft Excel sin reparacion. Un RDS S33 generado por la API
real mostro `$12,315.33` de meta y `$118.38` de meta WhatsApp, iguales al JSON
de esa misma semana. Validacion: 905 pruebas, ESLint, tipos y build limpios; PM2
con dos instancias online y health `ok`.

Indicadores del PDF de RDS desplegados el 22 de agosto de 2026 en Clarvex
`2bfe121`, sin cambios en Retool. El PDF replica el formato condicional del
Excel: Punto de venta usa rojo `<85 %`, negro `85-<100 %` y estrella `>=100 %`;
WhatsApp usa rojo `<100 %` y estrella `>=100 %`. Tambien se aplica al total de
tienda y los valores sin datos quedan sin icono. Los marcadores son vectores,
por lo que no dependen de fuentes del servidor. El RDS y el combinado se
renderizaron y revisaron completos. Produccion genero RDS S33 valido de 15,661
bytes con estrella en las cinco personas y el total. Validacion: 906 pruebas,
ESLint, tipos y build limpios; dos PM2 online y health `ok`.

Correccion del estado guardado de RDS desplegada el 22 de agosto de 2026 en
Clarvex `46e4a41`, sin cambios en Retool. El guardado si se realizaba, pero
`reportDirty` seguia en `true` porque el snapshot `jsonb` se comparaba mediante
`JSON.stringify`: PostgreSQL reordena claves y algunos calculos regresan con
ruido de punto flotante. La comparacion ahora es semantica, ignora el orden de
claves, respeta el de arreglos y tolera diferencias numericas menores a
`0.000001`; un cambio real de un centavo sigue detectandose. Produccion confirmo
RDS S33 con `reportDirty=false` y PDF valido de una pagina. Validacion: 908
pruebas, ESLint, tipos y build limpios; dos PM2 online y health `ok`. Retool no
necesito republicarse.

Validacion base anterior: 899 pruebas, ESLint y build de produccion en verde; `retool check`
pasa las cuatro fases locales.

---

## Proyecto

**Nombre:** Clarvex Team  
**Propósito:** Aplicación web interna para gestión de asesores y gerencia en tienda retail.  
**Producción:** https://team.clarvex.tech — desde el 24 de agosto de 2026.
`app.adrianluna.mx` ya solo sirve una pantalla estática de mudanza.  
**Branch principal:** `main`

---

## Stack y versiones

Verificado contra el `package.json` y contra lo que realmente corre en el VPS
(28 de julio de 2026).

### Runtime

| Tecnología | Versión | Nota |
|---|---|---|
| Node.js | 22.23.1 | Misma versión en VPS y en local |
| pnpm | **10.12.1** | Fijado por `packageManager` en `package.json` |
| Ubuntu | 26.04 LTS | En el VPS |
| PostgreSQL | 16 | Imagen `postgres:16` en Docker |

⚠️ **Usar siempre pnpm vía `corepack`**, que respeta el `packageManager`. Un `pnpm`
global de otra versión instala un árbol de dependencias distinto al del servidor.

### Dependencias

| Paquete | Versión en `package.json` |
|---|---|
| next | 15.5.21 |
| react | ^18.3.1 |
| typescript | ^5.7.2 |
| prisma / @prisma/client | 5.22.0 (ambos fijos, sin `^`) |
| tailwindcss | ^3.4.16 |
| web-push | ^3.6.7 |
| @simplewebauthn/server | ^13.3.1 |
| @simplewebauthn/browser | ^13.3.0 |
| recharts | ^3.8.1 |
| zod | ^4.4.3 |
| framer-motion | ^12.40.0 |
| bcryptjs | ^2.4.3 |
| jose | ^6.2.3 |
| @aws-sdk/client-s3 | ^3.1086.0 (para R2) |
| @smithy/node-http-handler | 4.9.5 (transporte IPv4 de R2) |
| @sentry/nextjs | ^10.65.0 |
| exceljs | ^4.4.0 (parser del RDV) |
| sharp | ^0.35.4 (encoge las fotos del visual antes de reconocerlas) |
| @aws-sdk/client-bedrock-runtime | ^3.1116.0 (lector del POS y reconocimiento de zonas) |

---

## Infraestructura

**Producción desde el 24 de agosto de 2026: AWS.**

- **EC2 `t4g.medium`** (Ubuntu 24.04 ARM, 3.7 GB de RAM) en `us-east-1f`,
  instancia `i-06fd0869766482dc1`, IP pública `44.200.176.214`.
- **Ruta de la app:** `/home/ubuntu/clarvex-app`. PM2 corre como `ubuntu`,
  **no como root**, en cluster con 2 instancias.
- Docker — PostgreSQL: `clarvex_postgres` (`postgres:16`), datos en
  `/home/ubuntu/stack/postgres`.
- PostgreSQL — base: `clarvex_team`, host: `localhost`, puerto: `5432`.
- 8 GB de swap; el disco de 30 GB va al **76 %** desde que se bajaron las
  imágenes de los contenedores.

**Vultr (`216.238.88.93`) está APAGADO desde el 27 de agosto de 2026.** Estuvo
tres días congelado como camino de vuelta y ya no hacía falta.

Antes de apagarlo se comprobaron las dos cosas que lo habrían hecho irreversible:
que **ningún registro DNS apuntara allí** —los tres que importan,
`team.clarvex.tech`, `app.adrianluna.mx` y `n8n.adrianluna.mx`, van a
`44.200.176.214`— y que **no hubiera datos que solo existieran en Vultr**: 19
usuarios y 483 KPIs en ambos, con su última escritura el 24 de agosto contra la
de AWS de ese mismo día.

⚠️ **Apagado NO es lo mismo que destruido: Vultr sigue cobrando.** La máquina
se detuvo con `poweroff`, así que se puede volver a encender desde el panel,
pero para dejar de pagarla hay que destruir la instancia. Cuando se haga:
borrar la alarma `clarvex-caido-vultr` (hoy silenciada, no eliminada), subir la
alerta de presupuesto de $20 a algo realista y repetir el barrido de recursos
de costo fijo.

⚠️ **La RAM es escasa** — 3.7 GB en AWS. Los 8 GB que se ven son de **swap**
(`/swapfile`), no de memoria.
Desde que se suben source maps a Sentry, `next build` no cabe en el heap por
omisión y muere con `Reached heap limit`. Por eso el script `build` de
`package.json` fija `--max-old-space-size=6144`: se apoya en el swap, así que
tarda más, pero termina.

⚠️ **Nunca `rm -rf .next` antes de construir en producción.** Los chunks se
sirven desde ahí en caliente: borrarlo tumba el sitio con 500 aunque PM2 siga
`online`, y si el build falla no hay a qué volver. `next build` reemplaza lo que
tiene que reemplazar él solo. Pasó el 24 de agosto de 2026: cuatro minutos de
`/login` en 500.

⚠️ **El usuario de Postgres es `clarvex`, NO `postgres`.** El contenedor se creó
con `POSTGRES_USER=clarvex`, así que el rol `postgres` **no existe**: cualquier
`psql -U postgres` falla con `FATAL: role "postgres" does not exist`. Los únicos
roles son `clarvex` (superusuario) y `retool` (el de solo lectura del panel).

```bash
docker exec -i clarvex_postgres psql -U clarvex -d clarvex_team
```
- Nginx Proxy Manager (contenedor `npm`)
- Cloudflare R2 (fotos de perfil y evidencias)
- Cloudflare DNS

**Ruta de la app:** `/home/ubuntu/clarvex-app`. El `/root/clarvex-app` que este
documento nombra en algun sitio es del servidor VIEJO, que esta apagado.

### Contenedores Docker en el mismo servidor

| Contenedor | Imagen | Para qué | Alcance |
|---|---|---|---|
| `clarvex_postgres` | postgres:16 | Base de datos de la app | interno |
| `npm` | jc21/nginx-proxy-manager | Proxy inverso + TLS | público |
| `mudanza` | nginx:alpine | Pantalla estática de `app.adrianluna.mx` | público |
| `n8n` | n8nio/n8n:2.30.4 | Webhook de fotos → Telegram | público |
| `uptime-kuma` | louislam/uptime-kuma:2 | Monitoreo de `/api/health` | **solo Tailscale** |
| `vaultwarden` | vaultwarden/server | Gestor de contraseñas | **solo Tailscale** |
| `portainer` | portainer/portainer-ce | Administración de Docker | **solo Tailscale** |
| `syncthing` | syncthing/syncthing | Sincroniza la nube personal | **solo Tailscale** |

⚠️ **Seis de los ocho viven en el compose** de `/home/ubuntu/stack/` —todos menos
`clarvex_postgres` y `npm`, que se crearon con `docker run` sueltos y meterlos
ahí los recrearía—. Copia versionada en `scripts/aws-servicios-compose.yml`.

⚠️ **`docker ps` asusta con n8n y no debe.** Publica `0.0.0.0:5678`, pero el
grupo de seguridad no abre ese puerto: comprobado desde fuera, 5678 y 8384 están
cerrados y solo responde el 443. Lo que se ve en `docker ps` es el puerto del
contenedor, no lo que llega de internet.

⚠️ **`npm` hay que conectarlo a mano a la red compartida** con
`docker network connect clarvex_net npm`. El bridge por omisión de Docker no
resuelve nombres de contenedor, así que sin eso los proxys dan **502** sin
decir por qué. Y nginx usa un archivo de resolvers que **npm genera al
arrancar**: si se conecta a la red con el contenedor ya en marcha, hay que
reiniciarlo para que lo regenere.

⚠️ El VPS aloja **más servicios que esta app**. Un `docker compose down` o un reinicio a la ligera tumba también el proxy, el monitoreo y el gestor de contraseñas.

---

## Tailscale: la red privada — 25 de agosto de 2026

Los tres aparatos (`desktop-9jsgakh`, `pixel-10-pro-xl` y `clarvex-aws`) están
en una red privada de Tailscale, dominio `taile59f37.ts.net` con MagicDNS.

### Tres servicios salieron de internet

Vaultwarden, Portainer y Uptime Kuma **ya no tienen DNS público**. Antes
cualquiera en el mundo llegaba a sus pantallas de acceso. Ahora se sirven con
`tailscale serve`, con certificado propio que se renueva solo:

| Servicio | Dirección | Puerto local |
|---|---|---|
| Vaultwarden | `https://clarvex-aws.taile59f37.ts.net` | `127.0.0.1:8080` |
| Portainer | `https://clarvex-aws.taile59f37.ts.net:8443` | `127.0.0.1:9000` |
| Uptime Kuma | `https://clarvex-aws.taile59f37.ts.net:9443` | `127.0.0.1:3001` |

⚠️ **Los clientes de Bitwarden guardan la URL del servidor.** Al mover
Vaultwarden hubo que reconfigurar la extensión del navegador y la app del
teléfono; hasta entonces daban Â«Failed to fetchÂ» sin explicar por qué.

⚠️ **El certificado `npm-2` se reemitió solo para `app` y `n8n`.** Cubría los
cinco dominios; si tres dejan de tener DNS público y no se reemite, la
renovación valida por HTTP-01 y **falla para los cinco**, llevándose por delante
también la pantalla de mudanza y el webhook de fotos.

### El ACL está en `accept`, no en `check`

El bloque `ssh` del ACL usa `"action": "accept"`. Con `check` —el valor por
omisión— Tailscale pide confirmación por navegador **cada 12 horas**, y como el
puerto 22 ya no admite la IP de casa, eso rompería cualquier acceso automatico
dos veces al día.

⚠️ **El término medio no existe en el plan gratuito.** `checkPeriod` es de pago
y además su máximo es 168h. La elección es binaria: `check` cada 12 horas o
`accept`. Se eligió `accept` sabiendo qué se pierde: quien tuviera la PC
desbloqueada y con Tailscale activo entraría al servidor sin segundo factor.

---

## Accesos — el mapa de todas las plataformas

Verificado el 28 de agosto de 2026 contra los sistemas reales, no contra lo que
decía este documento.

> ⚠️ **Aquí NO va ningún secreto.** Este archivo se commitea. Va el sitio, el
> usuario y el método; la contraseña o el token vive donde diga la última
> columna. Si algo pide una credencial que no está en Vaultwarden ni en el
> `.env`, es que falta guardarla, no que se pueda escribir aquí.

| Plataforma | Cómo se entra | Credencial |
|---|---|---|
| **Servidor de producción** | `ssh clarvex-aws` — Tailscale SSH, usuario `ubuntu` | ninguna: la identidad de Tailscale |
| **Cuenta de AWS** | `https://d-90667a3e8a.awsapps.com/start` · CLI: `aws sso login --profile clarvex` | SSO, sesión de 8 h |
| **Clarvex (la app)** | `https://team.clarvex.tech` | PIN, o huella si está registrada en ESE dominio |
| **Retool** | `https://clarvex.retool.com` · app: `/rr/app/captura-clarvex` | dos cuentas, ver abajo |
| **Retool CLI** | `retool auth` desde `D:\Documents\captura-clarvex` | flujo de dispositivo en el navegador |
| **Base de datos** | `docker exec -i clarvex_postgres psql -U clarvex -d clarvex_team` | ninguna desde dentro del servidor |
| **n8n** | `https://n8n.adrianluna.mx` — público | usuario propio de n8n |
| **Vaultwarden** | `https://clarvex-aws.taile59f37.ts.net` | la contraseña maestra |
| **Portainer** | `https://clarvex-aws.taile59f37.ts.net:8443` | usuario propio |
| **Uptime Kuma** | `https://clarvex-aws.taile59f37.ts.net:9443` | usuario propio |
| **Syncthing** | `http://100.64.207.65:8384` — solo por Tailscale | usuario propio |
| **GitHub** | `git@github.com:jhernandezl2c-hash/app.git` | llave SSH del equipo |
| **Cloudflare** | panel web — R2 y DNS | cuenta de Cloudflare |
| **Vultr** | panel web. ⚠️ **La máquina está APAGADA**; encenderla es manual | cuenta de Vultr |
| **Telegram** | `@AdrianAssitBot` (Clarvex) y `@adrianl_bot` (personal) | tokens en el `.env` de n8n |
| **Slack** | espacio `clarvexespacio.slack.com` · app `Clarvex` en `https://api.slack.com/apps` | webhook en el `.env` de n8n; token y firma en el de Clarvex |

**Los cuatro de Tailscale no tienen DNS público.** Salieron de internet el 25 de
agosto de 2026: sin Tailscale conectado no existen, ni siquiera su pantalla de
acceso. ⚠️ **Los clientes de Bitwarden guardan la URL del servidor**, así que al
mover Vaultwarden hubo que reconfigurar la extensión y el teléfono; hasta
entonces daban «Failed to fetch» sin explicar nada.

**Las dos cuentas de Retool no son intercambiables:**

| Cuenta | Para qué |
|---|---|
| `contacto@clarvex.adrianluna.mx` | administración: publicar, invitar, permisos |
| `jhernandezl2c@gmail.com` | operación de tienda, grupo `captura tiendas`, sin permisos elevados |

Se acordó **no usar la administrativa para operar**: es la única forma de
comprobar que el aislamiento por tienda funciona de verdad.

**Dónde vive cada secreto:**

| Tipo | Dónde |
|---|---|
| Variables de la app (37) | `/home/ubuntu/clarvex-app/.env` en el servidor |
| Secretos de n8n | su propio `.env`, en `/home/ubuntu/stack/` |
| `SLACK_ALERT_WEBHOOK` | el mismo `.env` de n8n; el compose lo pasa al contenedor |
| `CLOUDFLARE_API_TOKEN` | variable de entorno de **usuario** en Windows — no aparece en una terminal ya abierta |
| Contraseñas personales | Vaultwarden |
| Perfil de AWS | `~/.aws/` tras `aws sso login` |

⚠️ **El `CRON_SECRET` está en DOS sitios**: el `.env` y repetido en cada línea
del crontab de `ubuntu`. Cambiar uno solo deja todos los crons en 401, y fallan
callados porque nadie mira la salida de un cron que «ya funcionaba».

---

## Acceso al servidor

⚠️ **Producción es AWS desde el 24 de agosto de 2026.** Vultr quedó como camino
de vuelta y **se apagó el 27 de agosto**; el bloque de abajo se conserva por si
alguna vez hay que encenderlo desde el panel.

```bash
ssh clarvex-aws
```

Sin llave y sin contraseña: entra por **Tailscale SSH**, que autentica con la
identidad de Tailscale. El único requisito es tener Tailscale conectado en la
máquina desde la que se entra.

| Dato | Producción (AWS) |
|---|---|
| Entrada | `ssh clarvex-aws` → `clarvex-aws.taile59f37.ts.net` por Tailscale |
| Instancia | `i-06fd0869766482dc1`, `us-east-1f`, IP pública `44.200.176.214` |
| IP en Tailscale | `100.64.207.65` |
| Usuario | `ubuntu` (la app corre como `ubuntu`, **no como root**) |
| Ruta de la app | `/home/ubuntu/clarvex-app` |
| Datos de los contenedores | `/home/ubuntu/stack/` |
| Grupo de seguridad | `sg-0c695d897d47788f7` |

⚠️ **El puerto 22 ya NO admite la IP de casa** (25 de agosto de 2026). Solo
quedan los tres rangos de Retool —`35.90.103.132/30`, `44.208.168.68/30` y
`3.77.79.248/30`—, que son imprescindibles: por ahí entra el túnel que alimenta
toda la captura de la tienda. **Cerrarlo del todo dejaría a la tienda sin poder
capturar.**

El alias `clarvex-aws-directo` sigue en el `~/.ssh/config` con la llave
`~/.ssh/clarvex_aws`, pero **ya no funciona** — apunta a la IP pública. Se deja
a propósito para cuando vuelva a hacer falta.

### Si Tailscale fallara

No hay bloqueo permanente: el cortafuegos sigue siendo nuestro. Dos salidas:

**a) Reabrir el puerto 22 a tu IP** y entrar por el alias directo:

```bash
aws ec2 authorize-security-group-ingress --group-id sg-0c695d897d47788f7 --protocol tcp --port 22 --cidr TU_IP/32 --profile clarvex --region us-east-1
```

Y después entrar con `ssh clarvex-aws-directo`.

⚠️ Este comando llevaba un `\n` literal a la mitad —de un salto de línea que se
escribió mal— así que copiado y pegado **fallaba**. En una salida de emergencia
es donde menos margen hay para averiguarlo.

**b) EC2 Instance Connect**, desde el panel de AWS. No necesita llave ni
Tailscale, solo la sesión de AWS. Es lo que se usó cuando la llave del par de
EC2 resultó perdida.

⚠️ La llave original del par de EC2 **se perdió** y no se recupera: AWS solo
guarda la pública. Ver la memoria `acceso-ssh-instancia-aws`.

### El servidor viejo (Vultr, APAGADO el 27 de agosto de 2026)

> El `ssh` de abajo no responde con la máquina apagada. Para usarlo hay que
> encenderla antes desde el panel de Vultr.

> ⚠️ **Este archivo se commitea al repositorio.** Aquí van solo rutas y nombres de host —
> **nunca** llaves privadas, tokens ni contenido de `.env`.

| Dato | Valor |
|---|---|
| Host | `216.238.88.93` (Vultr) |
| Usuario | `root` |
| Llave privada | `~/.ssh/clarvex_vultr_2026` |
| Alias en `~/.ssh/config` | `clarvex` |

```bash
ssh clarvex
```

⚠️ **La llave que esta página documentó durante meses —`clarvex_vultr`— no
existe.** Se rotó y la buena es `clarvex_vultr_2026`. Usar el alias `clarvex`
evita el problema, porque ya la lleva configurada.

**Nota para Windows:** si la ruta del perfil lleva espacios (`C:\Users\Adrian L\...`), **no** la pases
en `-o UserKnownHostsFile=`: esa opción admite varios archivos separados por espacios y ssh parte
la ruta en dos, fallando con `Host key verification failed`. Usa una ruta sin espacios o entrecomilla
el valor dentro de la propia opción.

**Permisos de la llave:** OpenSSH rechaza llaves privadas accesibles por otros usuarios
(`UNPROTECTED PRIVATE KEY FILE`). En Windows, la llave debe ser **propiedad de tu usuario** y tener
la herencia desactivada:

```powershell
# Las llaves ${...} son obligatorias: sin ellas PowerShell interpreta
# "$env:USERNAME:F" como un nombre de variable e icacls falla con "Parametro no valido".
icacls "$env:USERPROFILE\.ssh\clarvex_vultr_2026" /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:F"
```

Si el archivo pertenece a `BUILTIN\Administradores`, `icacls` falla con «Acceso denegado» sin
elevación. Atajo sin necesidad de administrador: **copiar** el archivo a tu perfil — la copia nace
siendo tuya y ya puedes cerrarle los permisos.

---

## Actualizar la app en producción

**Fuente de verdad: GitHub (`main`).** El VPS solo consume; nunca se edita código directamente ahí.

```bash
# 1. En local — verificaciones obligatorias ANTES de subir
pnpm install
pnpm exec prisma generate
pnpm run build
pnpm exec eslint . --max-warnings 0
pnpm test                      # 984 tests; deben pasar todos

# Preferir SIEMPRE archivos explicitos sobre `git add .`:
git status --short              # revisar que no haya .env, respaldos ni volcados
git add <archivo> [<archivo>...]
git commit -m "descripcion"
git push origin main

# 2. En el servidor de PRODUCCION (AWS)
#    Entra por Tailscale, sin llave. Requiere Tailscale conectado en tu maquina.
ssh clarvex-aws
cd /home/ubuntu/clarvex-app
git pull
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy   # SOLO si el cambio trae migración nueva
pnpm run build
pm2 restart clarvex-team --update-env

# 3. Verificar
pm2 list
curl -s https://team.clarvex.tech/api/health
```

La operación ya no usa «Sincronizar ahora» ni Centro de Datos. Horarios,
Asistencia, KPIs, Descuentos y Ticket electrónico se capturan en Retool; no
reactivar los crons heredados de Excel.

### Comandos útiles en el VPS

```bash
pm2 logs clarvex-team --lines 100   # logs de la app
pm2 restart clarvex-team --update-env
docker ps                            # estado de contenedores
ls /home/ubuntu/logs/                # logs de los crons
df -h /                              # espacio en disco
```

### Crons

⚠️ **Están en el crontab de `ubuntu`, NO en el de `root`** (`crontab -l` entrando
como `ubuntu`). El de root quedo VACIO en la mudanza: buscarlos ahi da cero
lineas y parece que no hay crons. No estan en el repositorio.

Casi todos son `curl` a `/api/cron/*` con `Authorization: Bearer $CRON_SECRET`,
escribiendo a `/home/ubuntu/logs/`. Los dos que no son curl:

- `30 9 * * *` — `pnpm exec tsx scripts/backup-db.ts` (respaldo diario a R2)
- `/home/ubuntu/clarvex-app/cron-plan-reminder.sh` y `cron-pending-overdue-managers.sh`

⚠️ Los horarios del crontab están en **UTC**; los comentarios se refieren a hora de Monterrey.

---

## Variables de entorno

Inventario real del `.env` del VPS (28 de julio de 2026): **37 variables**. La lista
anterior de este documento solo cubría 14 — faltaban Mercado Pago, Power BI, los
proveedores de IA, Zendesk y el bucket de respaldos.

### Núcleo — sin esto la app no arranca

```env
DATABASE_URL=
AUTH_SECRET=            # >= 32 caracteres; en produccion se valida y lanza si es corto
CRON_SECRET=            # Bearer de todas las rutas /api/cron/*
EXCEL_PROXY_WORKER_URL= # Worker que sirve el XLSX del RDV
```

### Cloudflare R2 — fotos y evidencias

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
CLOUDFLARE_ACCOUNT_ID=
```

#### Incidente de subidas del kiosko — resuelto el 13 de agosto de 2026

Fotos, escaneos y PDFs del checklist se quedaban en «Procesando» y no creaban
filas en `ChecklistEntry`/`ChecklistScan`. No era la cámara ni el parser: el
endpoint de Cloudflare R2 publica A y AAAA, pero el VPS no tiene una ruta IPv6
funcional. El transporte del AWS SDK intentaba IPv6 y podía tardar entre 20 y
más de 90 segundos.

La corrección definitiva está en `a20aff1`: `lib/r2.ts` usa un
`NodeHttpHandler` con agente HTTPS `family: 4`, `keepAlive`, límite de conexión
de 5 s y límite de socket de 30 s. `setDefaultResultOrder("ipv4first")` se
conserva como primera defensa, pero **no basta por sí solo**; no retirar el
handler IPv4 mientras el VPS siga sin salida IPv6.

Verificación de producción tras desplegar: health profundo (DB + R2) en 411 ms
y escritura + `HeadObject` en 553 ms; el objeto temporal se eliminó. Pasaron
lint, TypeScript, build y las 687 pruebas. Los intentos fallidos anteriores al
despliegue no llegaron a la base ni al bucket y deben capturarse otra vez.

### Respaldos — bucket y token SEPARADOS de los de la app

```env
BACKUP_R2_ACCESS_KEY_ID=
BACKUP_R2_SECRET_ACCESS_KEY=
BACKUP_R2_BUCKET_NAME=
```

### Notificaciones push (VAPID)

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

### Correo transaccional (Resend) — restablecer el PIN

```env
RESEND_API_KEY=
RESEND_FROM=          # Ej. "Clarvex Team <no-reply@adrianluna.mx>"
APP_URL=              # Opcional: si falta, se usa WEBAUTHN_ORIGIN
```

⚠️ **El dominio de `RESEND_FROM` tiene que estar verificado en Resend.** Sin
verificar, la API responde 403 y el correo no sale. El fallo se registra en los
logs (`[pin-reset]`) pero **al usuario NO se le dice**: contárselo revelaría que
ese número de empleado existe.

Sin estas variables la app sigue funcionando: el restablecimiento por correo
simplemente no manda nada (y lo registra en el log). El login no se rompe.

⚠️ **La mayoría de los usuarios NO tiene correo real.** La app inventa
`<numero>@clarvex.local` al dar de alta a alguien, y a ese dominio no llega
nada. Hay que capturar los correos reales desde el perfil de cada quien o desde
`/equipo`. `hasRealEmail()` en `lib/email.ts` es quien distingue uno del otro.

### Biometría (WebAuthn)

```env
WEBAUTHN_RP_ID=
WEBAUTHN_RP_NAME=
WEBAUTHN_ORIGIN=
```

⚠️ `lib/webauthn.ts` **lanza al importarse** si faltan `WEBAUTHN_RP_ID` u
`WEBAUTHN_ORIGIN` con `NODE_ENV=production` — y `next build` lo es. Sin ellas el
**build falla** en «Collecting page data», aunque el código esté bien. Para compilar
en local basta con ponerlas en `.env.local` con valores de `localhost`.

### Mercado Pago — suscripciones

```env
MP_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
```

> ✅ **Configurado en producción el 23 de agosto de 2026.** Antes faltaba el
> secreto y el webhook respondía **401 a todo**, así que ninguna suscripción se
> acreditaba sola.
>
> `lib/mercadopago-webhook.ts` es *fail-closed*: sin secreto y con
> `NODE_ENV=production`, la verificación falla y
> `app/api/webhooks/mercadopago/route.ts` devuelve 401. No relajar eso.
>
> Verificación de extremo a extremo con **«Simular notificación»** del panel: la
> firma pasó —ninguna línea de «firma inválida»— y el código llegó a consultar
> el pago, que devolvió el `404 Payment not found` de la propia API de Mercado
> Pago porque el pago simulado no existe. Ese 404 confirma de paso que
> `MP_ACCESS_TOKEN` es válido: un token malo habría dado 401. Seis sondas sin
> firmar comprobaron antes que las **dos** instancias de PM2 tenían el secreto.

Se copia de **Mercado Pago → Tus integraciones → la aplicación → Webhooks →
Clave secreta**. La URL de notificación no hay que registrarla: cada preferencia
la manda en `notification_url`, armada con `WEBAUTHN_ORIGIN`, así que sigue sola
al dominio nuevo cuando se haga el corte. El secreto es de la aplicación, no del
dominio, y también sobrevive la mudanza.

⚠️ **`verifyMpSignature` devuelve un MOTIVO, no un booleano** (`532d0dd`). Los
dos «no» significan cosas opuestas y antes escribían la misma línea de log:

| Motivo | Qué es |
|---|---|
| `sin-secreto` | error de configuración **nuestro**: se caen todos los pagos |
| `sin-firma` / `no-coincide` | la defensa funcionando: alguien firmó mal |

Solo `sin-secreto` manda aviso a Telegram, con freno de seis horas por proceso.
Una firma que no cuadra **no avisa a propósito**: el endpoint es público y
cualquiera convertiría el canal en su timbre mandando basura firmada al azar.
El manifiesto usa el id en minúsculas, como lo arma Mercado Pago.

### Inteligencia artificial

```env
AI_PROVIDER=            # selecciona el proveedor activo
GEMINI_API_KEY=
GROQ_API_KEY=
CLOUDFLARE_AI_TOKEN=
```

#### Lectura del reporte del POS — Bedrock, con Gemini de respaldo

```env
BEDROCK_ACCESS_KEY_ID=
BEDROCK_SECRET_ACCESS_KEY=
BEDROCK_POS_MODEL=      # opcional; por omisión us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_REGION=         # opcional; por omisión us-east-1
VISUAL_RECONOCER_MODEL= # opcional; por omisión us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

⚠️ **Las mismas credenciales sirven a DOS funciones con modelos distintos.** El
lector del POS usa Haiku, que transcribe una tabla; el reconocimiento de zonas
del visual usa Sonnet, porque con Haiku acierta 11 de 13 y confunde dos zonas.
Ver la seccion «Reconocer la zona sin pie de foto» dentro de «Captura por
Telegram», al principio de este documento.

Desde el 21 de agosto de 2026 `lib/pos-vision.ts` intenta **Bedrock primero** y
deja **Gemini de red**. Medido con una captura real: 12 de 12 campos correctos
en 3.7 s, contra los 10-15 s de Gemini. Sin estas variables no se activa y todo
sigue como antes.

⚠️ **Nombre propio, no `AWS_*`.** El cliente de R2 también es del SDK de AWS;
unas variables genéricas sueltas en el entorno podrían acabar mandando las fotos
a otra parte.

⚠️ **El ID del modelo lleva prefijo `us.`** — es el perfil de inferencia. El ID
que aparece en el catálogo de Bedrock **no se puede invocar directo**.

⚠️ **Bedrock envuelve el JSON en ` ```json `.** `stripCodeFence` lo quita; sin
eso el parseo falla siempre, y falla al final con el trabajo ya hecho.

Las credenciales salen del usuario IAM **`clarvex-bedrock`**, acotado a invocar
modelos de Anthropic y nada más. **Es temporal: sobra el día que la app corra en
EC2** — ver `AGENTS.md`, sección AWS.

#### Cómo se prepara la imagen antes de mandarla (`frontend/utils/shrinkImage.ts` en Retool)

Tres hallazgos del 21 de agosto de 2026, todos medidos contra el mismo reporte
real. Van juntos porque tirar de uno rompe otro:

1. ⚠️ **Una captura PEQUEÑA se AGRANDA.** Contra toda intuición. La ventana del
   visor del POS mide 1024 px y ahí cada dígito queda de ocho o nueve píxeles:
   el modelo leía `4,498` como `4499` y «JAZMIN» como «JASMIN». Al doble, la
   misma imagen y el mismo modelo la leen perfecta. Lo confirmó el caso opuesto:
   una **foto del monitor** de 4080 px se leía BIEN pese a estar peor tomada.
   **Manda cuántos píxeles tiene cada dígito, no lo nítida que se ve.**
2. ⚠️ **No recomprimir lo que ya cabe.** Una versión anterior pasaba a JPEG
   cualquier imagen de más de 400 KB aunque no hiciera falta reducirla. Una
   captura es texto nítido: al 85 % los dígitos finos se emborronan y empieza a
   leer mal.
3. ⚠️ **Al agrandar, JPEG al 95 %, no PNG.** El PNG conserva todo pero pesaba
   788 KB en base64 contra 418 en JPEG. Ese archivo **sube dos veces** —al panel
   y de ahí al servidor—, así que el peso se paga doble: con PNG la captura
   tardaba **hasta un minuto** aunque el servidor respondiera en 3.4 s.

Medido para separar culpas: `readPosReport` en el servidor tarda **3.4 s** con
la lectura correcta. Todo lo que exceda eso es subida, no modelo.

**El PDF exportado sigue siendo lo más exacto y lo más ligero** (~32 KB): el
modelo lee su texto embebido en vez de descifrar píxeles.

### Power BI

```env
POWER_BI_APP_TENANT_ID=
POWER_BI_CLIENT_ID=
POWER_BI_CLIENT_SECRET=
POWER_BI_REDIRECT_URI=
POWER_BI_TOKEN_ENCRYPTION_KEY=
```

### Zendesk — soporte

```env
ZENDESK_SUBDOMAIN=
ZENDESK_EMAIL=
ZENDESK_API_TOKEN=
```

### Opcionales

```env
# Sentry — monitoreo de errores. Sin DSN, Sentry queda desactivado (no-op).
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=          # solo para subir source maps
SENTRY_PROJECT=      # solo para subir source maps
SENTRY_AUTH_TOKEN=   # solo para subir source maps
```

✅ **Configurado en producción el 24 de agosto de 2026.** Sin las tres, las
trazas llegaban minificadas (`at u (chunks/6834-….js:18:106653)`) y no había
forma de leerlas; el build tampoco avisaba, porque `silent: true`. El token es
personal, con **solo dos permisos**: `project:releases` (crear la release y
adjuntarle los mapas) y `org:read` (para que el CLI encuentre la organización).
Nada más — no puede leer errores ni tocar la configuración.

Se comprueba desde fuera, sin entrar a Sentry: los chunks servidos traen
`_sentryDebugId`. Si no aparece, no se están subiendo.

⚠️ Activarlo **dispara la memoria del build** — ver la advertencia de RAM en
[Infraestructura](#infraestructura).

Además, `instrumentation-client.ts` retitula en español lo que llega del
navegador (`lib/sentry-humanize.ts`) y baja los cortes de red a `warning`, así
que lo que queda en rojo es lo accionable. **Se retitulan, no se descartan**: un
`AbortError` fue justo lo que delató tres componentes globales sin `.catch`.

```env
# Webhook de fotos → n8n → Telegram. Sin WEBHOOK_URL queda desactivado.
WEBHOOK_URL=
WEBHOOK_STORE_IDS=   # obligatorio para activarlo: lista de storeId separados por coma
WEBHOOK_SECRET=      # se manda como header X-Clarvex-Secret

# Otras presentes en el VPS
FOOTBALL_API_KEY=
```

⚠️ **Nunca respaldar el `.env` dentro del repositorio.** `.gitignore` ya cubre
`.env.bak*`, pero antes no lo hacía: un `git add .` habría subido todos estos
secretos a GitHub.

## Fotos a Telegram y alertas a Slack (n8n)

Cuando un asesor sube una **evidencia** o un **faltante con foto**, la app avisa a un webhook de n8n, que reenvía la imagen a un canal de Telegram con un pie de foto identificable (quién, de qué, cuándo).

- El mensaje lo arma **la app** (`lib/webhook-caption.ts`), no n8n. El flujo de n8n es: Webhook → Telegram `sendPhoto` con `caption` + `imageUrl`.
- **Fire-and-forget** (`lib/webhooks.ts`): timeout de 5 s y nunca lanza. Si n8n está caído, la evidencia se guarda igual — no se rompe una subida por una notificación.
- **Filtro por tienda obligatorio:** sin `WEBHOOK_STORE_IDS` no se manda nada. Al ser multi-tienda, las fotos de una tienda no pueden acabar en el canal de otra.
- La `imageUrl` es una URL **firmada de 6 h** (el bucket R2 es privado); ese margen le permite a n8n reintentar.
- ⚠️ Las fotos salen de la infraestructura propia: quien esté en el canal las ve.

### Alertas de operación por el mismo webhook — 22 de agosto de 2026

El workflow activo `Clarvex — Fotos y PDF a Telegram`
(`l8q88gnWzcwYDpvp`) ahora bifurca el payload antes de tocar archivos:

```text
Webhook → Es alerta?
              true  → Slack - Alerta      (desde el 28 de agosto de 2026)
              false → Es PDF?
                           true  → Telegram - Documento (PDF)
                           false → Telegram - Foto
```

- El contrato es `body.format`: `alert`, `document` o `photo`.
- Una alerta usa `body.title` y `body.text`; no intenta leer `imageUrl`.
- La copia versionada del flujo es `scripts/n8n-fotos-telegram.json`. Antes solo
  existía `scripts/n8n-add-alert-routing.jq`, que **no era el flujo** sino un
  parche a aplicar sobre lo que hubiera en el servidor.

### Las alertas técnicas van a Slack — 28 de agosto de 2026

La rama `alert` sale por Slack; **las fotos y los PDF siguen en el grupo de
Telegram**. Ahí es donde está el equipo, y **once de dieciocho usuarios tienen
correo inventado** (`<número>@clarvex.local`), con el que no se puede invitar a
nadie a Slack. Mover las evidencias los dejaría sin verlas.

| Alerta | Dónde |
|---|---|
| Infraestructura (`/webhook/alerta-infra`) | Slack |
| Mercado Pago: secreto faltante | Slack |
| Auditoría del kardex | Slack |
| Uptime Kuma | Slack **y** Telegram, en paralelo a propósito |
| Fotos, faltantes y PDF del equipo | Telegram, grupo |

- Se usa un **nodo HTTP contra el Incoming Webhook**, no el nodo de Slack de
  n8n: ese pide credenciales OAuth que hay que crear, guardar y renovar; el
  webhook es una URL. La URL vive en `$env.SLACK_ALERT_WEBHOOK` —definida en
  `/home/ubuntu/stack/.env` y pasada por el compose—, **nunca dentro del flujo**,
  que se versiona en este repositorio.
- ⚠️ **El texto va PLANO, sin Block Kit ni marcado.** Es la lección de Telegram:
  allí n8n forzaba `parse_mode=Markdown` y un mensaje de error con corchetes
  rompía el envío del propio aviso, así que un fallo salía mudo.
- ⚠️ **n8n devuelve `200` al RECIBIR el webhook, no al terminar el flujo.** Una
  alerta puede fallar entera con la petición en verde. Para saber si de verdad
  salió hay que mirar el estado de la ejecución en la base de n8n:

```bash
docker cp n8n:/home/node/.n8n/database.sqlite /tmp/n.sqlite
docker cp n8n:/home/node/.n8n/database.sqlite-wal /tmp/n.sqlite-wal
```

  ⚠️ **El `-wal` no es opcional.** Sin él las ejecuciones de los últimos minutos
  no aparecen y parece que el webhook ni llegó. Misma trampa que con Vaultwarden.

- La app **no sabe nada de Slack ni de Telegram**: manda todo a `WEBHOOK_URL` y
  n8n decide. Cambiar de destino no toca Clarvex.

## Espejo del chat con Slack — 29 de agosto de 2026

El chat de Clarvex y un canal de Slack son la misma conversación. El equipo
sigue en Clarvex con su PIN; la gerencia lee y contesta desde Slack.

```
Asesor escribe en Clarvex  →  sale en el canal con SU nombre
Contestas en Slack         →  entra en Clarvex como tú, con push al equipo
```

⚠️ **Lo que lo hace posible es `chat:write.customize`.** Deja que el bot
publique con el `username` de cada quien, así que **nadie del equipo necesita
cuenta de Slack** — que era el muro: once de dieciocho usuarios tienen correo
inventado (`<número>@clarvex.local`) y no se les puede invitar.

| Variable | Qué es |
|---|---|
| `SLACK_BOT_TOKEN` | el `xoxb-` de la app |
| `SLACK_SIGNING_SECRET` | 32 hex. ⚠️ **No es el `xapp-`**, que está al lado en la misma pantalla |
| `SLACK_CHAT_CHANNELS` | `storeId=C0…`, separados por coma |
| `SLACK_CHAT_AUTHORS` | `U0…=<númeroDeEmpleado>`, separados por coma |
| `SLACK_DM_CHANNELS` | `<idDeSala>=C0…` — un canal PRIVADO por chat directo |

- ⚠️ **Clarvex es el DUEÑO del mensaje; Slack es una ventana.** No se sincronizan
  ediciones, borrados, hilos ni reacciones: borrar en Clarvex deja el mensaje en
  Slack, y es a propósito. Con dos dueños del mismo dato, un fallo de red deja
  los lados distintos y ya no se sabe cuál vale.
- ⚠️ **Los chats DIRECTOS van a un canal privado PROPIO cada uno**, nunca al de
  la tienda y nunca todos juntos. Con uno compartido las conversaciones caerían
  mezcladas y una respuesta no tendría destinatario: acabaría en la
  conversación equivocada.
- ⚠️ **Un directo solo se refleja si quien lo lee desde Slack es UNA DE LAS DOS
  PERSONAS**, y se comprueba contra `ChatMember`, no contra la variable de
  entorno (`puedeReflejarse` en la ruta del chat). No es teórico: en TH San
  Agustín existe un chat entre **Jazmín y Waira**, con mensajes, en el que la
  gerencia no participa. Mapearlo por error lo publicaría, y la configuración la
  escribe una persona.
- ⚠️ **El eco se corta dos veces**: se ignora todo evento con `bot_id` o
  `app_id`, y además por construcción — lo que entra por Slack se crea en el
  webhook, que no pasa por el enganche del espejo.
- ⚠️ **Un remitente de Slack sin mapear se IGNORA**, no se atribuye a nadie por
  omisión. Un mensaje firmado por quien no lo escribió es peor que uno perdido.
- ⚠️ **Sin `icon_url`.** La foto vive en R2, que es privado, y su única URL
  caduca a las 6 h; Slack la resuelve al pintar, así que el avatar se rompería
  en todo el historial.
- ⚠️ **Slack contesta `200` aunque falle**: el error va dentro del cuerpo, en
  `ok:false`. Mirar solo el código HTTP daría por bueno un `channel_not_found`.
- ⚠️ **El bot tiene que estar EN el canal** (`/invite @Clarvex`) o responde
  `not_in_channel`.
- El endpoint `POST /api/webhooks/slack` responde **200 pase lo que pase**, salvo
  firma inválida. Slack reintenta y acaba desactivando la suscripción si el
  fallo insiste; un mensaje que no se supo colocar no puede costar los demás.
- ⚠️ **Un evento ignorado se escribe en el log con su motivo.** Sin esa línea,
  un evento descartado y uno que nunca llegó se ven idénticos desde fuera —
  `200` y silencio— y averiguar cuál era costó una vuelta entera.

### Los dos eventos, según el tipo de canal

⚠️ **Slack usa eventos DISTINTOS y hay que suscribirse a los dos:**

| Evento | Canales | Permiso |
|---|---|---|
| `message.channels` | públicos (`#tienda-san-agustin`) | `channels:history` |
| `message.groups` | **privados** (`#dm-*`) | `groups:history` |

Con solo el primero, los canales privados no mandan **nada** —ni un error— y
parece que el espejo está roto. Pasó al crear los `dm-*`.

### `file_share` es un mensaje, no un subtipo a tirar

⚠️ Un mensaje **con foto adjunta** llega con `subtype: "file_share"`. El código
ignoraba todos los subtipos —edición, borrado, entrada al canal— y con ellos se
tragaba el mensaje entero, **texto incluido**. Se descubrió con el primero real:
un comunicado largo con un flyer, perdido sin dejar rastro.

### Las fotos cruzan en los dos sentidos — 29 de agosto de 2026

`lib/slack-archivos.ts`. Necesita `files:read` y `files:write`.

- **Slack → Clarvex**: se baja con el token, se sube a R2 y se guarda con el
  mismo formato `[img:…]` que usa el chat de la app.
- **Clarvex → Slack**: antes se publicaba el texto crudo
  `[img:/api/chat/file?k=…]` en el canal — ilegible, y enseñando cómo se guardan
  las cosas por dentro.
- ⚠️ **Slack retiró `files.upload`.** Son TRES pasos: pedir una URL
  (`files.getUploadURLExternal`), subir los bytes **a esa URL, que no es la de la
  API**, y `files.completeUploadExternal` diciendo a qué canal va. Saltarse el
  tercero deja el archivo subido y sin publicar, **sin dar error**.
- ⚠️ **La URL de descarga es privada.** Sin la cabecera de autorización, Slack
  devuelve su pantalla de acceso **en HTML y con código 200**: se guardaría eso
  como si fuera la foto.
- La foto va en su **propio mensaje y DESPUÉS del texto**: el chat exige que el
  cuerpo de una imagen sea exactamente `[img:…]`, y así un fallo al traerla no se
  lleva por delante el comunicado. Si no se pudo, se dice — el equipo puede
  pedirla — en vez de callar.
- Tope de **8 MB** y **solo imágenes**: un PDF o una hoja de cálculo no tienen
  sitio en el chat de la app.

### Montarlo desde cero

Permisos del bot: `chat:write`, `chat:write.customize`, `channels:read`,
`channels:history`, `groups:read`, `groups:history`, `groups:write`,
`files:read`, `files:write`, `incoming-webhook`.

⚠️ **Después de añadir un permiso o un evento hay que REINSTALAR la app**, o
queda pedido y no concedido sin que nada avise.

⚠️ **Un canal privado que crea el bot solo lo ve el bot.** Hay que invitar a la
persona con `conversations.invite`; si no, los mensajes se publican
correctamente en un canal que nadie mira — y eso no se nota.

⚠️ **El Slack CLI está instalado pero NO sirve para esto.** Gestiona manifiestos
de apps creadas por él; la nuestra se creó en el navegador y su manifiesto lo
administra Slack. Las suscripciones a eventos se activan ahí, y hay que
**reinstalar la app** después de añadir el evento o el permiso queda pedido y no
concedido, sin que nada avise.
- Respaldo anterior en el VPS:
  `/root/n8n-workflow-backups/20260822-before-alert-routing-v6.json`.
- Prueba completa de las tres ramas sobre la versión publicada
  `e06417f4-2bd6-41a5-82fa-15394849e78d`: ejecución `140` → alerta,
  `141` → foto y `142` → documento PDF. Las tres terminaron en `success` y
  cada una ejecutó únicamente su nodo final correspondiente de Telegram.

## Backups

- **Script:** `scripts/backup-db.ts` (pg_dump → R2 bajo `backups/`, retención 30 días). Corre por crontab diario en el VPS.
- **Bucket aislado:** los respaldos deben ir a un bucket R2 **propio**, con su **propio token** (`BACKUP_R2_*`). Si comparten bucket y credenciales con la app, la misma llave que sube las fotos puede borrar los backups — un VPS comprometido destruiría datos y copias de un tirón.
- **Restaurar:** `docker exec -i clarvex_postgres pg_restore -U clarvex -d clarvex_team --clean --if-exists < archivo.dump`

  ⚠️ **`-U clarvex` no es opcional**: sin él `pg_restore` asume el rol `postgres`,
  que en este contenedor no existe, y falla. Se descubrió el 24 de agosto de
  2026 corriendo un `psql` a mano; el día que haga falta restaurar de verdad no
  es momento de averiguarlo. Ver [Infraestructura](#infraestructura).

## Monitoreo

- **Health-check:** `GET /api/health` (público, sin sesión) — verifica la BD. Devuelve `200 {status:"ok"}` o `503 {status:"degraded"}`. Consumido por Uptime Kuma en el VPS.
- **Chequeo profundo:** `GET /api/health?deep=1` con header `Authorization: Bearer <CRON_SECRET>` — además verifica R2 (HeadBucket).
- **Errores en producción:** Sentry (`@sentry/nextjs`). Session Replay desactivado a propósito (grabaría datos de ventas y empleados).

---

## Roles de usuario

### ASESOR / VENDEDOR
- Ve **solo** sus ventas, metas y KPIs personales.
- NO ve ventas ni metas de otros asesores.
- NO ve metas de tienda.
- Ve sus propios horarios.
- Ve sus propios pendientes asignados.
- NO tiene botón de eliminar en comunicados, planes ni pendientes.

### GERENTE / SUBGERENTE
- Ve KPIs de tienda completos.
- Ve KPIs por asesor individualmente.
- Ve horarios de todo el equipo.
- Crea y gestiona comunicados.
- Crea, reasigna y cierra pendientes.
- Accede a evidencias y comentarios de todos.
- Tiene botón eliminar en comunicados, planes del día y pendientes (con confirmación).

---

## Fuente de datos — RDV (SharePoint XLSX)

> ⚠️ **Desde el 11 de agosto de 2026 esta vía está caída para cinco de las seis
> fuentes**: Axo deshabilitó los enlaces anónimos. Se está sustituyendo por
> captura propia — ver `AGENTS.md`. La estructura de columnas de abajo sigue
> siendo la referencia de qué significa cada dato y qué tiene que producir la
> captura nueva, así que **no se borra**.

El Worker descarga el archivo como **XLSX** desde `EXCEL_PROXY_WORKER_URL` usando `exceljs`.

### Hojas del Excel

| Hoja | Filas | Uso |
|---|---|---|
| Diario de ventas | 55 | Datos diarios por empleado |
| Informe | 84 | — |
| KPIs Generales PDV | 30 | KPIs de tienda ya calculados |
| KPIs x Colaborador | 18 | KPIs individuales por asesor |
| COMISIONES | 18 | Cálculo de comisiones y bonos |

### Estructura hoja "Diario de ventas"

- Fila 1: Metadata (MARCA, CENTRO COMERCIAL, etc.)
- Fila 5: Roles (GERENTE, SUBGERENTE 1... TOTALES)
- Fila 6: Números de empleado
- Fila 7: Nombres completos
- Fila 9: Headers de columnas por empleado
- Filas 10+: Datos diarios
- Fila TTLS: Totales del mes

**Mapeo de columnas por empleado** (bloque de 11 cols):

| Offset | Campo |
|---|---|
| +0 | Meta diaria |
| +1 | VTAS Ttls SIN IVA (Venta) |
| +2 | TX Ttls (Tickets) |
| +3 | Unid Ttls (Piezas) |

| Empleado | Col inicio |
|---|---|
| GERENTE | 3 |
| SUBGERENTE 1 | 14 |
| SUBGERENTE 2 | 25 |
| VENDEDOR 1 | 36 |
| VENDEDOR 2 | 47 |
| VENDEDOR 3 | 58 |
| ... (cada 11 cols) | |
| TRÁFICO | 168 (col única) |
| TOTALES Meta | 169 |
| TOTALES Venta | 170 |
| TOTALES TX | 171 |
| TOTALES Unid | 172 |

---

## KPIs — Fórmulas

```
UPT        = piezas / tickets
AUR        = venta / piezas
EPT        = venta / tickets
Conversión = tickets / tráfico
Alcance    = venta / meta  (expresado en %)
```

Si algún divisor es 0, null o undefined → mostrar `—` en lugar de 0.

**Vista Mes:** suma de todos los días del mes retail.
**Vista Semana:** suma únicamente de los días de esa semana retail. Consultas completamente independientes — NO compartir datos entre semana y mes.

**Meta asesor:** suma de "Meta diaria" de su columna en el RDV para el período.
**Meta gerente/subgerente:** meta de tienda (TOTALES col 169).

**Tráfico:** col 168 del RDV — usarlo solo para Conversión de tienda.

**Importante:** Semana y mes usan **calendario retail**, NO calendario gregoriano.

---

## Comisiones — Brackets por rango de alcance

| Puesto | ≤ 99.99% | 100% – 114.99% | ≥ 115% |
|---|---|---|---|
| GERENTE | 1.25% | 1.56% | 1.87% |
| SUBGERENTE | 0.93% | 1.16% | 1.39% |
| VENDEDOR | 1.53% | 1.91% | 2.29% |

### Reglas críticas de comisión — YA IMPLEMENTADAS, NO CAMBIAR

**Alcance para comisión = Venta / MÍNIMO** (NO venta/meta)

**ASESOR/VENDEDOR:**
- Venta = su venta individual
- Mínimo = su mínimo individual de la hoja COMISIONES
- Alcance = venta individual / mínimo individual

**GERENTE/SUBGERENTE:**
- Venta = venta total de tienda (TOTALES)
- Mínimo = mínimo de tienda (TOTALES de la hoja COMISIONES)
- Alcance = venta tienda / mínimo tienda

El % de comisión difiere por puesto pero el mínimo de referencia es el mismo para gerente y subgerente.

---

## Estado actual del proyecto — 28 de agosto de 2026

> 📌 **Lee primero el bloque «EN QUÉ ESTAMOS AHORA» al inicio de `AGENTS.md`.**
> Ahí está el contexto completo de la migración en curso: qué se rompió, qué se
> quiere lograr, hasta dónde vamos y qué reglas nuevas no hay que romper.

### 🔴 Abierto — requiere acción

- ✅ **`CRON_SECRET` rotado** la noche del 24 de agosto de 2026, durante el
  corte a AWS. Se hizo ahí porque era gratis: el `.env` y el crontab se
  escribieron en la misma operación, que es justo donde estaba la trampa.
  El valor viejo murió con el crontab de Vultr.

  ⚠️ **El `.env` y el crontab tienen que moverse a la vez.** El secreto vive en
  los dos sitios: `CRON_SECRET` en `/home/ubuntu/clarvex-app/.env` y repetido en cada
  línea `curl` de `crontab -l`. Cambiar solo uno deja **todos** los crons
  respondiendo 401 — y fallan calladamente, porque nadie mira la salida de un
  cron que «ya funcionaba». También lo usa el chequeo profundo
  `GET /api/health?deep=1`, que es de donde conviene confirmar el cambio.

- **AWS está en marcha desde el 21 de agosto de 2026.** Cuenta `775711761052`,
  acceso por SSO con el perfil `clarvex`, alerta de presupuesto de $20/mes
  **midiendo antes de los créditos**. Bedrock ya lee el reporte del POS en
  producción y los respaldos se copian también a S3, con una llave que **solo
  puede escribir**.

  Los créditos de Activate se emitieron el **24 de agosto de 2026**: crédito
  `10066304006`, $1,000 USD, `Promotion`, activo.

  ⚠️ **No son anuales** —como decía antes esta línea— sino un único importe
  que **vence el 31 de agosto de 2028**. No se renueva: lo que no se gaste para
  entonces se pierde, y después de esa fecha AWS se paga entero.

  ⚠️ **Lo consumido ANTES del 24 de agosto no lo cubre el crédito.** Bedrock
  llevaba en producción desde el 21 y los respaldos ya iban a S3, así que ese
  consumo se facturó a la tarjeta. El historial de uso del crédito en cero no es
  un fallo: empieza a contar desde su emisión.

  **Productos aplicables ya revisado** (24 de agosto de 2026): la lista cubre
  todo lo que la migración necesita —EC2, S3, Bedrock, Data Transfer, VPC,
  Certificate Manager, Route 53, CloudWatch y RDS—, además de **SES**, que es
  una alternativa al envío por Resend ahora que la pagaría el crédito.

  ⚠️ **EBS no aparece por nombre** en la lista. No es un descuido: AWS lo
  factura dentro de «Amazon Elastic Compute Cloud», así que debería entrar. Se
  confirma en la primera factura, viendo si el crédito se aplicó a esa línea.

  ⚠️ Los créditos promocionales suelen excluir el **registro de dominios en
  Route 53** y las compras de **AWS Marketplace**, aunque el servicio esté
  listado. Hoy no se usa ninguno; importa si en el corte se mueve el dominio.

  ⚠️ **La alerta de $20/mes se va a disparar** en cuanto EC2 corra a tiempo
  completo: una instancia ARM equivalente al VPS ronda los $25-30 mensuales con
  disco. No será un fallo, sino un umbral por debajo del costo normal —subirlo
  al hacer el corte, o se vuelve una alerta que nadie mira. Con ese gasto, los
  $1,000 dan más margen que los 24 meses que quedan hasta el vencimiento.
- ✅ **La migración a AWS SE COMPLETÓ** la noche del 24 de agosto de 2026.
  Producción es **`team.clarvex.tech`** sobre EC2 `t4g.medium` en `us-east-1`
  (Ubuntu 24.04 ARM, Postgres 16 en Docker, PM2 en cluster, 8 GB de swap).

  ⚠️ **Las reglas de convivencia YA NO APLICAN y estaban invertidas aquí.**
  Los 16 crons corren **solo en AWS**; el crontab de Vultr quedó vacío. La
  captura real ocurre **en AWS**. Lo contrario —que es lo que decía este
  documento hasta el corte— desharía la mudanza.

  ✅ **Vultr se apagó el 27 de agosto de 2026**, tras tres días congelado como
  camino de vuelta. Ver [Infraestructura](#infraestructura) para lo que se
  comprobó antes y para lo que falta: **apagado no es destruido, y Vultr sigue
  cobrando** hasta que se destruya la instancia.

  El guion completo del corte, con lo que falló y por qué, en `CORTE-AWS.md`.
  Pendiente ligado: **borrar el usuario IAM `clarvex-bedrock`** y pasar la app
  al rol de instancia.
- **El aviso de cambio de dominio ya está implementado.** En
  `app.adrianluna.mx` aparece una banda global con Marquee y Animated Beam que
  anuncia `team.clarvex.tech` y explica que la huella se registrará otra vez.
  No aparece ni enlaza al servidor AWS mientras las bases conviven, para evitar
  capturas que se perderían con el volcado final. Se desplegó en Vultr como
  `c48d95e`; respaldo previo
  `/root/pre-domain-banner-c48d95e-20260821.dump`, migración WebAuthn aplicada,
  dos procesos PM2 `online` y health correcto. AWS no se tocó.
- **La app está ABIERTA** desde el 13 de agosto de 2026. El VPS tiene
  `MAINTENANCE_MODE=0`; ambas instancias PM2 están `online`, `/api/health`
  responde correctamente y el acceso normal llega a `/login` sin mostrar la
  ventana de mantenimiento. La difusión de reapertura se envió a 19 usuarios
  activos después de completar esas verificaciones.
- **La comunicación de reapertura ya está desplegada.** El
  anuncio global de agosto explica por qué se dejó de depender de los Excel,
  presenta la integración de Retool y reconoce la doble captura temporal. Solo
  `GERENTE`/`SUBGERENTE` reciben el botón **Conocer la nueva captura**, enlazado
  a `https://captura.adrianluna.mx/rr/app/captura-clarvex`; asesores continúan
  dentro de Clarvex y el kiosko no ve el aviso. El push se envió con el título
  `Clarvex vuelve a estar disponible`. Adrian continúa reuniendo los correos
  restantes para invitarlos a Retool y comprobar su aislamiento por tienda.
- **Cinco de las seis fuentes de datos están caídas desde el 11 de agosto**:
  Axo deshabilitó los enlaces anónimos de SharePoint. Lo que sigue en esta
  página sobre el RDV describe un mecanismo que **ya no funciona** para esas
  fuentes; solo sobrevive `GUESS / KPIS`, que pasa por Power Automate.
- **Se descartó la incrustación, no Retool.** «Captura Clarvex» usa el nuevo App
  Builder, que todavía no admite iframe externo. La decisión vigente es invitar
  a gerentes/subgerentes como usuarios internos de la organización y que entren
  directamente a `captura.adrianluna.mx`. Los atributos `storeId`, `storeName`
  y `role` ya están creados sin valor predeterminado; el grupo `captura tiendas`
  ya fue verificado con acceso **Use** únicamente a «Captura Clarvex» y sus dos
  recursos necesarios. `All Users` no concede acceso a apps ni recursos y sus
  permisos globales para Assist y para construir apps con IA quedaron
  desactivados; `External Apps` permanece desactivado. Las capturas originales
  y Ticket electrónico ya se validaron de extremo a extremo con la cuenta
  operativa. El branding ya usa
  nombre **CLARVEX TEAM**, acento `#2563EB`, cabecera `#0B0C0F` y referencias adicionales a
  Retool ocultas. Logo `public/icon-512.png` y favicon `public/favicon.ico` ya
  están cargados, y el logo está habilitado en los encabezados de las apps.
  El logo cuadrado se ve demasiado grande en el login; existe un candidato
  horizontal 1200 × 300 en `public/branding/retool-logo-horizontal.png`, con su
  fuente SVG. Adrian lo aprobó y **ya está cargado en Retool**; se verificó en
  la vista previa del login y en el encabezado. El favicon no cambió.
  La cuenta administrativa de Adrian no se usará para operación. Se acordó
  crear otra cuenta interna, limitada a `captura tiendas`, con atributos
  `SUBGERENTE`, `clarvex-demo-store` y `TH SAN AGUSTIN`. El correo será
  `jhernandezl2c@gmail.com`; la invitación ya fue aceptada y la cuenta está
  activa, con `All Users` y `captura tiendas`, sin grupos elevados. Los tres
  atributos ya están guardados y verificados. Ojo: en User attributes hay que
  pulsar Enter en cada campo para persistirlo. «Captura Clarvex» ya fue
  republicada como parche `0.0.2` con **Always publish latest changes**: el
  enlace limpio del dominio personalizado abre Horarios y reconoce
  `TH SAN AGUSTIN` sin mostrar el aviso de republicación. En el grupo `captura
  tiendas` → **Additional**, la **Landing page** quedó fijada en «Captura
  Clarvex», por lo que el siguiente inicio de sesión de la cuenta operativa debe
  enviarla directo a la app; la raíz del dominio conserva la página general de
  Retool si alguien navega a ella manualmente. La primera prueba real de
  Asistencia ya pasó de extremo a extremo: el 13 de agosto a las 09:39 se creó
  en producción la fila de Itzel (`81893`) para `TH SAN AGUSTIN`, con llegada
  `12:00`, `source=MANUAL` y 90 minutos tarde. Esa prueba aclaró la regla real:
  hasta +14 min es `ON_TIME`; de +15 a +29 min es `LATE` sin tocar el banco;
  desde +30 min es `EXCUSED` (permiso de entrada tarde) y se descuenta la
  diferencia completa del banco; solo la falta de marca o el texto `FALTA`
  produce `ABSENT`. Las bandas son relativas al horario individual. KPIs ya se
  guardó correctamente desde la cuenta operativa. El contador que mostró `4`
  «meses recalculados» correspondía en realidad a cuatro acumulados persona-mes
  (uno por colaborador); el parche Retool `0.0.3` lo renombró a «Acumulados
  mensuales» sin cambiar el cálculo. La primera prueba de Horarios detectó horas
  faltantes y una salida recortada: `0.0.3` ahora muestra Entrada/Salida apiladas
  y completa `10:30`/`21:00` solo cuando falten en `LABORANDO` o `INVENTARIO`.
  El servidor aplica la misma defensa. El guardado de Horarios ya fue repetido
  y confirmado desde la cuenta operativa. En Descuentos se corrigió con el
  parche Retool `0.0.4` el rango visual de la semana retail: es domingo-sábado,
  por lo que la semana 32 de 2026 corresponde al 9–15 de agosto, no al 3–9. El
  número enviado al endpoint no cambió. El guardado de Descuentos ya fue
  confirmado y las cuatro pantallas quedaron funcionales desde la cuenta
  operativa. El margen de tienda es ponderado: suma descuento y venta bruta del
  periodo y después divide; nunca promedia porcentajes individuales. La regla
  de asistencia quedó desplegada en `e69f52e` y
  la fila de Itzel fue reprocesada por el endpoint de captura: producción
  confirmó `EXCUSED`, 90 minutos tarde y `minutesBalance=-90`.
  Ya comenzó el despliegue al resto del equipo: `esoriamontes@gmail.com` fue
  invitada como SUBGERENTE de GUESS Galerías Monterrey, con solo `All Users` y
  `captura tiendas`; sus tres atributos de identidad quedaron verificados y la
  invitación está pendiente de aceptación.
  La migración gradual del escritorio gerencial ya comenzó. Clarvex tiene en
  producción el endpoint de solo lectura
  `GET /api/admin/retool/dashboard?storeId=...` (`5dfad9f` + corrección de
  middleware `644c694`), cubierto por `ADMIN_CAPTURE_SECRET`. El build y las
  686 pruebas pasaron, PM2 quedó con dos instancias `online` y el health check
  respondió correctamente. Retool guardó el borrador `ccf83f9` con un nuevo
  **Inicio** gerencial, resumen diario/mensual, operación, ranking y atención,
  sin tocar Horarios, Asistencia, KPIs ni Descuentos. La función fue probada
  contra producción y devolvió `ok: true` con el contrato completo. **Aún no se
  ha publicado:** la versión pública sigue siendo la captura estable; primero
  debe revisarse la vista previa y después validarse con la cuenta operativa.
  La iteración visual actual añade una barra superior liquid-glass restringida
  únicamente a la navegación y fotos reales en ranking/incidencias. Clarvex
  firma temporalmente las fotos privadas de R2 desde `b500065`; el preview
  confirmó cuatro imágenes cargadas (`complete=true`, `naturalWidth>0`) y el
  fallback de iniciales para quien no tiene foto. Retool guardó `5ada430` para
  los avatares y `d7d2e22` para que, por debajo de ~1100 px, el título y la
  navegación ocupen dos filas sin recortar «Descuentos». La fase 1 se publicó
  el 13 de agosto como parche Retool `0.0.5`. La URL pública abre Inicio y se
  validaron las cinco rutas; las cuatro imágenes firmadas cargaron con
  `complete=true` y `naturalWidth>0`, mientras Itzel conserva el fallback por
  no tener foto.
  Después de `0.0.5` se publicó el parche Retool **`0.0.6`** para corregir la
  cabecera en modo claro y añadir selector de tema. La causa era
  `bg-[#0B0C0F]/72`: Retool no generó esa opacidad y el contenedor quedó
  transparente con texto blanco. `frontend/components/AppNav.tsx` ahora usa
  RGBA explícito para claro/oscuro y un botón sol/luna accesible;
  `frontend/theme/themeToggle.ts` persiste la elección bajo
  `clarvex-capture-theme`; `frontend/App.tsx` la aplica antes del primer
  pintado. Se probaron Inicio, Horarios, Asistencia, KPIs y Descuentos en ambos
  temas, además de la persistencia tras recargar la vista previa. No se tocaron
  rutas, datos ni funciones de captura. Retool confirmó funciones aprobadas y
  ausencia de conflictos. La comprobación posterior en la URL pública confirmó
  las cinco rutas, el botón de tema y fondos no transparentes: oscuro
  `rgba(11, 12, 15, 0.86)` y claro `rgba(255, 255, 255, 0.84)`.
  El 14 de agosto se retiró Centro de Datos y se publicó Ticket electrónico en
  Retool **`0.0.7`** (commit Retool `3efa632`, ruta `/ticket-electronico`).
  Clarvex aporta `GET|POST /api/admin/capture/electronic-tickets` y conserva la
  fila ancla semanal, la identidad segura y todas las reglas de negocio. La
  escritura real se probó con contador `1` y el valor usado se restauró al
  original. Las rutas antiguas `/datos` y `/escritorio/datos` redirigen a la
  pantalla nueva. Los crons `sync-all`, `sync-alert` y `attendance-sync` fueron
  retirados del crontab; sus endpoints son no-op autenticados, y los resúmenes
  diario/mediodía ya no sincronizan Excel. Se limpiaron cuatro alertas antiguas.
  Commit Clarvex `a531f46`, desplegado; lint, TypeScript, build y 687 pruebas
  correctos. La pantalla pública y ambos temas fueron verificados.
  Falta definir el remitente de correo. Detalle completo en `AGENTS.md`.
- **Respaldo de `.env` suelto en el servidor VIEJO:** `/root/clarvex-app/.env.bak-1784486367`.
  Vivia en Vultr, que esta apagado; se ira con la instancia al destruirla.
  Ya está cubierto por `.gitignore`, pero conviene sacarlo del directorio del repo.

### ✅ Resuelto y funcionando

- Build limpio sin errores
- Prisma estable — enums y Client correctos
- GitHub Actions verde
- Login PIN funcional
- Login biométrico (Face ID / huella) funcional — WebAuthn implementado
- Dashboard asesor — KPIs personales correctos
- Dashboard gerente — KPIs tienda + por asesor
- Meta mensual correcta ($504,771 desde TOTALES RDV)
- UPT, AUR, EPT funcionando con datos reales
- Conversión con tráfico real del RDV
- Vista Semana y Mes independientes con filtro correcto
- Comisiones con mínimo correcto (asesor: mínimo individual, gerencia: mínimo tienda)
- Fotos de perfil visibles para todos los usuarios (Cloudflare R2)
- Push Notifications funcionando con app cerrada (Android + PWA)
- Botón eliminar para gerente/subgerente en comunicados, planes y pendientes
- Producción estable en team.clarvex.tech (AWS, desde el 24 de agosto de 2026)
- Modo demo público de solo lectura (`/api/demo/manager`, `/api/demo/advisor`),
  con el candado cerrado también en los GET que escriben y en los que gastan IA
- Webhook de Mercado Pago vivo desde el 23 de agosto de 2026: el secreto de firma
  ya está en el VPS y una notificación simulada pasó la verificación. Antes
  respondía 401 a todo y las suscripciones no se acreditaban solas. Clarvex
  `532d0dd` deja además el fallo a la vista si el secreto volviera a faltar
  (log explícito y aviso a Telegram) — ver [Variables de entorno](#variables-de-entorno)
- Captura por Telegram en servicio desde el 26 de agosto de 2026: pase de lista,
  reporte fotográfico semanal y —desde el 28— el reconocimiento de la zona de
  cada foto sin pie. Ver «Captura por Telegram», al principio de este documento
- Vultr apagado el 27 de agosto de 2026, después de comprobar que ningún DNS
  apuntaba allí y que no había datos que solo existieran en esa máquina.
  ⚠️ **Apagado no es destruido: sigue cobrando.**

### ⚠️ Áreas a no tocar sin revisión previa

- Lógica de comisiones (cálculo con mínimo) — ya correcta
- Fuente de datos KPIs (columnas del RDV) — ya correcta
- Vista Mes de KPIs — ya correcta
- Push Notifications — ya funcional

---

## Modo demo público

Entrada sin PIN para enseñar la app: `GET /api/demo/manager` o `/api/demo/advisor`
crean una sesión sobre la tienda ficticia `demo-showcase` (`lib/demo.ts`).

**Los usuarios demo son COMPARTIDOS** (`DEMO-100` y `DEMO-201`): todos los visitantes
entran con la misma cuenta. De ahí salen dos reglas que no son evidentes:

1. **El logout demo no debe subir `sessionVersion`.** Si lo sube, expulsa a todos los
   visitantes conectados a la vez — cualquiera podría tumbar la demo cerrando sesión
   (`app/api/auth/session/route.ts`).
2. **El middleware NO alcanza.** Solo filtra por método HTTP, y eso deja fuera:
   - GET que escriben (presencia del chat, recibos, challenges de WebAuthn)
   - GET que cuestan dinero (`/api/ai/*`)
   - Todo `/api/auth/*`, exceptuado para permitir el logout

Para esos casos existe **`denyDemo(session)`** en `lib/api.ts`. Al añadir un endpoint
nuevo que escriba o gaste IA, aplicarlo explícitamente.

En el chat se optó por **desactivar las escrituras en vez de bloquear el GET**: cortarlo
entero dejaría roto justo lo que la demo pretende enseñar.

---

## Flujo de trabajo obligatorio

**Fuente de verdad: GitHub (`main`). Nunca usar VPS como fuente principal.**

El procedimiento completo (local → GitHub → VPS) está en
[Actualizar la app en producción](#actualizar-la-app-en-producción).

Regla que no se salta: **build y lint en verde ANTES de commitear**. Desplegar código que no
compiló localmente deja la producción a merced de un error de tipado que se descubre recién al
reiniciar PM2.

---

## Reglas críticas — NUNCA hacer

```
❌ prisma migrate reset
❌ Borrar tablas, datos, usuarios, comunicados o KPIs
❌ Recrear la base de datos
❌ Introducir datos demo
❌ Usar producción como entorno de pruebas
❌ Solucionar errores de tipado reemplazando todo con: any / string / unknown
❌ Cambiar la lógica de comisiones sin aprobación explícita
❌ Cambiar las columnas del RDV que ya funcionan
```

---

## Base de datos — Notas conocidas

- Volumen PostgreSQL: `/root/stack/postgres`
- Error previo resuelto: `could not open file global/pg_filenode.map Permission denied` — no repetir cambios destructivos.
- Se ejecutó `UPDATE "Kpi" SET conversion = 0 WHERE conversion IS NULL` — 22 registros corregidos.

---

## Comandos obligatorios antes de cerrar cualquier sesión

```bash
pnpm install
pnpm exec prisma generate
pnpm run build
pnpm exec eslint . --max-warnings 0
git status   # debe quedar limpio
```

---

## Checklist de producción

- [x] Build exitoso sin errores
- [x] Prisma estable con tipado correcto
- [x] GitHub Actions verde
- [x] Login PIN funcional
- [x] Login biométrico funcional (Face ID / huella)
- [x] Dashboard asesor — KPIs personales correctos
- [x] Dashboard gerente — KPIs tienda + por asesor
- [x] Comisiones correctas con mínimo
- [x] Fotos de perfil visibles para todos
- [x] Cloudflare R2 funcional (fotos + evidencias)
- [x] Pendientes funcionales con notificaciones
- [x] Comunicados funcionales con push
- [x] Notificaciones internas funcionales
- [x] Push Notifications funcionales (Android + PWA)
- [x] Botón eliminar para gerente/subgerente
- [x] PWA instalable en móvil
- [x] Producción estable en team.clarvex.tech (AWS)

---

## Margen DTO (Descuentos POS)

Fuente histórica: archivo XLSX de SharePoint. Desde el 14 de agosto de 2026 la
captura operativa vive en Retool y escribe por la API segura de Clarvex; este
bloque solo documenta el parser heredado.

### ⚠️ El margen se captura de DOS formas y nunca a la vez

`Kpi.discountDaily` distingue una de otra, y el servidor impide mezclarlas en
los dos sentidos (`lib/discount-capture.ts` y `lib/kpi-capture.ts`):

| Forma | Dónde vive | `discountDaily` |
|---|---|---|
| **Semanal** | fila ancla; el resto de la semana en `null` | `false` |
| **Diaria** | cada día con su bruto y su descuento, del reporte del POS | `true` |

Sumar las dos en la misma semana inflaría el descuento sin que nada avise — y
el margen es un **techo**, así que pasarse se lee como que la tienda descontó
de más.

Desde el 23 de agosto de 2026 la pantalla de Descuentos lo respeta. Antes
`getDiscounts` devolvía las filas crudas, así que una semana capturada día a
día llegaba como varias filas con la misma clave y **la pantalla se quedaba con
la última**: enseñaba un día como si fuera la semana. En producción, la semana
33 de Adrián se veía como `$2,539` de bruto cuando eran `$59,708`.

Ahora la consulta agrega por persona y devuelve además `daily`, `daysCaptured`
y `missingDates`. Las filas que vienen del POS se muestran sumadas y de solo
lectura; las demás se capturan como siempre.

⚠️ **`missingDates` solo significa algo cuando `daily` es true.** En la captura
semanal los días sin margen están vacíos a propósito —el total vive en la fila
ancla—, así que ahí la lista es ruido y la pantalla la ignora. El aviso tampoco
afirma hacia dónde se mueve el margen: al faltar un día faltan su bruto y su
descuento a la vez, y puede subir o bajar. Lo único cierto es que no es la
semana completa.

Son **fechas y no un conteo** porque «faltan 2 días» no se puede accionar. La
pantalla las junta de todas las personas y las deduplica: el reporte del POS es
de la tienda entera por día, así que cada archivo que se sube tapa el mismo
hueco en todos los que lo tengan. En la semana 33 de producción, cuatro de
cinco personas fallaban exactamente los mismos dos días.

⚠️ **`to_char` sobre `date` va sin conversión de zona.** La columna guarda la
medianoche UTC del día de tienda; convertirla correría la fecha un día — el
mismo fallo de las devoluciones. Comprobado contra producción.

Retool `b468cad` (commit posterior al publish `c004bc7`). La consulta se probó
contra producción en solo lectura sobre la semana 33 (diaria) y la 32
(semanal); `retool check` pasó sus cuatro fases. No requirió cambios en
Clarvex.

### Estructura hoja "MARGEN DTO"

- Datos empiezan en **fila 6**
- Col 1: vacía
- Col 2: header de semana (`SEMANA 22`, `SEMANA 23`...)
- Col 3: número de empleado (int) o `TIENDA TOTAL`
- Col 4: nombre del empleado
- Col 5: venta bruta (número)
- Col 6: descuento (número)
- **NO hay columna de margen %** — se calcula: `margen = descuento / venta_bruta`

### Reglas del parser

- Detectar bloque: `row.values[2]` empieza con `"SEMANA"`
- Fila empleado: `typeof row.values[3] === 'number'`
- Fila tienda: `row.values[3] === 'TIENDA TOTAL'`
- Solo guardar donde `venta_bruta > 0`
- Si semana actual sin datos → mostrar semana más reciente con datos
- Mostrar `—` si no hay datos — NUNCA "Sin datos POS" cuando el archivo está vinculado

---

## ⚠️ `Kpi.weekStart` NO es el inicio de la semana

En la tabla `Kpi`, los campos `weekStart` y `weekEnd` valen **lo mismo que `date`**
en cada fila. No son los límites de la semana, pese al nombre.

```
date       | weekStart  | weekEnd    | weekNumber
2026-08-01 | 2026-08-01 | 2026-08-01 | 30
2026-07-31 | 2026-07-31 | 2026-07-31 | 30
```

**Agrupar por `weekStart` produce una "semana" por día.** Para agrupar por semana
se usa **`weekNumber`**, que sí es constante — es lo que ya hace la sincronización
del margen DTO. Los límites reales se derivan del mínimo y máximo `date` del grupo.

## Datos SEMANALES en la tabla Kpi — patrón de fila ancla

`Kpi` es diaria. Un dato semanal (margen DTO, ticket electrónico) se guarda en la
**primera fila de la semana** y en el resto queda `null`. Si se repitiera en los
siete días, sumar la semana multiplicaría por siete.

Ver `lib/data-source-sync.ts:597` y `app/api/electronic-tickets/route.ts`.

## Conteo diario de sección (dama) — agosto de 2026

En el inventario de agosto faltó producto de dama y el supervisor pidió contarla
a diario. Vive en `/conteos/dama` y `/escritorio/conteos/dama`, sobre las mismas
tablas del conteo físico (`CycleCount` con `kind = "DIARIO"`).

**Es una cosa APARTE del conteo físico y APARTE del kardex.** No lleva teórico,
no cierra ronda y **contar no mueve existencias**. El candado de «un solo conteo
abierto» está acotado a `kind = "FISICO"`: sin eso, el conteo diario impediría
abrir el inventario quincenal.

Cuatro reglas que no hay que cambiar sin hablarlo:

1. **El juego de marbetes se arma escaneando.** Nadie tenía la lista de qué
   marbetes son de dama. El primer conteo enrola cada uno que se pasa.
2. ⚠️ **La posición de export (1, 2, 3…) se asigna una vez y NO se recicla.** Un
   marbete nuevo va al final aunque su número interno sea más bajo; el de uno
   retirado queda vacío. Si las posiciones se recorrieran, el «marbete 3» de un
   reporte ya entregado pasaría a apuntar a otro rack. Corregir o recompactar
   **solo se permite mientras la sección va en su PRIMER conteo**; después el
   servidor lo rechaza y explica por qué.
3. **El conteo es ciego.** El campo de piezas nace vacío, nunca con lo ya
   contado: enseñarle a la segunda persona lo que puso la primera convierte el
   recuento en una confirmación. El 3er conteo solo se ofrece si el 2º no cuadró.
4. **Un marbete que baja NO es una pérdida.** Puede haberse vendido, agotado o
   movido. Solo cuenta lo que queda sin explicar, y el motivo es **lista
   cerrada**: con texto libre, a las dos semanas todo dice «se vendió».
   «Se movió al marbete N» **se verifica** contra ese marbete — es la única
   causa que no se puede inventar.

Al copiar el conteo para pegarlo en Excel, un marbete sin contar deja su renglón
**en blanco**. Saltárselo recorrería la columna entera y pegaría las piezas en el
marbete equivocado.

## La venta del día SÍ puede ser negativa

Una devolución de cliente que no se compensa con otra venta deja el día en rojo,
y así se registra: se resta del acumulado de la persona y del total de la tienda.

⚠️ **Las PIEZAS no.** Las de `Kpi` son brutas — el POS reporta las devoluciones
aparte y el kardex las toma como su propio movimiento. Una pieza negativa aquí
devolvería la mercancía al inventario **dos veces**, y el descuadre aparecería
hasta el conteo físico sin rastro de dónde salió. Meta y tickets tampoco.

El tope de captura mide el **valor absoluto**: un cero de más en rojo es tan
error como en verde.

### El lector del POS y los días de devolución — 27 de agosto de 2026

El reporte de ese día se rechazaba con «la tabla leída viene incompleta. Prueba
con una captura más nítida», y la captura estaba perfecta. Dos muros, uno detrás
del otro, y ninguno tenía que ver con la imagen.

⚠️ **`net`, `avgUnits` y `avgAmount` pueden ser negativos de verdad.** Quien
atiende un solo ticket y es una devolución deja el neto en rojo, y con él los
dos promedios, que salen de dividirlo. El esquema de `lib/pos-vision.ts` les
ponía suelo en cero. Y como **una fila detiene el reporte entero**, las otras
dos personas se perdían con ella.

⚠️ **La columna «Ventas Descuento» cambia de signo.** Casi siempre es una rebaja
y viene en negativo, pero al devolverse una prenda rebajada su descuento se
**revierte** y entonces suma. `discountAsReduction()` en `lib/pos-productivity.ts`
deduce la dirección de la cuenta del propio reporte —bruto menos rebaja da el
importe posterior al descuento—, **no** de lo que devuelva el lector: el prompt
le pide magnitud, y un día normal no puede depender de que respete una
instrucción. La magnitud se sigue verificando igual, que es la que se lee mal
cuando se lee mal un dígito; lo único que se deduce es el signo, y no hay empate
posible salvo con rebaja cero.

En esa fila el margen se prellena **vacío**, no en cero: el descuento devuelto es
de la venta de otro día y dividirlo por el bruto de hoy no da un margen. Retool
lo aguanta desde `2a2545a` —`money(null)` tumbaba la tabla al pintarse y
`String(null)` metía la cadena `"null"` en el borrador—, así que **aquí Retool va
antes que Clarvex**, al revés de lo habitual: su cambio acepta las dos formas y
el de Clarvex no.

El mensaje de error ya nombra el campo que falló en vez de culpar a la foto.
Desplegado en Clarvex `3201f2b` y Retool `ca797ac` (publicación posterior al
commit `2a2545a`). 960 pruebas, ESLint y build limpios; `retool check` con sus
cuatro fases en verde, dos PM2 online y health `ok`.

⚠️ De paso: `frontend/tailwind.css` de la copia local de Retool **no está en
git** y se había quedado atrás. No lo había tocado nadie —Retool le añadió el
estilo del `select`— pero bloqueaba `retool push` con `platformRequiredFiles`.
Se recupera clonando la app en otra carpeta y copiando el archivo.

## Manifiesto del CEDIS: las cajas `S` son empaque, no inventario

Los manifiestos traen bolsas de la marca junto con la mercancía. **`K` es
mercancía, `S` es empaque.** El empaque se lee y se cuenta —los totales que
declara el CEDIS lo incluyen y son la única verificación de que el PDF se leyó
completo— pero **no baja al borrador** de recepción.

⚠️ Un prefijo desconocido se toma como **mercancía** y se avisa. Conviene
equivocarse contando de más: una caja de más aparece en el conteo físico, una que
nunca entró al kardex no deja rastro de que faltó.

Detalle que costó una recepción entera: el patrón de caja exigía letra + dígitos,
y las bolsas llevan letras dentro (`S00004A1Y452`). No se reconocían, el total no
cuadraba y **se rechazaba el manifiesto completo**.

## Kardex de inventario — la existencia se CALCULA, no se guarda

```
teórico = inventario inicial + entradas − salidas − ventas ± ajustes
```

Guardar la existencia y sumarle/restarle es como se corrompe un inventario: el
error queda incrustado y ya no se sabe cuál fue. `summarizeKardex()` en
`lib/inventory-kardex-entry.ts` la recalcula entera en cada lectura.

El kardex va por **rondas**: cada inventario físico cierra la ronda en curso y
abre la siguiente con las piezas recién contadas. Es como se lleva a mano (el
archivo de la tienda se llama «1RA RONDA 2026»).

Cinco reglas que NO hay que cambiar sin hablarlo:

1. **Dentro de una ronda, `basePieces` no se toca jamás.** Corregirla a media
   ronda reescribe la existencia teórica de todos los días de golpe. Solo puede
   haber **una ronda abierta por tienda**, garantizado por un índice único
   parcial (`closedAt IS NULL`) — el chequeo en código no basta con dos
   instancias de PM2.
2. **La venta del día NO se captura**: sale de `Kpi.pieces`, agregada con
   `PERSON_WHERE`. Capturarla otra vez la contaría dos veces.
3. **La devolución de cliente SÍ se captura**: las piezas de `Kpi` son brutas y
   el POS reporta las devoluciones aparte, a nivel tienda.
4. **`quantity` siempre positivo**; el signo lo pone el tipo de movimiento.
5. **Sobrantes y faltantes NO entran al teórico**: `quantity` ya son las piezas
   que se quedan en la tienda. Se guardan porque son la primera pista cuando el
   conteo de cierre no cuadra.

   ⚠️ **Las piezas de MÁS no son inventario de la tienda.** Cuando llegan más
   de las que dice el manifiesto, la tienda las **aparta y las devuelve al
   CEDIS**: nunca fueron suyas. Con `contadas` y lo que declara el manifiesto:

   ```
   quantity = min(contadas, manifiesto)
   missing  = max(0, manifiesto − contadas)
   surplus  = max(0, contadas − manifiesto)
   ```

   Manifiesto 5 y llegan 4 → entran **4**. Manifiesto 5 y llegan 7 → entran
   **5**, y las 2 de más se apartan. Meterlas al teórico infla el inventario con
   mercancía que se va a ir de vuelta, y el descuadre aparecería hasta el
   siguiente conteo físico sin rastro de dónde salió.

   Corolario: al devolver ese sobrante al CEDIS **no se captura un traspaso de
   salida**. Nunca entró, así que restarlo lo contaría dos veces.

   La captura de Retool respeta la regla por las dos vías desde el 24 de agosto
   de 2026 (Retool `029997a`, sin cambios en Clarvex). La recepción por
   manifiesto ya calculaba `min(contadas, manifiesto)`; el **alta manual** no
   tenía nada equivalente y su texto de ayuda —uno solo para Sobrantes y
   Faltantes— decía «las piezas recibidas ya son las reales», que invita a
   teclear las 7 que llegaron. Ahora cada campo lleva su propia regla, porque
   **no son la misma**: con faltante van las que llegaron, con sobrante van las
   del manifiesto. Además el formulario confirma en pantalla cuántas entran y
   cuántas se apartan.

   ⚠️ **Sobrante y faltante no pueden ser mayores que cero a la vez.** Salen de
   una sola comparación contra el manifiesto, así que por construcción como
   mucho uno puede serlo. El alta manual lo aceptaba y ahora lo rechaza.

Tipos de movimiento: recepción, traspaso de entrada, devolución de cliente,
traspaso de salida, **SFS** (Ship From Store) y ajuste ±. El corte de la ronda
⚠️ **El día del inventario SÍ entra en la ronda**: movimientos y ventas usan
`date >= startDate`. RGIS cuenta antes de que la tienda abra, así que lo de ese
día ocurre después del conteo. Lo confirma el kardex real de la tienda: su
«Último Inventario» es el 18 de febrero y la primera fila de la hoja Ventas es
de ese mismo día. Los dos cortes tienen que moverse juntos: si uno acepta el día
del conteo y el otro no, ese día se cuenta dos veces o se pierde entero.

Un `AJUSTE` exige motivo: sin él, una merma desaparece sin explicación, que es
justo lo que el kardex existe para evitar.

### El libro de la ronda incluye la VENTA

La pantalla de movimientos enseñaba todo lo que entró al inventario y casi nada
de lo que salió: la venta no es un movimiento capturado, sale de los KPIs del
día. Sin ella no había forma de seguir a mano cómo se llegó al teórico.

`buildLedger` (`lib/inventory-kardex-entry.ts`) mezcla lo capturado con la venta
de cada día y le pone signo: **positivo entra, negativo sale**. La suma del libro
es exactamente lo que el teórico le agrega a la base de la ronda.

⚠️ Las filas de venta son **derivadas**: van sin `id` a propósito, para que no se
puedan borrar como un movimiento. Corregir una venta se hace en KPIs, que es
donde vive el dato.

El **export del kardex no usa esto**: sigue leyendo `state.movements` y arma sus
ventas con su propia consulta. Son dos caminos separados y los números no
cambiaron.

## Avisos globales y la paleta del escritorio

Los componentes montados en `app/layout.tsx` (`EmailBanner`, `WhatsNewModal`…)
viven **fuera** del subárbol `[data-surface="desk"]`, así que no heredan los
tokens del escritorio y se pintarían con la paleta del móvil sobre el lienzo
oscuro. Solución: la clase **`desk-adopt`**, definida en `app/escritorio/desktop.css`.

Mismo motivo por el que los Meteors se ocultan con `body:has([data-surface="desk"])`.

## ⚠️ La huella vale SOLO en el dominio donde se registró

Es una garantía del estándar WebAuthn, no un detalle: impide que un sitio falso
reutilice una huella. `WebAuthnCredential.rpId` guarda ese dominio, y la app
solo ofrece las credenciales del dominio actual.

**La bandera se lee en TRES sitios y los tres tienen que coincidir:**

| Ruta | Qué controla |
|---|---|
| `/api/auth/employee-login` | el botón de huella en el login |
| `/api/auth/session` | **el perfil**, que es donde se registra |
| `/api/app-data` | la lista de usuarios |

⚠️ **Arreglar solo uno deja al usuario peor que antes.** Pasó el 21 de agosto:
el login ya no ofrecía la huella (correcto) pero el perfil seguía diciendo «Face
ID activo» y por eso no ofrecía registrarla — sin ninguna de las dos formas de
usarla. Si aparece un cuarto sitio que lea `biometricEnabled`, va con la misma
regla: la pregunta no es «¿tiene biometría?» sino «¿tiene credencial AQUÍ?».

## ⚠️ Un fallo de RED no es «no hay sesión»

Costó meses de «la app no carga» en todos los celulares. `getSession()` hacía un
solo `fetch` sin timeout ni reintentos; cuando la petición ni siquiera lograba
salir —señal intermitente, o el navegador abortándola al **reanudar la PWA desde
segundo plano**, que es como se abre la app en tienda— la promesa se rechazaba.

En `/advisor` nadie la atrapaba, `user` se quedaba en `null`, y su pantalla de
error exigía `user && !data && loadFailed`: con `user` en `null` **nunca podía
aparecer**. Esqueletos para siempre, sin mensaje y sin botón. `/manager` ya
tenía su `.catch` y su condición sin `user`; nunca se portó a `/advisor`, y por
eso lo sufrían los asesores y gerencia no.

Tres reglas que no hay que romper:

1. **`getSession()` devuelve `null` solo si el servidor CONTESTÓ que no.** Si no
   pudo preguntar, **lanza**. Confundirlos mandaría al login a gente con sesión
   válida cada vez que parpadea la señal. Una respuesta del servidor manda sin
   reintentos: repetir un 401 no lo va a validar.
2. **Un `.catch` vacío NO arregla el cuelgue.** No lo causa el rechazo sin
   atender, sino que `session` nunca se asigna; el catch vacío solo silencia el
   error y deja la pantalla igual de pegada, pero pareciendo corregida.
3. **La recuperación va por evento, no por temporizador.** `useSession`
   (`lib/use-session.ts`) reintenta al volver a la app y al recuperar internet
   —lo mismo que hace `useAppData`—, así que la pantalla se destraba sola sin
   que cada una dibuje su propia pantalla de error. Insistir cada X segundos
   gastaría batería sin ninguna señal de que algo cambió.

Desplegado el 24 de agosto de 2026: Clarvex `7d5e4c4` (la raíz y `/advisor`) y
`d9c6ed3` (doce pantallas del teléfono migradas a `useSession`: KPIs, Horarios,
Comunicados, Notificaciones, Pendientes, Plan, Chat, Faltantes, Kudos,
Solicitudes, Encuestas y Capacitación). 912 pruebas, ESLint, tipos y build
limpios; dos PM2 online y health `ok`.

⚠️ **No todas las pantallas se colgaban.** `/plan` y `/pendientes` condicionan su
esqueleto a `!data`, no a `!session`, así que renderizaban igual; `LiquidBottomNav`
ya traía `.catch`. Las que sí se colgaban son las que cortan con
`if (!session) return;` **antes** de pedir sus datos.

Pendiente: las pantallas de `/escritorio/*` siguen con el patrón viejo. Son de
escritorio y sobre conexión estable, así que no es donde vive el problema.

## ⚠️ El usuario kiosko NO es un asesor

El celular de la tienda (`checklistOnly: true`) está dado de alta con rol
`ASESOR`. Filtrar por `role: "ASESOR"` a secas lo incluye, y se coló en DOCE
consultas: salía en la plantilla de Asistencia, contaba como un asesor con cero
venta en el resumen de cierre («Abajo: 1 asesores» una noche en que la única
persona que trabajó SÍ llegó a su meta), y hasta recibía plan del día.

Usar siempre **`ADVISOR_WHERE` / `PERSON_WHERE`** de `lib/store-people.ts`.

## ⚠️ Asistencia: mes retail vs mes natural

No son lo mismo y la diferencia **se paga**:

- **FALTAS** → por quincena de CALENDARIO (1–15, 16–fin). La nómina va así.
- **RETARDOS, DOMINGOS y FESTIVOS** → por **mes RETAIL**.

Agosto 2026 natural trae CINCO domingos (2, 9, 16, 23 y 30) y el retail solo
CUATRO: el 30 ya es septiembre retail. Por natural se pagaría una prima
dominical de más por persona. En julio los dos daban los mismos cuatro, por eso
el fallo estuvo meses invisible.

`retailMonthBoundsFor()` en `lib/report-deadlines.ts` da los límites.

## ⚠️ Margen DTO es un TECHO, no una meta

Su «meta» es el descuento máximo permitido: pasarse es MALO. Con el semáforo
genérico (verde si valor ≥ meta) se pintaba verde justo al excederlo.
`isCeiling()` en `lib/kpi-view.ts` lo distingue.

## ⚠️ Verificar el build SIN filtrar la salida

`pnpm run build | grep -E "Compiled|Failed"` **miente**: casa con el
«✓ Compiled successfully» del paso de compilación e ignora el error del export,
que ocurre después. Un `useSearchParams()` sin límite de `<Suspense>` compiló
«bien», dejó el `.next` incompleto y **tumbó producción con 502**.

Mirar siempre las últimas líneas completas (`| tail -4`).

## ⚠️ Bug conocido excelJS — Arrays Sparse

`row.values` en excelJS es un **array sparse**. NUNCA usar `.map()` directo — preserva huecos y causa crashes.

```typescript
// ❌ MAL — undefined.includes() → crash
const cols = row.values.map(v => v)
cols.findIndex(v => v.includes('texto'))

// ✅ BIEN — densificar primero
const cols = Array.from(row.values, v => v ?? null)
cols.findIndex(v => v && String(v).includes('texto'))
```

Aplicar `Array.from()` en TODOS los parsers que usen `row.values`.
