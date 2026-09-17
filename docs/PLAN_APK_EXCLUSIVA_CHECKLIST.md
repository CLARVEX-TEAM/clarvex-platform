# Plan de trabajo: experiencia exclusiva de APK y nuevo checklist

**Estado:** aprobado y en ejecución; APK 1.5.1 publicada y aceptada en equipo real
**Fecha:** 17 de septiembre de 2026
**Repositorios:** `clarvex-platform` y `clarvex-movil`

## 1. Objetivo

Convertir la APK de Clarvex en la superficie diaria principal para gerencia,
subgerencia y asesores, aprovechando funciones nativas que no existen en el
navegador. La web y la PWA conservarán sus funciones actuales; las nuevas
experiencias descritas aquí aparecerán únicamente dentro de la APK.

El trabajo debe conseguir cuatro resultados:

1. El equipo entiende qué debe hacer hoy desde una sola pantalla.
2. El kiosco captura documentos y evidencias con menos errores.
3. Las operaciones importantes sobreviven a una conexión inestable.
4. El servidor puede distinguir una APK registrada de un navegador que solo
   intenta imitar el puente de Capacitor.

### Avance del primer incremento — 16 de septiembre de 2026

- APK 1.5/código 6 y marca `ClarvexApp/1.5`.
- Escáner documental ML Kit de hasta 25 páginas con fallback a cámara estándar.
- Checklist exclusivo de APK con progreso, Apertura/Cierre, siguiente acción y
  completadas plegables; la interfaz web actual se conserva.
- Notificaciones nativas abren únicamente rutas internas validadas.
- Backups y transferencia de datos de la app desactivados.
- Actualizador limitado al host HTTPS oficial, 50 MiB, paquete, versión y firma.
- Aceptación física completada el 17 de septiembre mediante APK 1.5.1: cámara,
  escáner, galería, varias páginas, notificaciones y operación general correctas.

### Segunda etapa publicada y aceptada — 17 de septiembre de 2026

- Plugin `DispositivoClarvex` con identificador de instalación y llave EC P-256
  no exportable en Android Keystore.
- Registro autenticado por usuario/tienda/perfil, capacidades y versión, con
  auditoría y asociación opcional del token FCM al dispositivo.
- Retos de dos minutos y un solo uso; cada petición protegida firma método,
  ruta, consulta, hash del cuerpo, timestamp y nonce.
- Guard común `requireNativeDevice()` y primer endpoint protegido para comprobar
  todo el recorrido desde Android hasta el servidor.
- Diagnóstico ampliado: Android, equipo, WebView, red, hora automática,
  almacenamiento, cámara, notificaciones, instalación y prueba de firma.
- Migración aditiva; las APK publicadas anteriormente conservan su registro FCM.

Esta etapa demuestra que una petición posee la llave privada registrada y evita
la reutilización de firmas. El alta inicial aún no demuestra por sí sola que la
llave nació dentro de la APK oficial: un cliente con sesión válida puede generar
otra llave P-256 e intentar registrarla. Para declarar exclusividad criptográfica
completa falta validar Android Key Attestation con el paquete y certificado de
Clarvex, o someter el primer alta a aprobación de gerencia en equipos sin
atestación. Hasta entonces debe describirse como **vinculación de dispositivo**.

## 2. Alcance funcional completo

### Para todas las personas

- **Mi día:** horario, uniforme, tareas, meta, avance, pendientes, comunicados y
  accesos rápidos según el rol.
- **Mi asistencia:** historial, incidencias y solicitud de corrección con
  evidencia y seguimiento.
- **Horarios inteligentes:** avisos de turno/cambio, intercambio desde el
  calendario y exportación al calendario de Android.
- **Notificaciones accionables:** cada aviso abre la pantalla y el elemento
  exactos; las acciones simples se resuelven desde el aviso cuando sea seguro.
- **Credencial digital:** nombre, foto, puesto, tienda y QR verificable de corta
  duración. Nunca incluir datos sensibles directamente en el QR.
- **Capacitación breve:** lecciones, video, confirmación, preguntas, progreso y
  constancias.
- **Reconocimientos:** logros y kudos personales, sin ranking público permanente.
- **Centro de ayuda:** folio, categoría, descripción, evidencia, estado y
  conversación de seguimiento.
- **Uso sin conexión:** lectura de la información diaria ya descargada y cola de
  operaciones permitidas para envío posterior.

### Para kiosco y operación de tienda

