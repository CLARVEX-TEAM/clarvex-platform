# Clarvex Team — CLAUDE.md

## APK 1.6 «Mi día» — candidata en revisión — 17 de septiembre de 2026

PR 97 abierto desde `feat/apk-1.6-mi-dia`; cambio funcional `88da579`, basado en
la 1.5.1 aceptada. La nueva
portada existe solo dentro de Android y reúne turno, uniforme, asistencia, avance
de venta, plan, pendientes, comunicados y accesos según rol. Conserva una copia
de solo lectura para abrir la última jornada sin red. Navegador y PWA mantienen
sus portadas actuales.

La migración aditiva `20260917230000_apk_16_attendance_corrections` agrega
solicitudes de corrección de asistencia y los tipos de aviso correspondientes.
Cada solicitud queda auditada, puede llevar evidencia privada con enlace
temporal y exige aprobación de otra persona de gerencia; nadie aprueba su propia
corrección. El panel nativo de dispositivos permite consultar, revocar y
reactivar equipos. Revocar elimina sus tokens FCM y retos pendientes; el teléfono
cierra la sesión al detectar el cambio.

El cron `/api/cron/shift-reminder` reclama una entrega única por usuario/día y
avisa aproximadamente una hora antes del turno; al publicar debe programarse
cada 15 minutos con el wrapper autenticado del servidor. Las notificaciones
abren la sección exacta de Mi día. El botón Calendario solo aparece cuando el
binario trae `CalendarioClarvex`, que abre el editor del sistema sin permiso de
lectura/escritura del calendario.

Validación local: Prisma format/generate/validate, TypeScript, ESLint, 1,456
pruebas sin fallos ni saltos, build de 77 páginas y revisión visual Android a
412 px sin overflow. Android `testDebugUnitTest assembleDebug` aprobó 279 tareas
con Java 21/SDK 35. La corrida CI `35283067539` terminó sin ejecutar pasos por
el bloqueo conocido de facturación; los trabajos dependientes quedaron saltados.
Falta integrar, compilar con firma desde el SHA exacto, desplegar, dar de alta el
cron y probar en teléfono; producción continúa en web
`e219e51` y APK 1.5.1/código 7. No describir la vinculación existente como
atestación de procedencia oficial.

## Vinculación de dispositivo y APK 1.5.1 — publicadas — 17 de septiembre de 2026

El usuario autorizó integrar y publicar. PR 96 quedó integrado en plataforma
`e219e5188176a0cc30a521f137d852bbde1214cd` y PR 5 en Android
`afff75bf7093122d25d9e26d47dcde56a77b4636`.

`DispositivoClarvex` crea una llave P-256 no exportable en Android Keystore y un
UUID privado de instalación. La web puede pedir identidad, firma y diagnóstico,
pero nunca leer la llave privada. El servidor registra usuario/tienda/perfil,
versión y capacidades en la migración aditiva
`20260917010000_native_device_identity`. Los retos caducan en dos minutos y se
consumen una vez; `requireNativeDevice()` valida sesión, dispositivo activo,
timestamp, método, ruta/consulta, SHA-256 del cuerpo y firma DER ECDSA. El token
FCM se asocia a `NativeDevice` cuando existe el plugin, manteniendo el flujo
anterior para APK viejas. La pantalla `/diagnostico` expone salud del equipo y
una prueba firmada completa.

Esta entrega es vinculación y prueba de posesión. El alta inicial acepta una
llave P-256 presentada por una sesión válida, de modo que todavía no certifica
el origen oficial del binario. La puerta siguiente será Android Key Attestation
con paquete y digest del certificado, más aprobación gerencial como fallback en
equipos incompatibles. No describir esta rama como exclusividad total de APK.

Pasaron Prisma format/generate/validate, TypeScript, ESLint, 1,450 pruebas sin
fallos ni saltos, build local de 75 páginas y `git diff --check`. Android se
compiló de forma limpia desde el merge exacto con Java 21/SDK 35: 279 tareas.
Actions no ejecutó pasos por facturación y no hubo PostgreSQL efímero.

Plataforma activa: `/home/ubuntu/clarvex/releases/20260917-164858-e219e51`,
build `mu5rld7z`. Aplicó `20260917010000_native_device_identity`; 109 migraciones
al día. Ambos workers sirven la release nueva y la salud pública/base están OK.
Las tablas nuevas existen sin dispositivos o retos antes del primer uso.

APK publicada a las `2026-09-17T21:42:34Z` en
`compartido/apk/clarvex-7.apk`, versión 1.5.1/código 7, 8,073,678 bytes, SHA-256
`208284830469c723f07902deffbe84e5d64aecdf4557ff8575c50964308c0b17`.
`apksigner` valida v1/v2 y el certificado estable. El servidor verificó archivo
antes de activar atómicamente el manifiesto; conserva APK 1.5 y respaldo
`version-antes-de-1.5.1-20260917T214234Z.json`. `versionPublicada()` coincide y
las rutas sin sesión responden 401. El usuario confirmó el 17 de septiembre la
aceptación física tras actualizar: cámara, escáner, galería, varias páginas,
notificaciones y operación general funcionan correctamente. APK 1.5.1 queda
aceptada en el equipo real.

## APK 1.5 y checklist nativo publicados — 16 de septiembre de 2026

El usuario autorizó integrar y publicar directamente. PR 95 quedó integrado en
plataforma `0114dbc` y PR 4 en Android `56ea499`; los árboles funcionales
validados corresponden a `f54266c` y `bedb870`. Actions no inició trabajos por
el bloqueo conocido de facturación; no fue un fallo de pruebas.

La APK muestra una versión propia del checklist solo cuando Capacitor reporta
Android: progreso total, selector Apertura/Cierre, siguiente tarea, una única
acción principal, evidencia secundaria y completadas plegables. La web/PWA
conserva el checklist anterior. El escáner nativo usa ML Kit para hasta 25
páginas, devuelve JPEG/PDF en caché privada y cae a la cámara estándar si el
plugin no está disponible. Las páginas se suben por la API existente y quedan
visibles una por una, incluso si una posterior falla.

Las notificaciones pueden abrir rutas internas y rechazan destinos externos.
El manifiesto desactiva backup/transferencia de datos. El actualizador acepta
solo `https://team.clarvex.tech/api/app/apk`, limita a 50 MiB y valida paquete,
versionCode y certificado antes de abrir el instalador. No hay migraciones ni
endpoints nativos nuevos; por tanto, el registro criptográfico de dispositivo y
el guard de exclusividad del servidor siguen pendientes en el plan.

Validación web: TypeScript, ESLint, 1,442 pruebas sin fallos ni omisiones y
build aislado de 75 páginas sin `.env`, con TCP externo bloqueado. Revisión
visual simulando el puente Android a 412 px: sin desbordamiento ni excepciones y
una sola acción primaria. Android: `testDebugUnitTest assembleDebug` y después
build firmado aislado desde `bedb870`, 279 tareas aprobadas. El DEX contiene
`ScannerDocumentos`, `DocumentScannerActivity` y `Actualizador`; el manifiesto
contiene cámara, FCM y el escáner.

Candidata: `D:\Documents\clarvex-entregas\apk-1.5-candidata\clarvex-team-1.5.apk`,
versión 1.5/código 6, 8,070,306 bytes, SHA-256
`0856b2ebadc2be1b3fb97c2ce124f5a52ab4ae55de30afb253280b9b7468fc67`.
Firma v1/v2 y certificado idéntico a APK 1.4.

Plataforma desplegada mediante el guion extraído del SHA exacto en
`/home/ubuntu/clarvex/releases/20260917-051701-0114dbc`, build `mu52vi3x`.
No había migraciones pendientes entre las 108 registradas. El guion detectó el
cwd anterior de PM2, recreó ambos workers y confirmó salud pública, base de datos
y los chunks del checklist/escáner en la release activa.

APK publicada el 17 a las 05:26:10 UTC en `compartido/apk/clarvex-6.apk`, tras
validar en el servidor hash y 8,070,306 bytes. `version.json` se reemplazó al
final y de forma atómica; conserva APK 1.4 y respaldo
`version-antes-de-1.5-20260917T052610Z.json`. `versionPublicada()` confirma 1.5,
tamaño y hash, y los endpoints anónimos siguen respondiendo 401.

La aceptación física quedó cubierta por la prueba posterior de APK 1.5.1 en el
equipo real. El usuario confirmó cámara, escáner, galería, varias páginas y
operación general; ya no queda pendiente la prueba del flujo nativo publicado.

## Asistencia AXO sin acceso al Forms — publicada — 16 de septiembre de 2026

La cuenta `tommy_sanagustin@grupoaxo.com` puede responder el Forms pero no leer
respuestas: Power Automate devolvió 707 «Acceso no autorizado al CDB». AXO no
compartirá permisos. Por eso la implementación no usa API de Forms, Power
Automate, RPA ni scraping.

PR 94 quedó integrado en `c31929e`. `/checklist` enseña a gerencia una tarjeta
diaria con la plantilla laboral ordenada igual que el Forms, distingue hora real
de «Sin captura», abre el enlace configurado en `Store.attendanceFormUrl` y
registra «enviado» en `ReportDelivery` (`AXO-DIARIO-AAAA-MM-DD`). La confirmación
es idempotente, se audita y se etiqueta honestamente como declaración de
gerencia; no se presenta como respuesta verificada por Microsoft.

Nuevos crons autenticados:

- `/api/cron/attendance-axo-reminder?stage=1030` a las 10:30 de Monterrey.
- `/api/cron/attendance-axo-reminder?stage=1050` a las 10:50.
- `/api/cron/energy-checklist-reminder` a las 12:15, lunes/miércoles/viernes.

Los avisos crean notificación interna `CHECKLIST_REMINDER`, mandan Web Push/FCM,
abren `/checklist` y deduplican con `RetailAlertLog`. El de asistencia se omite
cuando ya existe la confirmación del día. El de energía se limita a tiendas con
el interruptor activo y también se omite si encuentra un punto activo cuyo
nombre contiene «energ» ya marcado ese día.

La migración `20260916190000_operational_checklist_reminders` es aditiva y
configura `clarvex-demo-store` con el Forms recibido y energía activa. Para otra
tienda hay que guardar su propio enlace y activar su interruptor; nunca reutilizar
el Forms de San Agustín.

Validación local previa: `prisma validate/format/generate`, TypeScript sin emisión,
ESLint completo sin avisos, 1,441 pruebas sin fallos/saltos y build de 75 páginas.
Solo apareció el aviso conocido de Sentry/OpenTelemetry. Actions volvió a
terminar con cero pasos por el bloqueo de facturación, por lo que no hubo CI ni
PostgreSQL efímero.

El usuario autorizó publicación directa. El guion conservado en la versión
activa y el extraído del merge tienen el mismo SHA-256
`3cc3e96def50ec6f8bbbc0a13875ed4c2dc866a2f3dc8354e401e3c7678e47fd`.
Desplegó `c31929e` en
`/home/ubuntu/clarvex/releases/20260917-040301-c31929e`, build `mu508d4l`.
Aplicó `20260916190000_operational_checklist_reminders` y dejó 108 migraciones
al día. PM2 retuvo el cwd anterior tras reload; la guarda recreó ambos workers.
Después se verificaron los dos online con cwd/ejecutable nuevos y salud HTTPS 200.

Crontab de `ubuntu`, expresado en UTC del servidor:

- `30 16 * * *`: asistencia 10:30 de Monterrey.
- `50 16 * * *`: asistencia 10:50 de Monterrey.
- `15 18 * * 1,3,5`: energía 12:15 lunes/miércoles/viernes.

Las líneas llaman al wrapper 700
`/home/ubuntu/clarvex/compartido/bin/cron-authenticated-post.sh`; este acepta
solo los tres endpoints y lee el secreto del `.env` compartido en cada ejecución.
El crontab no contiene una copia nueva del secreto. Respaldo anterior con modo
600: `/home/ubuntu/logs/crontab-before-operational-reminders-20260917-041129.txt`.
No se ejecutó ningún cron manual durante el smoke para no enviar recordatorios
reales. Se comprobó sintaxis del wrapper, tres líneas instaladas, Forms de la
tienda configurado, energía activa, rutas nuevas protegidas con 401 y salud 200.
Pendiente únicamente la prueba visual/confirmación con gerencia y observar la
primera entrega programada. El APK no cambió.

## Cámara y APK 1.4 en producción — 16 de septiembre de 2026

El usuario autorizó «Pública la apk y el cambio web» y continuar por comando
directo, con Actions bloqueado por facturación. Se integraron PR 93 web
(`aa59f6c3951bb4f12fe499ce18745c1622d37c61`) y PR 3 Android (`088ec24`).
Se comprobó igualdad de árboles con los commits validados/compilados.

Validación web en copia aislada sin `.env`: TypeScript completo, ESLint sin
avisos, 1,437 pruebas sin fallos ni saltos, build de 75 páginas con configuración
ficticia, red externa Node bloqueada y fuentes simuladas; 71 comprobaciones del
simulador de deploy. No equivale a una CI verde: Actions sigue bloqueado y no
se ejecutó la suite con PostgreSQL efímero. No se modificaron workflows.

Se extrajo `scripts/deploy-release.sh` del SHA aprobado y se ejecutó en AWS.
No había migraciones pendientes (107 al día), ni diferencias en migraciones.
La compilación real aprobó. PM2 mantuvo el cwd anterior tras reload: la guarda
lo detectó, recreó ambos workers y solo entonces cambió el puntero. Versión:
`/home/ubuntu/clarvex/releases/20260916-053857-aa59f6c`; build `mu3o7v1q`.
Verificados ambos procesos online, sus cwd/ejecutables, salud pública, build
servido y SHA-256 del chunk de checklist descargado por HTTPS. Contiene las
dos entradas `accept="image/*"` con captura.

APK publicada a las `2026-09-16T13:37:02Z`: `compartido/apk/clarvex-5.apk`,
versión 1.4/código 5, 7,880,747 bytes, SHA-256
`48b1780afa73e17e5cd8491d3cd82ce980fd2e18571b5180c3745ef179640d98`.
Se comparó el certificado también con la APK 1.3 obtenida del servidor:
idéntico. Primero transferencia temporal/hash; después nombre final y reemplazo
atómico del manifiesto. Respaldo:
`compartido/apk/version-antes-de-1.4-20260916T133702Z.json`; APK 1.3 conservada.
La función real `versionPublicada()` confirma versión, bytes y hash. Ambos
endpoints mantienen 401 sin sesión/token; no se fabricaron sesiones de prueba.