- **Escáner nativo de documentos:** captura automática, detección de bordes,
  corrección de perspectiva, rotación, limpieza, varias páginas y salida PDF/JPEG.
- **Escáner nativo de códigos:** marbetes y QR con enfoque, linterna, vibración y
  confirmación inmediata.
- **Cola de evidencias:** fotos, PDFs y checklist persisten si la app se cierra o
  se pierde internet; reintento automático con estado visible.
- **Diagnóstico del equipo:** cámara, notificaciones, red, versión, WebView,
  actualización, almacenamiento y última sincronización.
- **Control del dispositivo:** tienda asociada, última conexión, versión,
  permisos, revocación y cierre remoto de sesión.
- **Modo kiosco administrado:** inicio automático y bloqueo de salida solamente
  en equipos propiedad de la empresa configurados como `KIOSK`.
- **Actualizador endurecido:** HTTPS y host permitidos, límite de tamaño, SHA-256,
  paquete, versionCode y certificado antes de abrir el instalador.

## 3. Exclusividad real de APK

Ocultar botones con `enContenedorNativo()` mejora la interfaz, pero no es un
control de seguridad: un navegador puede simular JavaScript. La exclusividad se
implementará en dos capas.

### Capa de experiencia

- Navegación, rutas y componentes nuevos solo se montan si Capacitor reporta
  plataforma Android y los plugins esperados están presentes.
- La web/PWA mantiene sus rutas actuales y no muestra accesos a “Mi día APK”,
  credencial, diagnóstico, escáner o cola sin conexión.
- Las pantallas compartidas conservan un fallback web explícito.

### Capa de servidor

- Nuevo plugin `DispositivoClarvex` genera una llave EC no exportable en Android
  Keystore.
- Registro inicial autenticado: el servidor guarda llave pública, instalación,
  usuario, tienda, perfil `PERSONAL` o `KIOSK`, versión y capacidades.
- Los endpoints exclusivos emiten un nonce y exigen firma del método, ruta,
  cuerpo, timestamp y nonce. La cookie de sesión sigue siendo obligatoria.
- Nonces de un solo uso, ventana temporal corta, rotación y revocación auditada.
- Guard común `requireNativeDevice()` para no repetir verificaciones.
- Un dispositivo revocado pierde los endpoints protegidos. La eliminación de su
  token FCM y el cierre de sesión en heartbeat forman parte del panel de control
  de dispositivos de la fase 1.6.

La prueba de posesión no sustituye la prueba de procedencia de la aplicación.
Antes de usar este registro como frontera de exclusividad se validará la cadena
de Android Key Attestation, el nombre de paquete y el digest del certificado de
firma. Los equipos que no puedan atestar requerirán aprobación explícita de
gerencia; nunca se aceptará una bandera enviada por JavaScript como sustituto.

### Datos propuestos

- `NativeDevice`: instalación, llave pública, usuario, tienda, perfil, versión,
  capacidades, estado, alta, último acceso y revocación.
- `NativeDeviceChallenge`: nonce, propósito y expiración breve.
- Ampliar `DeviceToken` para asociarlo a `NativeDevice`, sin duplicar tokens FCM.
- Todo cambio de asociación, revocación y modo kiosco entra en `AuditLog`.

## 4. Rediseño del checklist de APK

### Trabajo y audiencia

Modo **Operate**. Se usa de pie, con una mano, interrupciones frecuentes, brillo
alto y teléfonos de gama baja. La acción principal es completar correctamente
la siguiente tarea y dejar evidencia clara.

### Estructura

1. **Cabecera compacta:** tienda, fecha, progreso total y estado de sincronización.
2. **Bloque prioritario:** asistencia AXO, energía y cualquier punto vencido.
3. **Selector Apertura/Cierre:** muestra avance y pendientes de cada momento.
4. **Siguiente acción:** una tarjeta destacada conduce al próximo punto pendiente.
5. **Lista de tareas:** filas completas y táctiles; estado, responsable, hora y
   evidencia. Se eliminan los dos botones pequeños de cámara/galería como acción
   principal.
6. **Acción contextual:** “Completar”, “Tomar foto” o “Escanear”, según el tipo.
   La galería queda como opción secundaria en una hoja inferior.
7. **Completadas plegables:** reducen ruido sin ocultar el historial.
8. **Cierre del bloque:** confirmación visible y resumen cuando todo termina.

### Estados obligatorios

- Cargando, vacío, actualización silenciosa y datos cacheados.
- Permiso de cámara denegado, cámara no disponible y escáner no compatible.
- Sin conexión, guardado local, en cola, subiendo, reintentando y sincronizado.
- Error recuperable por tarea, conflicto de edición y sesión vencida.
- Pendiente, próximo a vencer, vencido, completado y completado por otra persona.
- PDF de 1 a 25 páginas y tarea con 0 a 3 evidencias fotográficas.

### Reglas de experiencia

- Objetivos táctiles de al menos 44–48 dp, contraste AA y estado nunca indicado
  solo por color.
- Una sola acción primaria por tarea y retroalimentación háptica breve al terminar.
- Optimismo visual únicamente cuando la operación quedó guardada localmente con
  un identificador idempotente.
- Animación corta y con soporte para movimiento reducido.
- El checklist de escritorio conserva su composición; el rediseño se activa en
  la APK y comparte componentes/datos donde convenga.

## 5. Arquitectura de trabajo sin conexión

- Base local privada para metadatos, cola e información diaria cacheada.
- Archivos dentro del almacenamiento privado de la app; no usar la galería como
  cola ni dejar PDFs en Descargas.
- Cada operación lleva `operationId` idempotente generado en el dispositivo.
- `WorkManager` envía cuando hay red, conserva trabajos tras reinicios y aplica
  reintento exponencial.
- El servidor acepta reintentos sin duplicar checklist, correcciones, tickets o
  evidencias.
- La primera entrega offline cubre checklist, fotos/escaneos, correcciones de
  asistencia y tickets. Chat y KPIs siguen requiriendo conexión.
- Controles para cancelar, reintentar y eliminar un elemento que aún no se haya
  enviado.

## 6. Roadmap por versiones

### Fase 0 — Contrato y prototipo, 3–5 días

- Inventario de dispositivos reales: Android, RAM, WebView, cámara y propiedad.
- Confirmar perfiles `PERSONAL` y `KIOSK` por tienda.
- Flujos y prototipo navegable de Mi día y checklist APK.
- Contratos API, política de retención y matriz de permisos por rol.
- Prueba técnica del escáner ML Kit en el teléfono kiosco actual.

**Salida:** brief aprobado, prototipo y matriz de aceptación.

### APK 1.5 — Base nativa, seguridad y checklist, 2–3 semanas

- Registro criptográfico del dispositivo y guard de endpoints nativos.
- Endurecimiento del manifiesto, backups y actualizador.
- Deep links internos desde FCM.
- Nuevo checklist APK con prioridad, progreso y estados de carga/error.
- Escáner documental nativo y subida compatible con las APIs actuales.
- Diagnóstico básico de permisos, red, FCM, WebView y versión.

**Salida:** el kiosco completa apertura/cierre y vouchers con el flujo nuevo; los
endpoints protegidos exigen sesión, dispositivo vinculado y firma de un solo uso.
La procedencia oficial se convierte en puerta obligatoria antes de mover a esos
endpoints operaciones sensibles.

### APK 1.6 — Jornada personal, 2–3 semanas

- Mi día y endpoint agregador por usuario.
- Mi asistencia y flujo de corrección: solicitar, revisar, aprobar/rechazar y auditar.
- Recordatorios de turno/cambio e integración con calendario mediante intent del
  sistema, sin pedir acceso completo al calendario.
- Notificaciones accionables para horarios, solicitudes, comunicados y checklist.
- Panel de dispositivos para gerencia y revocación/cierre remoto.

**Salida:** un asesor resuelve su jornada habitual desde la portada de la APK.

### APK 1.7 — Desarrollo y soporte, 2–3 semanas

- Credencial digital con QR firmado y verificación en línea.
- Capacitación por unidades, preguntas, avance y constancia.
- Resumen de reconocimientos y metas personales.
- Centro de ayuda con folio, evidencia, conversación y SLA visible.

**Salida:** identidad, capacitación, reconocimiento y soporte viven en un solo flujo.

### APK 1.8 — Offline y kiosco administrado, 3–4 semanas

- Cola persistente con WorkManager y panel de sincronización.
- Checklist, evidencias, asistencia y tickets con alcance offline definido.
- Escáner de códigos nativo para marbetes/QR.
- Perfil `KIOSK`, inicio automático, lock task y salida protegida por gerencia.
- Telemetría de salud del dispositivo y alertas por versión/permiso/conexión.

**Salida:** el kiosco opera con cortes de red y vuelve a sincronizar sin duplicados.

### Fase de cierre — Piloto y despliegue, 1–2 semanas