Evidencia local: `D:\Apps\clarvex-android\publicacion-1.4` (logs y JSON de
verificación). La prueba física de cámara/escaneo/galería queda al usuario tras
aceptar la actualización 1.4. Las secciones inferiores son antecedentes.

## Compilación local de APK 1.4 resuelta — 15 de septiembre de 2026

La continuación generó la APK aunque Actions sigue bloqueado. La copia local
de la firma estable existe y su certificado coincide con el declarado por
producción; no hace falta generar otra llave. Herramientas instaladas en
`D:\Apps\clarvex-android`, compilación aislada del SHA Android `1da79fd`.
Guía reproducible: `D:\Documents\clarvex-movil\docs\compilar-local.md`.

Entrega verificada: `D:\Documents\clarvex-entregas\apk-1.4\clarvex-team-1.4.apk`
(7,880,747 bytes). SHA-256:
`48b1780afa73e17e5cd8491d3cd82ce980fd2e18571b5180c3745ef179640d98`.
Firma APK v1/v2 correcta, certificado estable `87:58:A3:26:…`, paquete
`tech.clarvex.team`, versión 1.4/código 5, consulta IMAGE_CAPTURE y Firebase
incluidos. XML y 29 pruebas de cámara/actualización/assetlinks aprobados.

Esto sustituye únicamente el bloqueo de compilación descrito debajo: todavía
no se publicó la APK ni el cambio web del PR 93, no hubo merge/push/deploy y
falta la prueba en el teléfono. La variante es debug con firma propia, como
la distribuida por el workflow APK; no se generó AAB en esta continuación.

## Cámara y actualización del kiosko — 15 de septiembre de 2026

Dos causas encontradas: ScanRow pedía JPEG/PNG, pero BridgeWebChromeClient de
Capacitor solo abre captura con `image/*`; además el manifiesto Android no
declaraba la consulta IMAGE_CAPTURE usada por resolveActivity en Android 11+.
CAMERA concedido no resuelve esa visibilidad. Se ajustan web y APK 1.4 (código 5).
El middleware bloqueaba `/api/app/version` al kiosko: se habilita únicamente GET
autenticado a esa ruta exacta, para recibir el aviso de actualización.