- Piloto con un kiosco y 3–5 teléfonos personales.
- Dos ciclos completos de apertura/cierre y una semana de horarios/notificaciones.
- Corrección de hallazgos, manual de recuperación y capacitación breve.
- Publicación gradual por versión mínima, con vuelta atrás del código web y sin
  migraciones destructivas.

**Estimación total para una persona:** 11–15 semanas. Las versiones son
publicables por separado; no hace falta esperar a la 1.8 para recibir valor.

## 7. Entregables por repositorio

### `clarvex-movil`

- Plugins: dispositivo, escáner, diagnóstico, almacenamiento/cola y kiosco.
- Integración de notificaciones/deep links y WorkManager.
- Reglas de backup/extracción, navegación permitida y actualizador endurecido.
- Pruebas unitarias Java, instrumentadas y compilación firmada reproducible.

### `clarvex-platform`

- Rutas y componentes exclusivos de APK, Mi día y nuevo checklist.
- Modelos/migraciones, guards de dispositivo e idempotencia.
- Flujos de corrección, credencial, capacitación, reconocimientos y soporte.
- Consola de dispositivos para gerencia/plataforma.
- Pruebas unitarias, integración HTTP, seguridad, visuales y builds aislados.

## 8. Criterios de aceptación globales

- Navegador/PWA: sin accesos visibles; los endpoints protegidos rechazan la sesión
  sin dispositivo vinculado y firma válida. El alta se cerrará con atestación o
  aprobación antes de considerarlo un límite criptográfico de APK oficial.
- APK registrada: sesión + firma válida; revocación efectiva y auditada.
- Ninguna foto/PDF confirmado se pierde al cerrar la app, reiniciar o quitar red.
- Reintentar una operación nunca duplica una captura o evidencia.
- Tocar una notificación abre el recurso correcto después de login/desbloqueo.
- El modo kiosco jamás se activa en teléfonos `PERSONAL`.
- El checklist funciona en el teléfono real de tienda, con cámara, galería,
  escáner, PDF, conexión lenta y permisos negados.
- Rendimiento: contenido cacheado visible en menos de un segundo y acción local
  reconocida en menos de 150 ms; subidas muestran progreso real.
- Accesibilidad: TalkBack básico, foco, tamaños táctiles, contraste y movimiento reducido.
- Seguridad: sin secretos en APK, backups de sesión excluidos, descargas limitadas
  al dominio permitido y certificado de actualización verificado.

## 9. Pruebas y puertas de publicación

- Unitarias para reglas, permisos, firmas, idempotencia y transición de estados.
- Integración con PostgreSQL efímero para aislamiento de tienda/usuario/dispositivo.
- Android instrumentado en API mínima soportada, teléfono kiosco y teléfono moderno.
- Matriz de cámara: captura, cancelar, permiso negado, poca luz, reflejo, varias páginas.
- Matriz offline: antes/durante/después de guardar, cierre forzado, reinicio y token vencido.
- Visuales del checklist en claro/oscuro, texto grande y pantalla pequeña.
- Firma/certificado, versionCode, manifiesto, FCM, hash y actualización sobre la
  versión anterior antes de publicar.
- Mientras Actions siga bloqueado por facturación, estas puertas se ejecutan en
  copias locales aisladas y se conserva evidencia. No se sustituye una prueba
  omitida por una afirmación de CI verde.

## 10. Decisiones y límites

- El modo kiosco completo requiere un dispositivo administrado como device owner;
  “fijar pantalla” en un teléfono normal permite que la persona salga y no ofrece
  el mismo control.
- El escáner documental de ML Kit depende de Google Play services, Android 21+ y
  al menos 1.7 GB de RAM. Debe existir fallback a captura estándar.
- No se incluye reconocimiento facial, ubicación continua, lectura silenciosa de
  contactos ni datos médicos en la credencial.
- No se reescribe toda la aplicación en nativo. La web sigue siendo la fuente de
  interfaz y negocio; Android añade hardware, seguridad, offline y sistema operativo.

## 11. Fuentes técnicas seleccionadas

- ML Kit Document Scanner: https://developers.google.com/ml-kit/vision/doc-scanner/android
- WorkManager y trabajo persistente: https://developer.android.com/develop/background-work/background-tasks/persistent
- Arquitectura offline-first: https://developer.android.com/topic/architecture/data-layer/offline-first
- Android Keystore: https://developer.android.com/privacy-and-security/keystore
- Lock task para dispositivos dedicados: https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