El usuario autorizó continuar y señaló la distribución por servidor. Se conserva
el circuito de `compartido/apk/version.json`, descarga firmada y validación SHA-256.
Primero se valida/sube el binario y luego se cambia el manifiesto atómicamente.
Implementación subida para revisión: [PR 93 web](https://github.com/CLARVEX-TEAM/clarvex-platform/pull/93)
y [PR 3 Android](https://github.com/CLARVEX-TEAM/clarvex-movil/pull/3).
Pasaron 28 pruebas locales pertinentes, TypeScript completo, ESLint de los
archivos afectados, análisis XML y git diff --check. No se hizo build completo
local ni se generó una APK. La [CI web](https://github.com/CLARVEX-TEAM/clarvex-platform/actions/runs/35021791738)
y la [compilación Android](https://github.com/CLARVEX-TEAM/clarvex-movil/actions/runs/35021794570)
no llegaron a iniciar sus pasos: GitHub informa pagos recientes fallidos o
límite de gasto insuficiente. No se modificó facturación ni se omitió CI.

Sin merge, deploy ni publicación de APK: consulta de solo lectura al servidor
confirmó versionCode 4 / 1.3 en el manifiesto. Tras desbloquear Actions, ejecutar
las validaciones del SHA exacto, compilar con la firma habitual y comparar el
certificado antes de publicar por el circuito existente. No anunciar la 1.4
antes de que su binario esté disponible y verificado. La comprobación final
de cámara necesita el teléfono. No se leyeron `.env` reales ni claves de firma.

## La app debajo de las barras, y el aviso de actualización — 7 de septiembre de 2026

El gerente reportó tres cosas usando la app. Las dos primeras son el mismo fallo
visto por sus dos extremos; la tercera destapó que el mecanismo de actualización
nunca se había ejecutado contra un teléfono.

Desplegado en `6a78315`, `8240471` y `5bb0c67`. APK **1.3 (versionCode 4)**
publicada en el manifiesto del servidor y comprobada instalándola.

### ⚠️ En Android, `env(safe-area-inset-*)` NO cubre las barras del sistema

Solo reporta el recorte de la pantalla --la muesca de la cámara--, **nunca** la
barra de estado ni la de navegación. En iOS y en la PWA de Chrome vale; dentro
del WebView de la app vale **cero**.

Las utilidades `.pt-safe` y `.top-safe` ya existían y ya estaban puestas en
todas las cabeceras: no había nada mal escrito, simplemente no medían nada. Con
`targetSdk 35`, desde Android 15 la app va de borde a borde por obligación, así
que el hueco que antes ponía el sistema desapareció y los títulos quedaron bajo
el reloj y la barra de la app encima de la barrita de gestos, donde el gesto de
volver al inicio se come los toques de las pestañas.

**Es la misma web con y sin fallo según el envoltorio**, y por eso costó verlo.

Ahora las medidas vienen de cuatro variables --`--safe-top`, `--safe-bottom`,
`--safe-left` y `--safe-right`-- que rellena `BarrasDelSistema.java`, en
`clarvex-movil`. Donde nadie las rellena se quedan con `env()` de respaldo, así
que el navegador, la PWA y una versión vieja de la app se comportan igual que
antes: se puede desplegar la web antes que el APK.

⚠️ **La barra inferior y el hueco de `AppFrame` suben JUNTOS.** Subir solo la
barra la deja tapando el último renglón de cada pantalla.

⚠️ **`.pt-safe` SUSTITUYE el `padding-top`, no lo suma.** Ponerla sobre algo que
ya tenía `pt-16` se lleva por delante esa separación; para conservarla va
`--pt-safe-base` en el `style`, como hacen `AppHeader`, `HomeHeader` y
`CabeceraChat`.

#### Por qué no se usa `adjustMarginsForEdgeToEdge` de Capacitor

Encoge el WebView hasta dejarlo entre las barras, y es una sola línea de
configuración. Se probó y **se descartó**: deja dos franjas sólidas pintadas con
el fondo de la VENTANA, y esta app elige claro/oscuro **por dentro**, con un
interruptor propio que puede no coincidir con el de Android. Quien tuviera la
app en claro y el teléfono en oscuro vería dos bandas negras. Publicando las
medidas, la web sigue pintando de borde a borde con **su** fondo.

⚠️ **Y su valor por omisión es `"disable"`, no `"auto"`.** La documentación de
Capacitor dice que faltando la opción se comprueba Android 15; su
`CapConfig.java` dice lo contrario. Sin esa línea no se ajusta nada, y el
síntoma parece un problema de CSS nuestro.

⚠️ **Solo viajan ENTEROS del Java al WebView.** `String.format` usa la
configuración regional del teléfono y en español escribe `11,6`, que CSS
descarta sin decir nada: el fallo habría salido solo en los teléfonos de la
tienda y jamás en una prueba en inglés. La división se hace en JavaScript.

⚠️ **El oyente de insets va en la RAÍZ, no en el WebView.** Puesto en el WebView
se sustituye su propio reparto, y con él se pierde el recorte de pantalla que sí
sabe usar por su cuenta.

⚠️ **Y hay que volver a publicarlas en cada carga.** Los insets se avisan cuando
CAMBIAN --al girar el teléfono, al entrar en multiventana--, no al cargar una
página. Una recarga estrenaba un documento sin las variables.

### ⚠️ Un `target="_blank"` SACA de la app

En el WebView no hay pestañas, así que Android se lo pasa a Chrome. Tocar el
flyer de un comunicado sacaba de la app, y volver significaba buscarla entre las
aplicaciones abiertas.

Comunicados, evidencias, faltantes y las páginas del checklist colgaban de ahí.
El chat **no** lo sufría porque ya tenía visor propio, y es ese el que se
reutiliza mediante `ImagenAmpliable`, en `components/VisorImagen.tsx`. Los
enlaces a PDF y los enlaces del chat se quedan como están: ahí salir al
navegador es lo correcto.

⚠️ **El botón físico de atrás tiene que cerrar el VISOR, no la pantalla.** Se
apila una parada de historial al abrirlo. El efecto que la apila va SIN
dependencias: quien monta el visor pasa `onClose` como función anónima, así que
cambia en cada pintado, y con la dependencia se apilaría una parada por pintado.

### ⚠️ Un componente del layout raíz se ejecuta UNA VEZ por documento

`app/layout.tsx` no se vuelve a montar en una navegación de cliente. Un
`useEffect(..., [])` de ahí dentro corre una sola vez y su respuesta queda
congelada para toda la vida del documento.

**Esto ya ha pasado TRES veces, con tres componentes hermanos del mismo
archivo, y las tres se reportaron desde un teléfono porque ninguna da error:**

| Componente | Qué se perdía |
|---|---|
| `PwaRegister` | el token del aparato, conseguido en `/login` y rechazado con 401 |
| `ActualizacionApp` | el aviso de versión nueva, contestado antes de publicarla |
| `CandadoHuella` | el candado activado desde Perfil, decidido al abrir la app |

⚠️ **El tercero es el más ilustrativo.** `CandadoHuella` guardaba la referencia
al plugin **solo si el candado ya estaba encendido al montar**. Quien lo
activaba desde Perfil se quedaba sin oyente de segundo plano: el interruptor
decía «activado» y el candado no hacía absolutamente nada hasta cerrar la app
del todo. La preferencia hay que leerla **en el momento de decidir**, no al
montar.

### ⚠️ `enContenedorNativo()` dice que sí ANTES de que existan los plugins

Lo más caro de todo esto, y lo menos evidente. Costó cuatro rondas y tres
hipótesis falsas sobre el código.

El puente de Capacitor llega en **dos piezas**. El núcleo --`isNativePlatform`,
`getPlatform`-- se inyecta al arrancar el documento y está listo enseguida.
`PluginHeaders` --la lista de lo que el binario trae de verdad-- viaja en un
guion aparte y llega **después**. Y es justo esa lista la que consulta
`isPluginAvailable`, o sea la que decide si `pluginNativo()` devuelve el plugin
o `null`.

Medido en un teléfono, con la traza del propio componente:

```
05:14:27.774 montado
05:14:27.774 contenedor listo tras 0 ms
05:14:27.774 sin plugin Biometria -> abierto
```

Cero milisegundos para el contenedor, y el plugin todavía sin llegar. El candado
se abrió para siempre por esa diferencia.

⚠️ **Esperar a `enContenedorNativo()` NO sirve**: ese nunca es el que falta. Si
algo necesita un plugin al arrancar, la condición de espera tiene que ser **el
plugin**, y hay que sondear porque su llegada no dispara ningún evento.

⚠️ **Y el diagnóstico mentía sin querer.** Sus trece filas salían verdes --el
plugin disponible, el sistema listo, el candado activado-- porque se miran
DESPUÉS, cuando ya está todo puesto. Mirar las condiciones más tarde no dice
nada de un fallo de arranque: hay que **anotar el camino cuando ocurre**. De ahí
`window.__clarvexCandado` y el bloque «Qué hizo el candado al arrancar».

La regla general, que es la que salió cara: **ante un fallo que solo pasa al
arrancar, grabar la traza antes que razonar sobre el código.** Las tres
hipótesis previas eran plausibles y las tres estaban equivocadas; la traza lo
resolvió en un intento.

Se arregló el primero el 6 de septiembre y **no el segundo**, que se había
escrito el mismo día. El 7 se publicó la 1.3 con la app abierta y no se la
ofreció a nadie: el manifiesto anunciaba la 2, el teléfono tenía la 3, «al día»,
y la 4 se publicó después.

⚠️ **Y lo del layout raíz monta también en `/login`**, donde todavía no hay
sesión. Un endpoint que la exija devuelve **401**, y como el login navega con
`router.replace` --navegación de cliente-- no hay remonte ni segunda
oportunidad. **401 es «todavía no sé», no «no hay nada»**; cualquier otro
rechazo sí es definitivo, porque repetir un 500 en cada pantalla no lo arregla.

La regla para lo próximo que se monte ahí: **reintentar por EVENTO** --cambio de
pantalla mientras falte respuesta, y regreso a la app--, nunca por temporizador,
que gastaría batería sin ninguna señal de que algo haya cambiado.

### ⚠️ Y lo que TAPA la pantalla no puede decidirse en un efecto

`CandadoHuella` nace en estado «comprobando», que no es «abierto», así que
pintaba su velo **antes** de que ningún efecto pudiera mirar si hacía falta. En
Brave y en la PWA aparecía el candado y se quitaba solo: se lee como que la app
se cuelga al abrir.

No se arregla con el estado inicial de React, porque lo que decide vive en
`localStorage` y en el puente nativo, y las dos cosas son de cliente: cualquier
valor que difiera del servidor rompe la hidratación.

Se resuelve como el parpadeo del tema, que es el mismo problema: un guion en
línea en `app/layout.tsx` mira las dos condiciones **antes del primer pintado** y
marca `data-candado` en el `html`; el CSS deja el velo en `display:none` mientras
no esté esa marca. React solo lo mantiene al día para las veces siguientes, y
**nunca desde «comprobando»**, que devolvería el parpadeo por la puerta de atrás.

⚠️ El elemento NO puede llevar la clase `flex` de Tailwind: pondría
`display:flex` con la misma especificidad y anularía el ocultado. Lo cubre
`tests/candado-huella.test.ts`.

### El aviso de actualización, probado por fin contra un teléfono

Estaba escrito entero y **nunca se había ejecutado de punta a punta**. La primera
actualización real destapó dos fallos más:

⚠️ **El enlace de descarga tiene que ser ABSOLUTO.** El manifiesto lo entrega
relativo --`/api/app/apk?t=…`--, que es lo natural en la web, pero quien descarga
no es el WebView: es `Actualizador.java`, con `new URL(url)`. Sin esquema lanza
`MalformedURLException: no protocol`, y el mensaje sale en rojo dentro de la
tarjeta **con el token entero a la vista**.

Se resuelve en la WEB (`urlAbsolutaDeDescarga`) y no en el plugin ni en el
servidor: el plugin ya viaja dentro de los APK repartidos y no se puede cambiar
sin repartir otro; y el origen del WebView es de donde se cargó la app, que es
exactamente el servidor que firmó el token.

⚠️ **`REQUEST_INSTALL_PACKAGES` se concede FUERA de la app.** Al volver de los
ajustes, la tarjeta seguía diciendo «Abrir ajustes de Android» con el permiso ya
dado: nada lo volvía a mirar, y había que cerrar la app entera.

⚠️ **Tras concederlo hay que pedir un enlace NUEVO.** El token dura diez minutos,
y entre ir a los ajustes, buscar Clarvex en la lista y volver se puede pasar: sin
eso el permiso queda bien y la descarga falla con un **401 que no dice nada de un
token caducado**.

⚠️ **Nunca se vuelve a preguntar a media descarga**, ni forzando. La respuesta
reescribe el estado de la tarjeta y la barra de progreso desaparecería con el
archivo a medias. La guarda va lo PRIMERO en `hayQueMirar` justamente por eso.

⚠️ **Nada de esto se ve fallar.** No hay pantalla de error ni línea de registro:
la persona no ve nada, exactamente igual que cuando de verdad no hay versión
nueva. Los dos casos son indistinguibles desde fuera, y por eso lleva pruebas.

### Publicar una versión nueva de la app

El APK vive fuera del repositorio, en `compartido/apk/`. Lo compila Actions
(`apk.yml`) y se firma con la llave de los secretos: **la huella tiene que seguir
siendo `87:58:A3:26:…`**, que es la de `assetlinks.json` y la que permite
instalar encima sin desinstalar ni perder la sesión.

⚠️ **El archivo PRIMERO, el manifiesto DESPUÉS.** Al revés, el manifiesto
apuntaría un instante a algo que no existe y la app diría «no se pudo descargar».

⚠️ **El manifiesto se cambia con `mv`, nunca escribiéndolo en su sitio.** Los dos
workers de PM2 lo leen, y a medio escribir uno se encuentra un JSON partido.

⚠️ **Subir el `versionCode`.** Android no reemplaza una versión por otra con el
mismo código, y el aviso compara ese entero. Olvidarlo es un fallo mudo.

⚠️ **Comprobar el SHA-256 EN EL SERVIDOR** antes de que el manifiesto lo apunte,
subiéndolo con otro nombre. Es lo que la app compara antes de instalar.

⚠️ **El aviso solo lo ve quien YA tiene la app.** `/api/app/version` exige sesión
y `ActualizacionApp` solo se pinta dentro del contenedor nativo: la PRIMERA
instalación sigue siendo a mano.

## POS: relectura y diagnóstico privado de rechazos — 6 de septiembre de 2026

Estado: implementado y probado LOCALMENTE en `fix/pos-devoluciones-relectura`,
base `7616c87`. La solicitud corresponde al error de Retool «La lectura no
cuadra» reportado al cargar días con devoluciones. Se conservó el trabajo de
FCM que ya estaba en la rama de origen. El arreglo y el historial quedaron en
`d449347`. Después, el usuario autorizó subir la rama y crear el PR para revisión.
CI pendiente; sin merge, deploy ni escrituras en Retool, AWS, Slack o una base real.

Las dos fotos solo permiten leer el mensaje de rechazo. Los tres importes de
cada fila no cumplen la identidad existente de bruto/descuento/posterior: eso
demuestra una inconsistencia de la transcripción, pero NO qué importe o columna
del documento es correcto. Hace falta el PDF original o una captura directa del
reporte completo para cerrar el caso real. No se dedujo una nueva fórmula ni se
inventaron importes de devolución a partir de la diferencia.

Fallo confirmado en `lib/pos-vision.ts`: el fallback comprobaba la estructura,
pero no las cuentas, y Gemini dejaba de recorrer modelos al recibir HTTP 200.
Ahora cada candidato pasa `validateVisionText` y `posCaptureRows` antes de salir.
Cuando falla, se vuelve a transcribir el documento original; no se manda una
tabla «corregida», ni se mezclan filas de lecturas distintas. Si solo existe
Bedrock hay un máximo de dos intentos; Gemini recorre sus modelos, con una
segunda lectura si es el único modelo/proveedor. Las lecturas correctas siguen
saliendo a la primera. Se conserva la validación final en la API.

Ambos proveedores reciben el mapa explícito de columnas, incluida la distinción
entre «Ventas posteriores Descuentos», «Bruto Devoluciones» y «Neto Ventas».
Gemini solicita también las dos columnas de devolución en su esquema. La
instrucción de relectura exige transcribir, sin calcular cifras para cuadrarlas.
Se mantienen IVA, centavos, piezas brutas, descuentos revertidos y netos negativos.

El presupuesto de 55 s empieza antes de Bedrock; cada intento usa como máximo
25 s y el tiempo restante. `readWithBedrock` admite ese límite como cuarto
argumento opcional. Los errores de lectura persistentes devuelven un mensaje
que pide el PDF/captura original o captura manual. Un rango de varios días se
rechaza de inmediato para no fomentar que un reintento altere sus fechas.

Validación de relectura inicial: 79 pruebas de POS, descuentos y captura de KPIs,
sin fallos/omisiones, en Node 22.23.1. Diez pruebas nuevas ejecutan el lector real en VM con fronteras
Bedrock/Gemini simuladas y datos sintéticos (solo los tres importes del rechazo
se tomaron de la foto). Antes del arreglo fallaban siete de las primeras nueve.
Cubren fallback aritmético y JSON, proveedor único, devolución pura, agotamiento,
presupuesto compartido, configuración y rangos de varios días. TypeScript
completo y ESLint afectado aprobados. No se ejecutó una lectura real con
proveedores, no se leyeron entornos reales ni se usó ninguna base.

### Historial privado aprobado después del arreglo

El endpoint de Retool `/api/admin/capture/kpis/pos-report` archiva los rechazos
HTTP 422 tras verificar secreto de captura, tienda y codificación: fallo final
de lectura, validación contable o nombres ambiguos. Guarda el original exacto
que recibió el servidor (puede haber sido reducido antes por Retool), su SHA-256,
fecha, tienda, motivo y texto de cada intento de IA, proveedor/modelo y duración.
Los errores de transporte quedan como intentos sin texto. Máximo ocho intentos,
100,000 caracteres por respuesta; `textTruncated` declara si se recortó. No guarda
claves, prompts, URLs con tokens ni una identidad inventada: el servicio de captura
no acredita quién adjuntó el archivo (`source=capture-backend`, `actorVerified=false`).

No se archivan lecturas finalmente correctas, errores previos a validar tienda/
archivo ni cargas por Telegram. No se agrega nada a los KPIs o al AuditLog general.
No sustituye el respaldo de datos ni permite recuperar originales de fallos
anteriores a su publicación. Tampoco certifica la retención del proveedor o Retool.

Persistencia en `lib/pos-failure-store.ts`: por omisión usa
`~/.local/share/clarvex/pos-diagnostics` bajo el usuario que ejecuta PM2. Se puede
fijar `POS_DIAGNOSTICS_DIR` a una ruta absoluta privada FUERA del checkout; se
rechazan el checkout y carpetas enlazadas. La carpeta se crea con 0700 y los
archivos con 0600 en Linux. Ambos workers comparten el historial y las releases
no lo borran. Sin R2 público, credenciales nuevas ni migraciones.

Escritura exclusiva entre procesos mediante `.writer-lock`, archivo temporal,
sincronización a disco y rename. Reserva mínima de disco libre de 256 MiB,
límite de 100 casos y 128 MiB confirmados, hasta 18 MB por archivo temporal.
Si guardar falla, el rechazo mantiene su causa e indica `diagnosticSaved=false`,
sin folio ni datos sensibles en el log; Retool recibe además ese aviso dentro de
`detail`. No se cambió su frontend; queda pendiente verificar cómo presenta el
folio la app publicada. Solo se afirma guardado después de completar la escritura.

Consulta técnica con sesión de administrador de plataforma:

- `GET /api/admin/pos-diagnostics`: lista JSON; filtro opcional `storeId`.
- `GET /api/admin/pos-diagnostics?id=<folio>`: descarga el diagnóstico JSON.
- `GET /api/admin/pos-diagnostics?id=<folio>&format=original`: descarga la imagen
  o PDF original como adjunto; se verifica su huella antes de devolverlo.

Se comprueba la sesión de servidor y `platformAdmin` en cada petición. Gerencia,
asesores, demos y el secreto del backend por sí solo no acceden. No se añadió la
ruta a las excepciones del middleware. Respuestas privadas sin caché, `nosniff`
y CSP sandbox; no se renderiza HTML enviado por la IA. No hay panel nuevo en Retool.

Los casos caducan para lectura/listado a los siete días; pueden eliminarse antes
si se alcanza la cuota. La eliminación física ocurre en la siguiente escritura
o al correr `node --import tsx scripts/purgar-pos-diagnostics.ts`. **Preparación
pendiente al publicar:** programar ese guion diariamente con el mismo usuario y
directorio de PM2 para limpiar también en días sin capturas. El guion no carga
`.env`; una ruta personalizada debe pasarse explícitamente a la tarea. No se
creó ningún cron ni se ejecutó la purga sobre archivos reales. Si un proceso muere
con el bloqueo adquirido, no se roba el bloqueo: detener/descartar escritores
activos y retirar solo el directorio vacío `.writer-lock` antes de reintentar.

Validación ampliada: 103 pruebas sin fallos/omisiones, con Node 22.23.1. Los
handlers y guardas de autenticación se ejecutan en VM con fronteras simuladas;
el almacenamiento usa archivos temporales y verifica bytes/hash, concurrencia,
cuotas, caducidad, rutas y enlaces. Incluye recuperación de la respuesta de IA,
403/401 en descarga/listado, error de disco y ausencia de archivo en éxito.
TypeScript completo sin emisión/incremental y ESLint afectado aprobados. Las
comprobaciones específicas de modos POSIX quedan para Linux/CI; aquí se corrió
Windows. Build aislado aprobado con Node 22.23.1 en una copia temporal del mismo
disco: 73 páginas, sin `.env`, configuración ficticia, red externa bloqueada y CSS
de fuentes simulado. Solo apareció el aviso conocido de Sentry/OpenTelemetry;
la prueba no certifica la tipografía ni los servicios reales. No se probó ninguna
base real. La CI del PR queda pendiente de ejecución en GitHub.

## Notificaciones en la app de Android — 6 de septiembre de 2026

La app de la Play Store es la web dentro de un contenedor de Capacitor
(`D:\Documents\clarvex-movil`). El contenedor carga `team.clarvex.tech`, así que
todo lo que se publica en la web aparece en el teléfono sin recompilar.

⚠️ **Menos las notificaciones. El WebView de Android NO implementa la API de
Push.** Ni `PushManager` ni `Notification` existen ahí, así que dentro de la app
instalada `components/PwaRegister.tsx` no podía ni pedir permiso: registraba el
service worker, salía por la rama de `!("Notification" in window)` y se quedaba
callado. La PWA sí recibe avisos y la app **no**, sin ningún error en ninguna
pantalla — que es lo peor de este fallo: una notificación que no llega no deja
rastro. Es una limitación conocida del WebView, y FCM con un puente de JS es la
salida estándar.

- https://pushpad.xyz/blog/can-i-use-the-web-push-api-with-hybrid-mobile-apps
- https://developer.mozilla.org/en-US/docs/Web/API/PushManager

### Desplegado el 7 de septiembre de 2026

Autorizado expresamente. `main` en `e591e3c`, sirviendo
`releases/20260907-044543-e591e3c`. La corrida de Deploy paso su preflight --CI
verde del mismo SHA-- y termino en verde.

⚠️ **El despliegue llevo tambien el trabajo de POS de otra sesion** (PR #47,
endpoint `/api/admin/pos-diagnostics`), porque se despliega `main` entero y no
un subconjunto. Se aviso antes de correrlo y se comprobo su superficie de
autenticacion: sesion real de admin de plataforma, `denyDemo`, cabeceras
privadas y validacion de entrada.

Comprobado despues, con instrumentos distintos del que hizo el cambio:

- `/api/health` desde internet: `200`, `db: ok`, 0.31 s.
- Los **dos** procesos de PM2 `online`, con cero reinicios y con el `cwd` en la
  version nueva. Es el paso que senala «Actualizar la app en produccion»: si PM2
  se queda apuntando a la ruta vieja, los despliegues parecen funcionar sin
  cambiar nada.
- La migracion aplicada: `DeviceToken` existe, 0 filas.
- El `.env` de la version nueva resuelve a `/home/ubuntu/clarvex-app/.env` y ve
  las tres variables `FCM_*`.

⚠️ **`/proc/<pid>/environ` NO sirve para comprobar el `.env`.** Muestra el
entorno con el que arranco el proceso, y Next.js carga el archivo en tiempo de
EJECUCION: ahi no aparece ninguna variable del `.env`, ni siquiera
`DATABASE_URL` --que la app esta usando, porque la salud dice `db: ok`--. Leerlo
como «faltan las credenciales» manda a buscar donde no esta el problema; se
descubrio comprobando con una variable de control.

Queda una sola pieza sin probar de extremo a extremo: token real -> telefono
real. El resto de la cadena del servidor si se probo contra la FCM de verdad.

### El puente de Capacitor llega a la página remota

⚠️ **`window.Capacitor` existe en `team.clarvex.tech` cuando la sirve la app.**
No es evidente con `server.url` apuntando a un dominio externo, pero
`Bridge.java` inyecta el puente con `addDocumentStartJavaScript` sobre el origen
de `appUrl`, y `JSExport.getPluginJS` añade `window.Capacitor.PluginHeaders` con
la lista de plugins que el binario trae **de verdad**.

Eso decide el diseño: **la capa nativa se pide desde la web, no al revés.** La
página tiene la sesión --su cookie-- así que registra el aparato con
`/api/push/device` como quien guarda cualquier otra cosa. Lo contrario obligaría
a darle credenciales propias a la app, y todo lo que se compila en el paquete lo
puede leer quien lo descargue.

⚠️ **`Capacitor.Plugins.PushNotifications` está `undefined`**, y es el atajo que
parece correcto. `Plugins` lo rellena cada paquete de JS al importarse, y aquí no
se importa ninguno a propósito: `lib/puente-nativo.ts` NO depende de
`@capacitor/core` para no meter una dependencia de móvil en el bundle que también
descargan los navegadores. Se pide con `Capacitor.registerPlugin("PushNotifications")`,
después de comprobar `isPluginAvailable`, que mira `PluginHeaders`.

### Los dos caminos van separados

`dispatchPushToUsers` (`lib/push.ts`) manda por los dos y ninguno puede tumbar al
otro:

| Camino | Quién lo recibe |
|---|---|
| Web Push con VAPID | el navegador y la PWA instalada |
| FCM (`lib/push-fcm.ts`) | la app de Android |

⚠️ **Antes, la falta de claves VAPID cortaba la función entera.** Con dos
destinos eso dejaría a la app sin avisos por un problema del navegador. Cada
rama comprueba lo suyo y se lanzan con `allSettled`. El filtro de usuario activo
está DUPLICADO en las dos consultas, deliberadamente: una baja no puede recibir
avisos de la tienda porque el llamante no filtró su lista.

Quien tenga la PWA y la app recibe dos avisos. Se prefiere eso a decidir por la
persona cuál de sus aparatos calla.

### Cuatro trampas que no dan error

⚠️ **La importancia del CANAL manda sobre la prioridad del mensaje.** Desde
Android 8, `priority: "high"` no basta: si el canal no existe, Firebase usa uno
de reserva con importancia media y los avisos entran **mudos**. Se reportaría
como «no llegan las notificaciones» y llegan. `CANAL_AVISOS` se crea desde la web
con importancia 5 antes de registrar.

⚠️ **El id del canal vive en dos repositorios.** `lib/push-canal.ts` lo exporta
para el emisor y para quien lo crea; la cuarta copia es
`default_notification_channel_id` en el AndroidManifest de `clarvex-movil`, que
no se puede importar. Si divergen, otra vez mudo y sin error.

⚠️ **FCM contesta 400 por un token muerto Y por un payload mal armado.** Tratar
el segundo como el primero desregistraría los teléfonos de toda la tienda por un
bug de una línea. `esTokenMuerto` solo caduca el aparato si el cuerpo señala al
campo `message.token`; lo cubre `tests/push-fcm.test.ts`, comprobado poniéndolo
en rojo.

⚠️ **La llave privada llega con `\n` literales.** Un `.env` no admite un valor de
varias líneas sin comillas, así que la de Google se pega escapada e
`importPKCS8` la rechaza con un error que habla de PKCS#8 y no de comillas. Se
aceptan las dos formas y se comprueba que tenga cabecera PEM antes de firmar.

⚠️ **Y el icono de la barra de estado se pinta como SILUETA.** Un logo a color
sale como un cuadro blanco. `ic_stat_clarvex` se generó extrayendo la marca del
propio `public/icon-512.png` por saturación --por luminancia no vale: el azul
claro del degradado tiene casi tanto brillo que el blanco-- e ignorando el borde,
donde el icono lleva un resplandor cálido que cualquier umbral de blanco se traga.

### Lo que salio de revisar esto antes de fusionarlo

⚠️ **`PwaRegister` se monta en el LAYOUT RAIZ, o sea tambien en `/login`.** Ahi
no hay sesion, asi que el registro del aparato volvia **401** — y el login
navega con `router.replace`, que es navegacion de cliente: el layout NO se
remonta y el efecto no se repite. En la primera instalacion el token se conseguia
en la pantalla de acceso y **se perdia**; la app no recibia nada hasta el
siguiente arranque, justo cuando la persona acaba de conceder el permiso. Sin un
solo error a la vista.

⚠️ El camino WEB tenia el mismo fallo y **ni siquiera miraba la respuesta**: el
navegador quedaba suscrito ante el servicio de push y el servidor sin saberlo.
Es anterior a este trabajo; se arregla igual porque es la misma linea.

Lo que no se pudo guardar queda pendiente y se reintenta **por evento** --al
cambiar de pantalla y al volver a la app--, nunca por temporizador. Se distingue
el 401 («aun no hay sesion», se reintenta) de cualquier otro rechazo (no se
insiste): confundirlos pierde el aparato en silencio por un lado, o golpea al
servidor en cada navegacion por el otro. `tests/push-registro-sin-sesion.test.ts`,
comprobada en rojo contra el comportamiento anterior.

⚠️ **Un 404 de FCM ya NO caduca el aparato por si solo.** La regla decidia por el
codigo de estado y eso era lo mas peligroso del archivo. Sondeado contra la FCM
real el 6 de septiembre de 2026 con la cuenta de servicio de Clarvex:

| Caso | Respuesta real |
|---|---|
| token invalido, proyecto correcto | **400** con `fieldViolations` en `message.token` |
| proyecto inexistente | **403 PERMISSION_DENIED**, no 404 |

O sea que el desastre que se temia --un `FCM_PROJECT_ID` mal puesto borrando
todos los tokens-- no ocurre por esa via, pero un 404 inesperado si lo habria
hecho. Ahora se decide por el CUERPO: `errorCode: UNREGISTERED` o el
señalamiento del campo del token. Si el candado se pasa de estricto, lo que pasa
es que se acumulan tokens muertos --una peticion desperdiciada por aviso-- y
quedan a la vista en el log. Al reves no tiene arreglo.

⚠️ **Estar dentro del contenedor sin el plugin ya se avisa.** Una version vieja
de la app sobre la web nueva se quedaba sin notificaciones y sin decirlo, porque
el camino web tampoco la cubre.

### La API v1, no la heredada

`fcm.googleapis.com/fcm/send` --la de la «server key»-- está retirada desde 2024.
La v1 firma cada petición con una cuenta de servicio: JWT RS256 con `jose`,
canje por un token de acceso de una hora, y **una petición por aparato** (la v1
no tiene envío múltiple; el endpoint `/batch` se fue con la API vieja). Son cinco
personas por tienda: en paralelo termina en un suspiro.

### Variables nuevas

```env
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

Salen del JSON de una cuenta de servicio de Firebase con el rol **Firebase
Cloud Messaging API Admin**, nada más. Sin las tres, `enviarPorFcm` no toca la
red y Web Push sigue igual: la app se queda sin avisos y el resto no se entera.

⚠️ **`google-services.json` NO es un secreto y SÍ va al repositorio** de
`clarvex-movil`. Viaja dentro de cada APK, así que lo tiene cualquiera que
descargue la app; y la compilación lo necesita. El secreto es la cuenta de
servicio del servidor, que va al `.env` y nunca aquí.

⚠️ **Sin ese archivo el APK se compila EN VERDE y sale mudo.** Capacitor aplica
el plugin de Google solo si existe, y escribía el aviso en `logger.info`, que no
se ve. Ahora sale por `logger.lifecycle` y el workflow lo escribe en el resumen
de la ejecución, que es donde se mira después.

## Los PDF salen del Excel, no de un dibujo aparte — 6 de septiembre de 2026

El gerente reportó que los PDF de Cuota Justa y RDS «salen muy diferentes, hasta
chuecos» comparados con los que manda corporativo.

⚠️ **La causa era que había DOS generadores que no se hablaban.** El XLSX es la
plantilla corporativa —`lib/weekly-performance-xlsx.ts` la abre y le mete los
datos conservando hojas, estilos y formato de impresión— pero el PDF se
**redibujaba a mano** en `lib/weekly-performance-pdf.ts`: 449 líneas de pdf-lib
con coordenadas fijas. Una imitación. Nada ataba una cosa a la otra, así que
divergían: sin las etiquetas verticales del margen, con el amarillo tiñendo
bloques enteros, las secciones como bandas horizontales y Helvetica en vez de
Calibri.

Ahora el PDF se genera **convirtiendo el propio XLSX** con LibreOffice
(`lib/xlsx-a-pdf.ts`). No se parece al formato corporativo: **es** el formato
corporativo.

- **LibreOffice 24.2.7 instalado en el servidor** (`libreoffice-calc-nogui` +
  `fonts-crosextra-carlito`, 321 MB, sin recomendados). El disco pasó de 84 % a
  86 %. Esto **contradice a propósito** la decisión anterior de no depender de
  Excel/LibreOffice en el servidor: se cambió sabiendo lo que cuesta, porque es
  la única forma de que el PDF sea el documento y no una copia.
- ⚠️ **Un perfil de usuario POR CONVERSIÓN** (`-env:UserInstallation`). Sin eso,
  LibreOffice se niega a arrancar una segunda instancia con el mismo perfil, y
  con dos instancias de PM2 dos exportaciones a la vez se pisan.
- ⚠️ **Convierte TODAS las hojas visibles**, y la primera del libro es
  `INSTRUCCIONES`: el PDF salía con una página A4 vertical de instrucciones
  delante. `buildWeeklyPerformanceWorkbook` acepta `{ soloDocumento: true }`,
  que la oculta **solo en la copia que se convierte**. El XLSX que descarga el
  gerente la conserva: es donde dice que solo se llena lo amarillo.
- ⚠️ **El idioma decide los nombres de mes.** Sin `LANG`/`LC_ALL` en español la
  fila FECHA sale «23-Aug-26» y el corporativo dice «23-ago-26».
- ⚠️ **Se comprueba la cabecera `%PDF`, no el código de salida.** LibreOffice
  puede salir en 0 y dejar un fichero vacío; servir eso es peor que el respaldo.
- **El trazado con pdf-lib se conserva como respaldo.** Si LibreOffice no está
  —una máquina de desarrollo— la exportación sigue devolviendo un PDF y se
  registra cuál de los dos salió. Sin esa línea, un servidor sin aprovisionar
  serviría el PDF viejo para siempre y nadie sabría por qué «volvió a verse raro».

⚠️ **El PDF dice `WHATSAPP` donde la app dice `PASILLO INFINITO`.** Es la palabra
de la plantilla, y el XLSX siempre la usó; solo el dibujo a mano ponía el nombre
interno. Cambiarlo es cambiar la plantilla.

### El café de las PERDIDAS

Las tres filas de `PERDIDA` del RDS no usan un semáforo: usan una **escala de
color** rojo `FFFF0000` → verde `FF00B050`, y una escala **interpola**. Los
rangos originales eran:

```
D16:M16   de -1 a 0     el cero caía en el tope    → verde
D18:M18   de -1 a 1     el cero caía en el medio   → CAFÉ
D20:M20   de -1 a 1     el cero caía en el medio   → CAFÉ
```

Con datos reales no se nota —las pérdidas son de cientos o miles de pesos y la
escala los recorta a rojo o verde puros— pero una pérdida de **cero** salía café
en dos filas y verde en la tercera. `sinMezclaEnPerdidas()` mueve las tres a
**0 → 1**: cero o menos rojo, positivo verde, y las tres dicen lo mismo. Los
colores no se tocan: son los extremos que ya traía la plantilla.

⚠️ Queda una franja de mezcla entre `$0.00` y `$1.00`. No se cierra porque
hacerlo exige sustituir la escala por reglas discretas, y eso pide rellenos
nuevos en `styles.xml` que NO son los del formato corporativo. Un peso de pérdida
no existe en la operación; un color distinto sí se vería en cada exportación.

⚠️ Esto cambia también el XLSX que se descarga: es el mismo archivo.

Comprobado convirtiendo en el servidor y comparando contra los PDF reales de la
tienda: con datos dispares, negativo rojo, cero rojo y positivo verde, con los
iconos de círculo y estrella intactos.


## Revisión adicional corregida — 5 de septiembre de 2026 (publicación autorizada)

Estado local en `fix/auditoria-cierre-septiembre`, base `8bc44f5`. Autorización:
«Arreglalo» y «sigue» tras la revisión; después, «as push y sube los cambios»
autoriza commit y push de la rama para revisión. No incluye merge ni despliegue.
El working tree estaba limpio antes de crear la rama; no se alteraron cambios
ajenos, historial, remotes, credenciales ni infraestructura.

Correcciones implementadas:

1. `app/api/webhooks/slack/ack/route.ts`: el resultado de `$transaction` se asigna
   DESPUÉS del await, no dentro del callback. Un INSERT que luego se revierte
   en COMMIT ya no deja `recienCreado=true`. La relectura también cubre carreras
   y fallos de conexión; sin registro confirmado devuelve 503 y no toca Slack.
   `tests/slack-ack-transaction.test.ts` ejecuta el código del handler con sus
   dependencias simuladas; cubre fallo anterior, COMMIT, lectura, GET, token
   inválido, repetición y concurrencia simulada. No es una prueba de PostgreSQL.
2. `scripts/deploy-release.sh`: valida todos los procesos `clarvex-team`, su
   número configurado, estado online, cwd y ejecutable. Recomprueba tras start;
   un solo worker correcto ya no basta. La escritura del puntero comprueba error
   explícito, para no depender de errexit dentro de un if. Las 53 comprobaciones
   incluyen rollback de versiones mezcladas, procesos caídos, faltantes y
   duplicados. No se recompila al revertir y no se revierte el esquema.

   ⚠️ **`pm2 save` avisa; NO revierte.** En la primera versión de esta ronda
   devolvía 1 como las demás escrituras, y eso mandaba por la puerta del rollback
   un fallo que no dice nada sobre si la versión está sirviendo: para cuando se
   ejecuta, PM2 ya tiene todos los workers en la nueva y el puntero ya lo dice.
   Reproducido en la simulación con `SIM_SAVE_CODIGO=1` y todo lo demás sano: el
   primer despliegue salía en **1** en vez de 0, y con versión anterior salía en
   **2** anunciando «LA VERSIÓN ANTERIOR TAMPOCO RESPONDE» —falso, respondía—.
   Lo que se pierde si `save` falla llega el día que la máquina se reinicie, así
   que se registra el aviso y el despliegue continúa. El escenario 14 lo cubre;
   antes el doble de `pm2` nunca fallaba en `save` y por eso pasó desapercibido.
3. `scripts/restaurar-aislado.sh`: crea un contenedor con nombre único y usa el
   ID devuelto por Docker para start/exec/limpieza. Un conflicto de nombre nunca
   autoriza eliminar el recurso existente, ni siquiera si lleva la etiqueta de
   otra restauración. Se retiró RESTAURAR_FORZAR y el puerto publicado. La base
   no tiene red; pg_restore usa exit-on-error y single-transaction. Cualquier
   salida no cero, incluso 137 sin stderr, falla antes de aceptar recuentos.
   Se omiten propietarios/ACL originales: no se certifica su restauración.
   La simulación nueva tiene 23 comprobaciones sin Docker ni datos reales.
   Las dos simulaciones aceptan `SIM_GUION` y se comprobó que se ponen en rojo
   contra los guiones anteriores: 15 fallos la del despliegue, 12 la de
   restauración, 5 el escenario nuevo de `pm2 save`.
4. `lib/retool-store-agent.ts`: las frases de aumento/caída exigen captura
   completa actual Y anterior y ventanas equivalentes. Se conserva el aviso
   por capturas faltantes y se prueba que las caídas reales aún se informan.
5. `tests/integracion/aislamiento-api.test.ts`: de cinco a diez pruebas HTTP.
   Añade captura propia/asesor ajeno, centavos, cuota sin escrituras vecinas,
   movimientos/rondas del kardex, XLSX reales con marcadores propios y rechazo
   de sesiones de asesor/gerente sin autorización de backend. Las fixtures
   solo se escriben tras validar la base sintética. El secreto ficticio de
   captura representa al backend multitienda; estas pruebas NO demuestran la
   vinculación de identidad/tienda configurada fuera del repo en Retool.

### ⚠️ Hay un PROGRAMA instalado dentro del directorio del proyecto

VS Code quedó instalado en `Microsoft VS Code/`, aquí dentro: 1.1 GB y 2470
archivos. No es una copia suelta —es la instalación viva, la que está corriendo,
con su desinstalador registrado en esa ruta— así que **no se mueve ni se borra**.

Rompía dos puertas de calidad, y ninguna de las dos lo decía:

- `eslint .` la recorría entera y moría con un volcado de V8 antes de mirar una
  línea nuestra. Se lee como si ESLint estuviera roto.
- `tsc` recogía sus `.ts` por el patrón `**/*.ts` del `tsconfig` y fallaba por
  código ajeno, con errores de extensiones de VS Code.

Excluida en `.eslintrc.json`, `tsconfig.json` y `.gitignore`. Lo último importa
aparte: sin eso, un `git add .` intentaría subir un editor entero.

Validación local terminada: Node 22.23.1; 1,213 pruebas unitarias sin fallos ni
omisiones; TypeScript sin emisión/incremental; ESLint completo y archivos nuevos
sin avisos; YAML de ci.yml/deploy.yml; sintaxis bash; simulaciones 53/53 y 23/23.
El build aislado aprobó con código 0 y generó 73 páginas. Se hizo en una copia
temporal sin archivos `.env`, con URL de base ficticia, sin servicios reales y
con el bloqueo de TCP externo de `tests/local-network-only.cjs`. Inicialmente
falló por Google Fonts; `tests/google-fonts-fixture.cjs` sustituye el CSS solo
en pruebas. También hubo que poner la copia en D: por un problema de resolución
de Next con dependencias enlazadas entre discos. El build final solo mostró el
warning conocido de Sentry/OpenTelemetry; no valida la apariencia tipográfica.

No se ejecutó la integración contra PostgreSQL aquí: no se encontró Docker ni
el servidor aislado esperado; no se instaló ni se usó una base existente. Las
16 pruebas de integración quedan PENDIENTES de CI. El paso de CI precarga el
bloqueo de red en Node, heredado por next dev, y las fuentes ficticias evitan
descargas. La precarga se prueba permitiendo loopback y rechazando TCP, lookup
y fetch externos. Requiere un checkout desechable sin archivos `.env`.

Publicación autorizada de la rama para revisión; CI pendiente. Antes de fusionar
o desplegar, exigir CI verde con todas las pruebas de integración ejecutadas;
después decidir merge y deploy manual. No retirar la instalación
antigua del servidor: el `.env` compartido puede seguir enlazado a ella. No se
inspeccionó ni modificó ese enlace ni el contenido de ningún `.env` real.

## Buzón de la PC sin destellos de consola - 4 de septiembre de 2026

El usuario reportó una ventana de PowerShell que aparecía y se cerraba sola.
La tarea local `Mover buzon a la nube` ejecutaba el `.ps1` directamente en la
sesión interactiva cada cinco minutos. Los eventos 400 de Windows PowerShell
confirmaron esa cadencia; el resultado de la tarea era 0. Ya usaba
`-WindowStyle Hidden`, pero el arranque directo era el sospechoso del destello.

Con autorización del usuario se cambió únicamente el lanzador:

- Nuevo `scripts/mover-buzon-a-nube.vbs`: WScript (host gráfico, sin consola)
  llama al PowerShell de Windows por su ruta absoluta con ventana 0/oculta y
  espera a que termine. Propaga el código de salida real; no convierte fallos
  en éxito ni deja de escribir el registro que ya produce el `.ps1`.
- `scripts/mover-buzon-a-nube.ps1 -Instalar` usa ese lanzador. Si la tarea ya
  existe, actualiza solo su acción mediante `Set-ScheduledTask`; no reinicia la
  cadencia ni cambia usuario, privilegios, condiciones o límite de ejecución.
- Acción local aplicada: `wscript.exe //B //Nologo` con la ruta absoluta al VBS.
  La tarea sigue habilitada cada cinco minutos y conserva los diez minutos de
  límite y la política existente de instancias. Principal, disparadores y
  ajustes se compararon mediante XML y permanecieron idénticos.
- Respaldo previo fuera de Git:
  `%LOCALAPPDATA%\Clarvex\task-backups\Mover-buzon-20260904-215045.xml`.
  La vuelta atrás consiste en restaurar solo la acción de ese XML, no borrar
  la tarea ni crear otra. Conservar juntos el `.vbs` y el `.ps1`.
- Validación: sintaxis PowerShell y `tests/mover-buzon-a-nube.test.ps1`, 11/11.
  Se ejecutó el lanzador real con copias de los scripts y archivos sintéticos
  en una carpeta temporal. Se probaron espacios y barra final en rutas,
  simulación, movimiento íntegro por hash, duplicados, metadatos y salida 1
  ante un error. El registro de esa prueba también fue temporal.

La lógica de Buzón/Syncthing no cambió. No se ejecutó manualmente la tarea
contra los archivos del usuario para probar. Sin AWS, despliegues, GitHub ni
producción. El ajuste de Windows quedó aplicado; los archivos no se publicaron.

Referencia del host y modo batch:
https://learn.microsoft.com/es-es/windows-server/administration/windows-commands/wscript

## Export RDV lleno — 31 de agosto de 2026

El RDV mensual ya tiene exportador desde la plantilla corporativa compartida por
Google Sheets, pero **la copia versionada NO es el archivo recibido lleno**. Se
guardó como `templates/rdv.xlsx` después de sanearla: se vaciaron nombres,
números, ventas históricas, caches de fórmulas, `sharedStrings` no usados,
`calcChain` y caches de gráficas. Verificado buscando cadenas del archivo
original dentro del zip resultante.

Backend nuevo:

```
GET /api/admin/capture/kpis/export
```

Parámetros:

- `storeId` obligatorio.
- `date` o `selectedDate` obligatorio (`YYYY-MM-DD`); el periodo se resuelve con
  el calendario RDV real de Clarvex: `reconstructRdvWeek` +
  `buildRetailMonths`.
- `format=base64` para que Retool lo baje desde backend sin exponer
  `ADMIN_CAPTURE_SECRET`.
- `brand`, `center`, `classification` y `crmObjective` son opcionales. Brand y
  centro se derivan de `Store.name` cuando no vienen; clasificación todavía no
  vive en `Store`, así que no se inventa.

El llenado vive en `lib/rdv-export-xlsx.ts` y sigue el mismo criterio de Kardex:
JSZip quirúrgico, no ExcelJS para escribir el archivo final. Se conserva el
formato, merges, hojas y fórmulas; Excel recalcula al abrir por
`forceFullCalc=1`. La hoja activa queda en «Diario de ventas». «Informe» se deja
sin datos estáticos para no mostrar gráficas viejas; las hojas `KPIs Generales
PDV`, `KPIs x Colaborador` y `COMISIONES` quedan por fórmula.

Campos que sí se escriben porque existen en `Kpi`:

- meta diaria;
- venta sin IVA;
- tickets;
- unidades;
- tráfico por día, sin duplicarlo por persona;
- tickets electrónicos semanales (`crmTransactions`, solo fila ancla si así está
  capturado);
- Orkestra: venta, tickets y unidades.

Campos que quedan vacíos a propósito: `Dev SIN IVA`, Open Pay, PayPal, bonos e
incidencias. Clarvex todavía no tiene fuente real para esos datos en el RDV, y
el exportador no debe inventarlos ni reciclar descuentos como devoluciones.

Validación local cerrada:

- `pnpm exec tsc --noEmit --incremental false --pretty false`
- `pnpm exec eslint . --max-warnings 0`
- `pnpm exec tsx --test tests/rdv-export-xlsx.test.ts`
- `pnpm test`
- `pnpm build`

`pnpm build` solo mostró el warning conocido de Sentry/OpenTelemetry
(`require-in-the-middle`); terminó correctamente.

### ⚠️ Cada quien va en el bloque de su PUESTO, no en el siguiente libre

**Esto es dinero.** La plantilla corporativa tiene los puestos cableados por
posición y las hojas `KPIs x Colaborador` y `COMISIONES` leen columnas fijas,
aplicando el porcentaje de la **fila**, no el de la persona:

| Bloque | Columna | Puesto | Tope de comisión |
|---|---|---|---|
| 1 | `D` | GERENTE | 1.87 % |
| 2 | `O` | SUBGERENTE 1 | 1.39 % |
| 3 | `Z` | SUBGERENTE 2 | 1.39 % |
| 4+ | `AK`… | VENDEDOR 1, 2, 3… | 2.29 % |

El exportador los empaquetaba seguidos, así que en una tienda **sin segundo
subgerente** la primera asesora caía en el bloque 3 y el Excel le calculaba
**1.39 % sobre la venta de TIENDA** en vez de 2.29 % sobre la suya — y corría a
los demás asesores una posición. Pasó con Waira en agosto de 2026.

`asignarBloques()` reparte por puesto y deja vacíos los que la tienda no tiene.
⚠️ **Si sobra alguien de un puesto se DETIENE**, no se le busca hueco: colocarlo
en el bloque libre más cercano es exactamente el fallo que esto arregla.

⚠️ **La plantilla trae bloques OCULTOS y escribir dentro no los muestra.** Las
columnas 26-36 (el bloque 3) vienen escondidas justo porque esta tienda no tiene
SUBGERENTE 2, y las 70-168 porque sobran. Los datos quedaban bien puestos y **no
se veían**. `mostrarColumnas()` enseña solo los bloques que reciben a alguien.

### La mitad de Retool — publicada el 31 de agosto de 2026

⚠️ **La primera pasada dejó el endpoint vivo y sin nadie que lo llamara.** El
backend de Retool (`backend/kpis/exportRdv.ts`) ni siquiera estaba en git y el
botón de `frontend/pages/Kpis.tsx` estaba sin commitear: el export funcionaba y
no se podía usar desde la pantalla.

Publicado en Retool `8ffc4db` (commit posterior al publish `f43637a`), con
`retool check` en sus cuatro fases. El botón vive en la pantalla de KPIs y baja
el archivo del día seleccionado.

- El `storeId` sale de `requireManagerIdentity(req.user)`, **no del parámetro**:
  una tienda no puede pedir el RDV de otra aunque manipule la petición.
- Retool llama con `format=base64` para no exponer `ADMIN_CAPTURE_SECRET` al
  navegador; el archivo se arma en el backend y baja con `downloadBase64File`.

⚠️ **La ruta hay que añadirla a `captureRoutes` en `middleware.ts`.** Sin eso
responde **«Sesión requerida»** antes de llegar a validar
`ADMIN_CAPTURE_SECRET`, y el mensaje hace pensar en un problema de permisos de
Retool y no en una lista blanca. Es el precio de enumerar las rutas una a una en
vez de abrir el prefijo — que es deliberado, ver el comentario de esa lista.

Comprobado contra producción: sin secreto devuelve **401 «No autorizado»**, y con
él un XLSX real de 94 KB (`RDV-TH-SAN-AGUSTIN-2026-08-02-2026-08-29.xlsx`, agosto
2026, semanas 31 a 34, 5 personas). Se verificó que el archivo empieza por `PK`:
un JSON de error disfrazado también habría dado 200.

## Auditoría corregida — 4 de septiembre de 2026

Siete hallazgos trabajados en `fix/auditoria-2026-09`, fusionados en `9059b68`.
El estado «solo local» de la primera pasada ya no aplica: `232c6e3` está en
`main` y `origin/main`, y registra el corte manual al despliegue por versiones.

### Continuación tras el límite de sesión

Revisión inicial del 4 de septiembre de 2026, antes de autorizar el push:

- La CI `33936300502` falló por falta de `ALLOW_INTEGRATION_TEST_DATABASE`.
  El commit `232c6e3` añadió el consentimiento al trabajo con Postgres efímero.
- La siguiente CI, `33936867892`, también falló en «Sembrar dos tiendas
  sinteticas»: la guarda decía que las URLs de pruebas y producción coincidían.
  Las migraciones del contenedor sí habían terminado; la prueba de aislamiento
  no llegó a ejecutarse. El resto de los trabajos aprobó, incluido el build.
- Causa: al importar `tests/helpers.ts`, `DATABASE_URL` ya toma
  `TEST_DATABASE_URL`. Sin `.env`, el fallback a `process.env.DATABASE_URL`
  comparaba la base de pruebas consigo misma. No era una conexión a producción.
- Arreglo preparado en local: identificar la URL ajena a pruebas desde `.env`, no desde esa
  variable ya reasignada. Se conservan consentimiento, validación de nombre y
  host, rechazo de la URL de `.env` y control de registros sintéticos.
- `tests/security-protection.test.ts` reproduce el entorno sin `.env` de CI y
  simula las configuraciones locales. No lee `.env`/`.env.test` reales ni abre
  conexiones. Se comprobó que la regresión falla antes del arreglo y pasa después;
  las **1195 pruebas unitarias** pasan, incluidas 13 de seguridad. También
  aprobaron `tsc --noEmit --incremental false`, ESLint completo sin avisos y
  `git diff --check`. No se repitió el build local: el código de aplicación y
  despliegue no cambió; el build remoto exitoso corresponde a `232c6e3`.
- La integración real quedó pendiente de la siguiente CI: no se instaló un
  servidor ni se ejecutó un seed contra bases existentes en este Windows.
- Esa primera revisión terminó sin commit, push ni deploy. Se pidió autorización
  para subir el arreglo y comprobar la CI sin desplegar; el cierre está debajo.

Evidencia: https://github.com/CLARVEX-TEAM/clarvex-platform/actions/runs/33936867892

### Cierre autorizado: arreglo publicado y CI verde

El usuario autorizó expresamente publicar el arreglo y comprobar GitHub, SIN
desplegar. Commit `a29776ff2071f7a44a13f900e544ce9701bf8db5`, enviado a `main`
mediante push normal, sin modificar historial. La corrida `33940676897` aprobó:

- 1195 pruebas unitarias, ninguna fallida ni omitida.
- Migraciones en Postgres efímero, seed de dos tiendas sintéticas y 6 pruebas de
  integración, ninguna fallida ni omitida. No se ejecutó el seed en este Windows.
- TypeScript, ESLint, build y 10 pruebas de pantallas públicas.
- Dependencias, escaneo de secretos, validación de scripts/workflows y puerta `CI`.

Evidencia: https://github.com/CLARVEX-TEAM/clarvex-platform/actions/runs/33940676897

Después se documenta este resultado en AGENTS.md y CLAUDE.md, sin cambiar código.
El workflow de Deploy sigue siendo manual y NO se ejecutó. Sin cambios en AWS,
producción, bases existentes, Retool, Slack, secretos o configuración administrativa.
El aviso de GitHub sobre el runtime antiguo de checkout/setup-node no bloqueó
la corrida; queda para una actualización separada de las Actions fijadas.

### Segunda ronda: siete hallazgos más — 4 de septiembre de 2026

Corregidos y publicados con autorización expresa del usuario: `fd4d569`,
`8732f5b` y `31a90fb`, en `main` por push normal y sin tocar historial.
**NO se desplegó**: el workflow de Deploy sigue siendo manual y no se ejecutó; no
se tocaron AWS, Retool, Slack, secretos ni producción, que continúa sirviendo
`releases/20260905-012950-9059b68`.

Validación local: TypeScript sin emisión e incremental desactivado, ESLint
completo sin avisos, **1203 pruebas unitarias**, build de producción (solo el
aviso conocido de Sentry/OpenTelemetry) y las dos simulaciones de shell, 33 y 17.
La CI `33948101043` aprobó todos los trabajos del mismo SHA, con las **11 pruebas
de integración ejecutadas y ninguna saltada**.
Evidencia: https://github.com/CLARVEX-TEAM/clarvex-platform/actions/runs/33948101043

⚠️ **El despliegue tenía UNA puerta de vuelta atrás y hacían falta dos.** Un
`pm2 reload` o un `pm2 start` fallidos mataban `deploy-release.sh` por `set -e`
**con el puntero de versión ya cambiado**: el estado anunciaba activa una versión
que PM2 nunca sirvió, y el rollback --que sí existía-- no llegaba a ejecutarse.
Cubría solo «arrancó pero no responde sana», que es el menos grave de los dos.
`activar()` devuelve ahora un código y los dos caminos salen por `volver_atras`.
El código de salida era 1 en los dos casos, así que **lo que distingue el arreglo
es el puntero, no la salida**: es lo que comprueba el escenario nuevo.

⚠️ **El `ack` de Slack confirmaba lo que no había guardado.** El `catch` de la
transacción daba por hecho que cualquier error era una carrera perdida. Con la
base caída respondía **200 «Revisado»**, marcaba el mensaje de Slack como atendido
y no dejaba una línea en la auditoría: la alerta desaparecía de la vista de todos
sin que nadie la hubiera revisado, que es justo el fallo que el `GET` sin efectos
vino a cerrar. Ahora se **relee** el registro; si no está --o si ni siquiera se
puede leer-- responde 503 y **no toca Slack**.

⚠️ **Un respaldo fallido conservaba el estado del éxito de ayer.** El resultado
solo se escribía al terminar bien, así que un `pg_dump` roto dejaba al monitor
leyendo «ok» hasta cumplirse las 26 horas de antigüedad: más de un día con la
única copia de la nómina sin hacer y sin que nadie lo supiera. Ahora se escribe
también al fallar, y con **lo que de verdad se sabe de cada destino**: si R2 ya
había confirmado la subida, eso se conserva y el fallo pasa a la copia cruzada.

⚠️ **La restauración aislada borraba un contenedor por nombre.** Sin comprobar
que fuera suyo, y **al salir**, aunque no hubiera llegado a crear nada. Ahora
etiqueta los suyos (`clarvex-restauracion=1`), se detiene si el nombre lo ocupa
uno ajeno --`RESTAURAR_FORZAR=1` para saltárselo, que es una decisión escrita-- y
solo destruye lo que creó. Además **cuenta** los errores de `pg_restore` en vez
de imprimir quince líneas y seguir: los inocuos de `--clean` van aparte, y sale
en 1 si queda alguno real o si la base restaurada se queda sin tablas, usuarios
o tiendas. ⚠️ La línea final «errors ignored on restore: N» es un RESUMEN de las
anteriores: contarla convertía una restauración buena en un fallo inventado.

⚠️ **Una fila con SOLO la meta no es captura, y se contaba como tal.** Guardar
Cuota Justa escribe la meta diaria de toda la semana por adelantado
(`lib/weekly-performance.ts`) con `dailySales`, `transactions` y `pieces` en cero.
`dailySales` no es anulable, así que esa fila era indistinguible de un día ya
capturado: el mes se daba por completo el lunes. `tieneCaptura()` en
`lib/retool-store-agent.ts` exige que haya ALGO de operación. ⚠️ La venta puede
ser **negativa** por una devolución, y eso sí es captura: se compara contra cero,
no «mayor que cero».

De ahí salían dos avisos falsos que ya no se emiten:

- Los insights juzgaban contra `metric.achievement`, que es la meta del periodo
  **entero**. Reproducido: con cinco días vendidos exactamente en meta y las
  metas del mes ya escritas, el cumplimiento del rango completo daba **14.29 %**
  y el agente recomendaba «revisar cobertura, tráfico y tickets antes del cierre».
  Ahora se mide contra la meta de los días transcurridos, igual que la anomalía
  de ritmo de `retool-store-audit.ts` --el mismo dato tenía dos lecturas
  distintas en la misma pantalla-- y con captura incompleta no se juzga: se avisa
  del hueco.
- `todayKpiRows` contaba filas, no capturas, así que «Sin KPIs capturados hoy»
  no saltaba nunca y en su lugar saltaba **«Venta diaria muy por debajo»,
  crítica**, a las nueve de la mañana sobre un día que solo tenía la meta puesta.

### Las pruebas que faltaban, y las que no corría nadie

⚠️ **`tests/deploy-release.sim.sh` existía y NO lo ejecutaba nada.** Ahora las dos
simulaciones corren en CI dentro del trabajo `operativos`, que hasta ahora solo
hacía `bash -n`. `bash -n` dice que el guion se puede leer; esto comprueba lo que
DECIDE ante cada fallo, que es donde estaban los problemas.

Las dos aceptan `SIM_GUION` para apuntar a otra copia del guion. No es un adorno:
es como se comprueba que saben ponerse en rojo. Contra la versión anterior,
la del despliegue falla 2 de 33 y la de la restauración 7 de 17.

⚠️ **Las pruebas de aislamiento comprobaban consultas de Prisma con el filtro
escrito dentro de la propia prueba**: demostraban que Postgres sabe filtrar, que
no estaba en duda. Una ruta que se olvidara del `storeId` pasaba la CI entera.
`tests/integracion/aislamiento-api.test.ts` levanta la aplicación real, entra con
el PIN de la gerencia y pide datos por HTTP. Comprobado retirando el `storeId` de
`/api/app-data`: fallan dos de sus cinco pruebas, y vuelven a pasar al restaurarlo.

⚠️ **Se salta MIRANDO la base, no por una variable.** `TEST_DATABASE_URL` existe
igual en una máquina de desarrollo con `.env.test`, así que ese candado no sujeta
nada: la suite llegó a levantar un servidor de verdad contra la base local. Si
faltan las dos tiendas del seed, se salta sin arrancar nada.

⚠️ **`next dev` no ES el servidor: lo BIFURCA.** Matar al hijo deja vivo al nieto
(`next-server`), que heredó las tuberías de salida; mientras sigan abiertas, el
bucle de eventos del proceso de pruebas no se vacía y el ejecutor no termina.
En Windows no se nota --la suite sale en doce segundos-- pero en Linux la primera
corrida de CI se quedó **19 minutos colgada con las cinco pruebas ya en verde**,
agotando los 20 del trabajo entero. Por eso la salida del servidor va a un
FICHERO y no a tuberías, y en POSIX se lanza como líder de grupo para matar el
GRUPO. Es la misma trampa que `tests/integration/security-endpoints.test.ts`
resolvió con un `process.exit`; aquí no se usa porque ese atajo puede salir en
cero antes de que el ejecutor fije el código de fallo. El paso de CI lleva además
su propio `timeout-minutes`: un cuelgue tiene que costar poco y señalar dónde fue.

⚠️ **No canalizar `prisma migrate deploy` a `head`.** Al cerrarse la tubería,
Prisma muere a media migración y la deja marcada como fallida: después
`migrate deploy` responde **P3009** y no aplica nada más. Pasó en la base de
pruebas local durante esta verificación; se recuperó recreando el esquema
--sintético y local-- tras pasar las dos guardas del seed.

### 1. El agente comparaba el calendario, no la tienda

⚠️ Los días transcurridos se calculaban con el FIN del periodo en vez de con la
fecha de hoy, así que la ventana del mes anterior salía del tamaño del mes
completo. Con venta constante de $100 diarios comparaba **$600 contra $2,800** y
mostraba **−78.57 %**; la respuesta correcta es **0 %**.

`StoreAgentPeriod` separa ahora cuatro cosas que estaban en una:

| | |
|---|---|
| `start`/`end` + `metric` | el rango COMPLETO y su META TOTAL, que no se mueven con el día |
| `toDate` | lo acumulado hasta hoy, con días transcurridos, totales y capturados |
| `comparison` | los MISMOS días transcurridos del periodo anterior |

⚠️ Meses retail de distinta duración: la ventana equivalente se recorta si no
cabe y `equivalent` queda en `false`. Sirve de contexto, no es una diferencia
limpia.

⚠️ **Periodo terminado ≠ captura completa.** Son dos preguntas y mezclarlas hace
pasar un hueco de captura por una caída de venta. `capturedDays` cuenta fechas
DISTINTAS, no filas: hay una fila por persona y por día.

En `retool-store-audit.ts`, el ritmo mensual se mide contra la meta de los días
transcurridos. Antes usaba la del mes entero, así que el día 2 de un mes de 35 el
avance era ~6 % y la anomalía saltaba siempre. Con captura incompleta no se
afirma atraso: se avisa del hueco.

### 2. CI que no existía, y un deploy esperándola

⚠️ `paths-ignore` incluía `scripts/**.sh`, así que **un cambio en el propio
`scripts/deploy.sh` se saltaba la CI entera, incluido el escaneo de secretos**. Y
un commit de solo documentación no producía ninguna ejecución: el deploy exige CI
verde del mismo SHA y esperaba veinte minutos una corrida inexistente.

Ahora la CI se dispara siempre y el ahorro va por trabajo. `secretos` y el nuevo
`operativos` --que valida workflows, `.sh` y `.ps1`-- corren SIEMPRE. El
preflight del deploy comprueba además los trabajos uno a uno, con coincidencia
exacta del nombre.

### 3. El build desmontaba lo que estaba sirviendo

⚠️ `next build` reescribe `.next` en el sitio. Si fallaba, `git reset` devolvía
el código pero los artefactos ya no existían: no había a qué volver sin
recompilar.

`scripts/deploy-release.sh` prepara cada versión aparte y activa al final; la
anterior se conserva usable y volver atrás no recompila. `232c6e3` registra el
corte y cambia el workflow para usar ese guion. La comprobación del servidor
corresponde a la sesión anterior, no se repitió en esta continuación.
`scripts/preparar-releases.sh` fue la preparación; no volver a ejecutarlo
suponiendo que la instalación sigue en el diseño anterior.

⚠️ El paso que hay que mirar en el corte: que PM2 quede apuntando a la versión y
no a la ruta vieja. Si no, los despliegues parecerán funcionar sin cambiar nada.

### 4. El monitor afirmaba lo que no sabía

⚠️ Anunciaba «en R2 y S3» habiendo mirado solo R2, y miraba las últimas veinte
líneas del registro, así que **un fallo de hoy quedaba tapado por un éxito de
ayer**. Ahora el respaldo escribe un resultado por destino, con objeto
confirmado, y se sobrescribe entero.

Las degradaciones van separadas de los problemas y avisan aunque no haya ningún
problema: antes eso se callaba hasta el parte semanal, que además decía «todo en
orden».

`scripts/restaurar-aislado.sh` restaura en un Postgres efímero y lo destruye.

### 5. El seed truncaba mirando solo el nombre

⚠️ Llamaba a la comprobación de entorno pero **no a la de registros reales**, que
ya existía. Una base llamada `clarvex_team_test` con datos dentro pasaba y
perdía todo. Ahora se comprueba el contenido --usuarios y tiendas-- y que el host
sea local.

CI gana un Postgres efímero con dos tiendas sintéticas y pruebas de aislamiento.
⚠️ No corren en local y se saltan solas sin `TEST_DATABASE_URL`.

### 6. Abrir un enlace marcaba la alerta como revisada

⚠️ El `GET` de `/api/webhooks/slack/ack` creaba el registro y actualizaba
Slack. La previsualización de enlaces de Slack, un antivirus de correo o la
precarga del navegador lo disparaban solos. Ahora el `GET` solo pinta una
pantalla con un botón y el `POST` es quien cambia estado, con idempotencia
transaccional.

⚠️ **La identidad no se inventa**: el token demuestra que la alerta es nuestra,
no quién pulsó. Se registra como no verificada.

### 7. `noImplicitAny` destapó un fallo de datos

Estaba en `false` como excepción a `strict`. Al activarlo salieron **dos**
errores, y los dos eran el mismo: el mapa de etiquetas de rol no incluía
`REGIONAL`, así que a esa persona se le pintaba la insignia vacía.

Node unificado en la línea 22 (`.nvmrc` + `engines`).

## Despliegue desde GitHub — 2 de septiembre de 2026

Ya no hace falta entrar por `ssh` para desplegar. **Actions → Deploy → Run
workflow**, escribiendo `DESPLEGAR`.

Sigue siendo **manual a proposito**. La app calcula nomina de doce personas y
corre en una maquina de 3.7 GB donde `next build` tarda minutos apoyandose en
swap; desplegar en cada commit encadenaria builds que no caben a la vez. Lo que
se quita es el `ssh` a mano, no la decision.

Desde el hardening del 3 de septiembre, manual ya no significa «confiar en que
se esperó suficiente»: el job `Validar commit y CI` exige `main`, comprueba la
palabra `DESPLEGAR` y espera hasta 20 minutos a que **la CI del mismo SHA**
termine verde. Solo entonces arranca el job que puede pedir OIDC.

```
GitHub Actions --(OIDC)--> AWS STS --(SSM SendCommand)--> EC2
                                                            `-> scripts/deploy-release.sh
```

- **Sin credenciales guardadas.** No hay `AWS_ACCESS_KEY_ID` en los secretos del
  repositorio: GitHub emite un token que dice quien es, AWS lo canjea por
  credenciales de una hora y se acaban con la ejecucion.
- **Por SSM y no por ssh**, para no abrir el puerto 22 a los rangos de GitHub
  —que son enormes— ni guardar una llave privada en el repositorio.
- Desde `232c6e3`, SSM extrae `scripts/deploy-release.sh` del SHA aprobado con
  `git show` desde `/home/ubuntu/clarvex/repo`. No toma el guion del working tree:
  `fetch` actualiza referencias, no sus archivos.
- El guion exige el SHA de `origin/main`, prepara una versión separada y conserva
  los artefactos anteriores para volver atrás sin recompilar. La instalación
  antigua se conserva según el registro del corte; no eliminarla desde esta fase.

### ⚠️ El sujeto del token lleva IDENTIFICADORES, no solo los nombres

Esta organizacion emite el sujeto asi:

```
repo:CLARVEX-TEAM@321237585/clarvex-platform@1260997933:environment:Production
```

y **no** como sale en todas las guias:

```
repo:CLARVEX-TEAM/clarvex-platform:environment:Production
```

Es una proteccion de GitHub: con los identificadores dentro, el permiso
sobrevive a un cambio de nombre y nadie se lo queda creando despues un
repositorio con el nombre que quedo libre.

⚠️ **Costo tres intentos porque STS no lo dice.** Responde «no autorizado» y
jamas revela que sujeto presentaste —si lo hiciera seria un oraculo para
adivinar condiciones—. El CLI sale con un **254** pelado. Donde SI aparece es en
CloudTrail, en `userIdentity.userName`; ojo que `requestParameters` viene
**vacio**, asi que hay que volcar el evento entero:

```bash
aws cloudtrail lookup-events --profile clarvex --region us-east-1 --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity
```

⚠️ **Y va al ENTORNO, no a la rama.** Cuando un job declara `environment`,
GitHub cambia esa parte del sujeto de `ref:refs/heads/main` a
`environment:Production`. Ademas es lo que conviene: el entorno es el unico
sitio donde se puede exigir aprobacion manual, asi que atarlo ahi impide que un
flujo nuevo asuma el rol saltandose la aprobacion.

### ⚠️ Cero acciones de terceros en el deploy

La organizacion permite acciones propiedad de GitHub y una excepción acotada
para OSV en CI. El deploy no usa ninguna acción de terceros:
`aws-actions/configure-aws-credentials` **no está permitida** y el canje se hace
a mano con `curl` y el CLI de AWS, que ya viene en el runner.

Se podria haber permitido la accion. Se prefiere esto: el despliegue es lo unico
del repositorio que puede tocar produccion, y que no ejecute codigo de terceros
vale mas que ahorrar diez lineas. Las credenciales se enmascaran con
`::add-mask::` **antes** de existir en el entorno, o cualquier comando que las
imprima las deja escritas en un registro que ve todo el que tenga acceso al repo.

Primer despliegue real: `7a93149`, 7 min 21 s, con la salud comprobada desde
internet y desde la propia maquina.

## Centro operativo Slack / Retool / AWS — 30 de agosto de 2026

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
- Desde `13c5221`, una acción interactiva aceptada ya no responde solo con un
  mensaje efímero: devuelve `replace_original: true`, conserva el texto de la
  alerta, marca el estado (`revisado`/`aprobado`/`rechazado`) y retira el botón
  de revisión. Quedan los botones de abrir Auditoría y Clarvex.
- La prueba real mostró que Slack no estaba llamando el endpoint interactivo: no
  apareció `slack.ops.ack` ni logs firmados de `/api/webhooks/slack/actions`.
  Desde `1100480`, `sendSlackOpsAlert` publica y luego hace `chat.update` para
  convertir «Marcar revisado» en una URL firmada a `/api/webhooks/slack/ack`.
  Esa ruta no depende de Interactivity: valida HMAC con `SLACK_SIGNING_SECRET`,
  registra `AuditLog` de forma idempotente y actualiza el mensaje por
  `chat.update`. Prueba verificada en producción: mensaje `1788055213.563919`
  cambió a `[OK] Prueba de alerta Slack por enlace firmado` y quedó solo con
  «Abrir auditoría» / «Abrir Clarvex».
- Para que los botones funcionen, la app de Slack debe tener Interactivity
  apuntando a
  `https://team.clarvex.tech/api/webhooks/slack/actions`.
- `SLACK_OPS_CHANNEL` es distinto de `SLACK_CHAT_CHANNELS`: no mezclar alertas
  administrativas con el espejo del chat de tienda.
- Canal operativo activo: `#clarvex-alertas` = `C0BQFQM6CHX`.
  `SLACK_OPS_CHANNEL` ya está en `.env` de producción, PM2 se reinició y Slack
  aceptó el mensaje de prueba.

### Retool: Auditoría privada

Nueva ruta del App Builder: `/auditoria`.

- Solo se muestra cuando la metadata del usuario Retool trae
  `platformAdmin=true` o `role=PLATFORM_ADMIN`, y también para la cuenta
  administrativa `contacto@clarvex.adrianluna.mx`.
- La función backend `backend/ops/getOpsCenter.ts` exige esa metadata y solo
  entonces llama a Clarvex con `X-Clarvex-Platform-Admin: true`.
- Clarvex expone `GET /api/admin/retool/ops`, protegido por
  `ADMIN_CAPTURE_SECRET` y por ese encabezado. Devuelve resumen operativo,
  frescura por tienda, últimas entradas de auditoría y errores recientes de
  sincronización.
- Desde Clarvex `7ed0959`, el mismo endpoint devuelve también:
  - `accessReview`: revisión semántica de usuarios, no comparación por JSON.
    Cuenta activos/inactivos, gerencia, admins de plataforma, kioskos, demos,
    usuarios activos con correo inventado, bajas con correo real y gerencia sin
    login reciente.
  - `assistantBrief`: hallazgos ordenados por severidad para alimentar Retool
    Agents o Slack con contexto ya curado. Es deliberadamente determinístico:
    no ejecuta mutaciones, no da de baja usuarios, no cambia roles y no ajusta
    kardex sin confirmación humana.
- Retool `95eed8b` pinta dos paneles nuevos dentro de `/auditoria`: «Auditoría
  asistida» y «Permisos y bajas». Pasó `retool check`, se publicó y Retool dejó
  la rama en el commit post-publicación `93c5a5e`. Smoke de producción después
  del deploy: `ok=true`, 18 usuarios revisados, 4 tiendas y 7 hallazgos en el
  brief.
- Las cuentas de gerencia de tienda no deben recibir `platformAdmin=true`. La
  cuenta operativa `jhernandezl2c@gmail.com` se mantiene como `SUBGERENTE`; si
  entra manualmente a `/auditoria`, debe ver un aviso de que use la cuenta
  administrativa.

### Retool: agente de tienda en Inicio

El 30 de agosto se agregó una versión cerrada por tienda del brief operativo,
visible en **Inicio** para gerentes y subgerentes.

- Clarvex `b2cbebf` añade `lib/retool-store-audit.ts` y devuelve `storeAudit`
  desde `GET /api/admin/retool/dashboard`.
- El `storeId` sigue viniendo de `requireManagerIdentity` en el backend de
  Retool; el frontend no manda ni elige tienda. Esto es lo que cierra el agente
  a la tienda del usuario.
- `storeAudit` revisa, sin mutar datos: captura KPI atrasada o ausente, tráfico
  faltante, avance diario/mensual bajo, horarios vacíos, personal laborando sin
  meta, incidencias de asistencia, pendientes altos, solicitudes de horario,
  rondas de kardex abiertas y cierres de Cuota Justa vencidos en `DRAFT`.
- Retool `36fd1d2` agrega `frontend/components/inicio/StoreAuditPanel.tsx` y lo
  pinta antes del resto del dashboard. Si no hay KPIs del día, el agente sigue
  apareciendo y luego se muestra el vacío de KPIs.
- Pasó `retool check`; publicación post-publish `7888efa`.
- Smoke real en AWS: TH SAN AGUSTIN devolvió `storeAudit.storeName=TH SAN
  AGUSTIN`, estado `review` y 3 anomalías. Eso confirma que el payload del
  agente corresponde a una sola tienda.

### Hilos operativos

Hoy no existe todavía una entidad persistente llamada «hilo operativo». Lo que
sí existe es la alerta de Slack con botones: abre Auditoría/Clarvex y marca el
mensaje como revisado por `slack.ops.ack`. Para volverlo un flujo real falta
crear una tabla/endpoint de casos con responsable, estado, comentarios y cierre,
y conectar ahí las anomalías de Inicio y Auditoría.

### Retool: barra superior compacta

La captura real del 29 de agosto mostró que la navegación se volvió demasiado
ancha para el breakpoint viejo de ~1100 px: en `/ticket-electronico` se alcanzaba
a ver el botón activo, pero el extremo derecho quedaba recortado antes de
Auditoría.

Primero se corrigió con dos filas hasta 1500 px, pero Adrian no aprobó el
resultado porque la barra seguía sintiéndose demasiado ancha. La solución final
es compacta: `frontend/components/AppNav.tsx` deja visibles Inicio, Horarios,
Asistencia y KPIs, y agrupa Cuota justa, Descuentos, Kardex, Ticket electrónico
y Auditoría en un menú `Más`. Si la ruta activa está dentro del menú, el botón
muestra ese módulo activo en vez de un genérico.

No toca rutas, permisos, funciones de captura ni backend de Clarvex. Retool pasó
`retool check` y se publicó el mismo 29 de agosto: commit funcional `6b24b2e`,
commit posterior al publish `f7d16b6`.

### AWS: costos antes de que duelan

Se agregó `scripts/aws-cost-guardrails.ps1`.

Hace dos cosas:

- Budget mensual `clarvex-aws-activate-guardrail`, por omisión 120 USD/mes,
  midiendo gasto bruto antes de créditos (`IncludeCredit=false`) para que los
  créditos Activate no escondan consumo real.
- Cost Anomaly Detection por servicio con umbral diario de 5 USD.

Aplicado el 29 de agosto de 2026 tras renovar SSO:

- Budget `clarvex-aws-activate-guardrail`: 120 USD/mes, saludable.
- Notificaciones del Budget: 50 % actual, 80 % forecast y 100 % actual.
- Monitor de anomalías reutilizado: `Default-Services-Monitor`.
- Suscripción nueva: `clarvex-cost-anomaly-daily`, umbral 5 USD diarios.
- Correo: `contacto@clarvex.adrianluna.mx`.
- Costo agosto al corte: 7.8213174535 USD de uso bruto, -7.821317433 USD de
  créditos, neto prácticamente 0. Cost Forecast no pudo proyectar cierre por
  historial insuficiente.

Para re-aplicar o cambiar correo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\aws-cost-guardrails.ps1 -AlertEmails admin@dominio.com
```

### GitHub: perfil público de CLARVEX-TEAM

Se preparó la presencia pública mínima de la organización antes de transferir el
repositorio principal. El alcance fue solo `CLARVEX-TEAM` y recursos nuevos;
`jhernandezl2c-hash/app` quedó limpio, sin cambios y con su remote original en
esa fase.

- `gh.exe` no estaba en el PATH de la sesión de Codex, pero sí instalado y
  autenticado como `jhernandezl2c-hash` en:
  `C:\Users\Adrian L\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe`.
- Auditoría autenticada de la org al momento de crear el perfil: plan
  `free` --este documento decia `enterprise`, y no lo es: comprobado el 2 de
  septiembre de 2026 con `gh api orgs/CLARVEX-TEAM`--, 1 miembro (`jhernandezl2c-hash`), 0 equipos, 0 repos previos,
  0 rulesets, 0 secrets/variables de Actions o Dependabot. Actions estaba
  permitido para todos los repos y acciones; no se cambió porque las políticas
  globales quedaron fuera de esta fase.
- Se creó el repo público `CLARVEX-TEAM/.github`:
  `https://github.com/CLARVEX-TEAM/.github`.
- Commit publicado: `98a9a9f` (`Create Clarvex organization profile`).
- Archivos creados:
  - `profile/README.md`
  - `profile/assets/clarvex-logo-horizontal.svg`
  - `profile/assets/clarvex-icon.png`
  - `SECURITY.md`
  - `CONTRIBUTING.md`
  - `.github/pull_request_template.md`
  - `.github/ISSUE_TEMPLATE/bug_report.yml`
  - `.github/ISSUE_TEMPLATE/feature_request.yml`
  - `.github/ISSUE_TEMPLATE/config.yml`
- Branding reutilizado desde este repo: el logo horizontal se basó en
  `public/branding/retool-logo-horizontal.svg`, limpiando la descripción para
  no mencionar Retool; el icono cuadrado salió de `docs/assets/logo.png`.
- La organización quedó con:
  - descripción pública:
    `Secure retail operations software for store teams, workflows, performance, and operational intelligence.`
  - website: `https://clarvex.tech` (verificado con 200 y título de Clarvex).
  - email público vacío.
  - ubicación vacía.
- Verificación posterior: GitHub renderizó `profile/README.md` en
  `https://github.com/CLARVEX-TEAM`; el SVG y PNG respondieron 200; `SECURITY.md`
  respondió 200; la búsqueda de patrones sensibles no encontró AWS, Retool,
  Slack, tokens, variables internas, endpoints privados ni referencias al repo
  principal.

### GitHub: transferencia del repo principal — 2 de septiembre de 2026

GitHub Support confirmó que las refs antiguas de Pull Requests contaminadas
fueron eliminadas, y la verificación final local/remota dio `SAFE TO TRANSFER`.
No se abrió ni se mostró contenido del dump.

- Archivo sensible retirado: `POST_RESTORE_BEFORE_RECOVERY.dump`.
- Blob antiguo conocido:
  `fade9777bc408d9b6f4c4f177f7c632c8e30c686`.
- Verificación previa: working tree limpio, rama `main`, remote todavía en
  `git@github.com:jhernandezl2c-hash/app.git`, commit
  `92344942a5091db8c89d6431d157ffaace86fab3`.
- El archivo no existía en working tree, no estaba tracked, no aparecía como
  blob alcanzable en refs normales y el blob antiguo devolvió 404 por API de
  GitHub. `git ls-remote origin 'refs/pull/*'` devolvió 0 refs. El repo no tenía
  forks.

Transferencia ejecutada con la API oficial:

```
POST /repos/jhernandezl2c-hash/app/transfer
new_owner = CLARVEX-TEAM
new_name  = clarvex-platform
```

GitHub respondió `202 Accepted`. Después se verificó directamente, sin confiar
solo en redirecciones:

- Repo nuevo: `CLARVEX-TEAM/clarvex-platform`.
- Visibilidad: privado.
- Rama default: `main`.
- Último commit: `92344942a5091db8c89d6431d157ffaace86fab3`.
- `origin` local actualizado a:
  `git@github.com:CLARVEX-TEAM/clarvex-platform.git`.
- `git fetch origin`, `git status` y `git branch -vv` dejaron `main` limpio y
  al día con `origin/main`.

Configuración conservada:

- issues ON, projects ON, wiki OFF;
- sin secrets ni variables de Actions;
- environments `Preview` y `Production`; Production restringido a `main`, sin
  revisor obligatorio porque esa protección no existe en private + Free;
- sin webhooks;
- deploy key `Vps`, retirada (ya no figura el 2 de septiembre de 2026);
- deploy key `Clarvex aws`, verificada, read-only;
- colaboradores directos: `jhernandezl2c-hash` admin y `edsomo94` **read**
  (bajado de `write` el 2 de septiembre de 2026). ⚠️ Con `main` sin poder
  protegerse por el plan, un permiso de escritura era empujar directo a la
  rama que despliega. Para devolverselo:
  `gh api -X PUT repos/CLARVEX-TEAM/clarvex-platform/collaborators/edsomo94 -f permission=push`

Cambios observados por el movimiento a organización:

- `allow_forking` pasó de `true` a `false`.
- Actions heredó la política restringida de `CLARVEX-TEAM`: `allowed_actions`
  quedó en `selected`, GitHub-owned actions permitidas, verified creators
  desactivado, allowlist limitada a OSV Scanner y workflow token en `read`.
- `edsomo94` aparece como outside collaborator de la organización.

⚠️ **`main` NO se puede proteger con este plan.** La organizacion esta en
`free` y el repositorio es privado: tanto la proteccion clasica de ramas como
los rulesets responden **403 «Upgrade to GitHub Pro»**. No es que falte
configurarlo; hoy no se puede sin pagar o sin hacer publico el repositorio.
Lo que si esta puesto es que el entorno `Production` solo despliega desde
`main`, que cubre la via por la que se toca produccion.

### GitHub: hardening gratuito cerrado — 3 de septiembre de 2026

Se completó lo que GitHub Free sí permite sin volver público el código:

- CI en push/PR con TypeScript, ESLint, tests, build + Playwright, OSV Scanner y
  control de secretos. Las Actions están fijadas a commits completos; el tag de
  versión queda solo como comentario legible.
- TruffleHog OSS 3.97.4 se descarga como binario, se valida con SHA-256 y escanea
  únicamente el rango nuevo. Corre con `--no-verification` y `--no-update`: no
  consulta AWS, Slack ni otros proveedores con los candidatos detectados y no
  abre otra Action de terceros en la política de la organización.
- Dependency graph, Dependabot alerts, security updates y version updates
  activos. Dependabot abre PRs, pero no tiene auto-merge.
- Deploy manual por OIDC + SSM con preflight de CI y commit exacto. `id-token`
  no existe en el preflight; solo se concede al job de Production después de la
  validación. Este hardening no ejecutó ningún despliegue.
- Repo con descripción, homepage `https://clarvex.tech` y topics técnicos.
- Invitación pendiente de `esoriamontes@gmail.com` cancelada. El único owner y
  miembro sigue siendo `jhernandezl2c-hash`; `edsomo94` conserva acceso directo
  read como outside collaborator; `developers` y `maintainers` siguen vacíos.
- Deploy key `Vps` retirada; `Clarvex aws` permanece verificada y read-only.

Lo que queda fuera exige pago: branch protection/rulesets y required checks en
el repo privado, CODEOWNERS efectivo, aprobación obligatoria del environment,
CodeQL y Secret Protection (secret scanning + push protection) nativos. No se
intentaron activar y no se contrató ningún servicio.

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

### Las promociones del corporativo — 9 de septiembre de 2026

Se manda al bot la captura del correo de promociones **con el pie `promo`** y
contesta con el comunicado ya redactado, esperando en Clarvex. **No publica
nada**: deja un `PromoDraft` que gerencia abre, revisa y publica. Misma
separación que el reconocimiento de zonas del visual, y por el mismo motivo —un
correo mal leído aquí se convierte en un precio equivocado en el mostrador—.

La lectura vive en `lib/promo-vision.ts` (Bedrock) y la redacción en
`lib/promo-comunicado.ts`, con plantilla fija: el modelo **extrae campos**, no
escribe. Una restricción reescrita es una restricción cambiada.

⚠️ **La rama va en el MISMO flujo de n8n, `clarvexvisualsemanal`.** Un bot de
Telegram admite **un solo webhook**: dos flujos con su propio disparador se
pelean por él y el que pierde deja de recibir mensajes sin decir nada.

⚠️ **Antes, CUALQUIER foto caía en el flujo del visual** (salida 0 del switch
«Que quiere»), así que una captura de promoción se habría guardado como la foto
de una zona. Se distinguen por el PIE, que es lo que ese flujo ya usaba para
nombrar el hueco. La rama nueva se mete ANTES y no toca ninguna de las
anteriores; se comprobó evaluando las dos expresiones sobre catorce mensajes
—foto sin pie, pie de zona, los cinco comandos de texto, chat ajeno— y solo
cambian de ruta los dos casos de promoción. La guarda del chat sigue primero,
así que una foto «promo» desde otro chat se ignora igual que siempre.

⚠️ **La petición va con `neverError`.** El endpoint contesta **422 con el motivo
en claro** —«la captura no deja ver la vigencia»— y ese texto es lo único útil de
la respuesta: dice qué falta para mandar otra sin adivinar. Sin `neverError`,
n8n lanza y el aviso genérico lo tapa.

#### Cómo se actualiza un flujo de n8n aquí

⚠️ **`--activeState=fromJson` NO existe en este despliegue.** Solo funciona en
modo cola o multi-main; el nuestro es modo normal y el import responde «workflow
activation is not supported». Y el import **por omisión DESACTIVA** lo que
importa. Como este flujo es el dueño del webhook del bot, importarlo a secas
deja la tienda sin recibir **nada** por Telegram, el visual incluido.

Los tres pasos, y ninguno sobra:

```bash
docker exec n8n n8n import:workflow --input=/tmp/v.json
docker exec n8n n8n publish:workflow --id=clarvexvisualsemanal   # lo reactiva
docker restart n8n                                                # relee de la base
```

⚠️ El **reinicio no es opcional**: n8n mantiene la versión vieja en memoria y sin
él la rama nueva no existe aunque el import diga que salió bien. Lo dice el
propio comando: «Changes will not take effect if n8n is running».

⚠️ **La copia versionada decía `active: false` mientras el flujo corre ACTIVO.**
Ahora dice `true`. Importarla como estaba lo habría apagado. Los otros JSON de
`scripts/n8n-*.json` siguen con `false` y tienen el mismo problema latente: antes
de importar cualquiera, comprobar su estado real en la base.

Se comprueba después con instrumentos distintos: la fila de `workflow_entity`
—`active`, número de nodos, salida 7 del switch— y el log del arranque, que tiene
que decir `Activated workflow "Clarvex — Visual semanal"`. Que la base diga
`active: 1` no demuestra que el proceso registrara el webhook.

Respaldo previo: `/home/ubuntu/n8n-workflow-backups/visual-semanal-antes-promo-20260909-213502.json`.

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
- ⚠️ **Al LEER se poda; al GUARDAR se rechaza.** Si el horario cambió después
  de guardar y hay porcentaje para quien ya no labora, el día se recalcula solo
  y se avisa en pantalla; al guardar se sigue rechazando. La asimetría es
  deliberada: un borrador que se quedó viejo no es lo mismo que alguien
  afirmando algo imposible. Antes lanzaba también al leer y **dejaba fuera de la
  única pantalla donde se podía arreglar** — el 29 de agosto de 2026 bloqueó
  seis días y hubo que editar el JSON en la base a mano. Se poda el **día
  entero** (`podarPorcentajesCaducados` en `lib/fair-quota.ts`): quitar solo a
  quien sobra dejaría el día sin sumar 100 %, y repartir su hueco sería inventar
  un reparto que nadie eligió.
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
| next | 15.5.24 |
| react | ^18.3.1 |
| typescript | ^5.7.2 |
| prisma / @prisma/client | 5.22.0 (ambos fijos, sin `^`) |
| tailwindcss | ^3.4.16 |
| web-push | ^3.6.7 |
| @simplewebauthn/server | ^13.3.3 |
| @simplewebauthn/browser | ^13.3.0 |
| recharts | ^3.10.1 |
| zod | ^4.5.4 |
| framer-motion | ^12.40.0 |
| bcryptjs | ^2.4.3 |
| jose | ^6.2.10 |
| @aws-sdk/client-s3 | ^3.1121.0 (para R2) |
| @smithy/node-http-handler | 4.9.5 (transporte IPv4 de R2) |
| @sentry/nextjs | ^10.72.0 |
| exceljs | ^4.4.0 (parser del RDV) |
| sharp | ^0.35.4 (encoge las fotos del visual antes de reconocerlas) |
| @aws-sdk/client-bedrock-runtime | ^3.1121.0 (lector del POS y reconocimiento de zonas) |

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
- 8 GB de swap; el disco de 30 GB va al **83 %** (3 de septiembre de 2026).
  De los 22 GB usados, **8.3 GB son imágenes de Docker** de los nueve
  contenedores en marcha: eso no se puede recortar sin apagar servicios.

⚠️ **Lo que llena el disco es `.next/cache/webpack`.** Cada `next build` le
añade ~1.6 GB y nada le quitaba: llegó a **2.7 GB** y dejó el disco al 87 %, con
la alerta de Slack avisando de lo que de verdad importa — con el disco lleno
**Postgres deja de escribir**, y entonces la tienda no puede capturar.

⚠️ Borrarla **no es** borrar `.next`, que es lo prohibido de más abajo. Se sirve
`.next/static` (5 MB) y `.next/server` (82 MB); la caché solo se usa **al
construir**. Quitarla únicamente hace el siguiente build más lento.

Desde `scripts/deploy.sh`, el despliegue la limpia solo cuando pasa de 4 GB o
quedan menos de 5 GB libres, y **se detiene** si hay menos de 2 GB. El tope va
en 4 y no en 1 porque un solo build genera 1.6 GB: con 1 GB se borraría antes de
cada build y la caché no llegaría a servir nunca.

Para recuperar espacio a mano, por orden de lo que devuelve:

```bash
rm -rf /home/ubuntu/clarvex-app/.next/cache/webpack   # ~2 GB
sudo apt-get clean                                     # ~270 MB
sudo docker image prune -af                            # solo lo que nadie usa
```

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
| `adminer` | adminer:4-standalone | Mirar la base desde el navegador | **solo Tailscale** |

⚠️ **Siete de los nueve viven en el compose** de `/home/ubuntu/stack/` —todos
menos `clarvex_postgres` y `npm`, que se crearon con `docker run` sueltos y
meterlos ahí los recrearía—. Copia versionada en `scripts/aws-servicios-compose.yml`.

⚠️ **Adminer es una pantalla que puede BORRAR TABLAS.** Está solo en el tailnet
y su puerto se publica en `127.0.0.1` a propósito —quien entra pasa por
`tailscale serve`, nunca por `funnel`—, pero el candado que importa es con qué
usuario se entra: para mirar, `retool`, que tiene SELECT en 72 tablas y **cero**
escritura. `clarvex` es superusuario y ahí un `DELETE` con el `WHERE` mal puesto
se lleva datos de verdad.

⚠️ Para que Adminer viera a Postgres hubo que conectarlo a `clarvex_net`
(`docker network connect clarvex_net clarvex_postgres`): estaba solo en el
bridge por omisión, que **no resuelve nombres de contenedor**. Es la misma
trampa de los 502 de `npm`. No requiere reiniciar Postgres.

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
| Adminer (base de datos) | `https://clarvex-aws.taile59f37.ts.net:10443` | `127.0.0.1:8082` |

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
| **GitHub** | `git@github.com:CLARVEX-TEAM/clarvex-platform.git` | llave SSH del equipo |
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

⚠️ **Estas cubren el navegador y la PWA, NO la app de Android.** El WebView no
implementa la API de Push; la app va por FCM, aquí debajo. Ver «Notificaciones en
la app de Android» al principio de este documento.

### Notificaciones de la app de Android (FCM)

```env
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

Del JSON de una cuenta de servicio de Firebase, con el rol **Firebase Cloud
Messaging API Admin** y nada más. Sin las tres, la app se queda sin avisos y el
resto de la app funciona igual — se registra en el log y no falla nada, así que
conviene comprobarlo a propósito.

⚠️ **La llave se pega con `\n` literales** y el código los convierte; también
acepta saltos reales si se pega entre comillas. Lo que NO acepta es una llave sin
las líneas de cabecera PEM: ahí avisa y no firma.

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
