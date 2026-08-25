# Corte de Vultr a AWS — guion de la madrugada

Documento operativo para seguir paso a paso durante la ventana. No es una
explicación del proyecto: eso está en `CLAUDE.md` y `AGENTS.md`.

- **Origen:** Vultr `216.238.88.93` — `app.adrianluna.mx`
- **Destino:** AWS EC2 `t4g.medium` en `us-east-1` — `team.clarvex.tech`
- **Vigilante externo:** ya montado (`scripts/aws-vigilante.yaml`), avisa a
  `soporte@clarvex.adrianluna.mx`

---

## Estado verificado — 24 de agosto de 2026

Revisado entrando a las dos máquinas, no de memoria.

### Ya resuelto

- [x] **Acceso SSH a la instancia** — alias `clarvex-aws`. La llave original del
      par de EC2 se había perdido; se recuperó con EC2 Instance Connect y se
      instaló una permanente. Ver la memoria `acceso-ssh-instancia-aws`.
- [x] **Swap de 8 GB** configurado en AWS, con 3.7 GB de RAM y 13 GB de disco
      libres. El build cabe.
- [x] **`pnpm run build` comprobado en AWS**, actualizado al commit de `main`,
      health en `ok` y dos procesos PM2 online.
- [x] **WebAuthn ya apunta al dominio nuevo**: `WEBAUTHN_RP_ID` y
      `WEBAUTHN_ORIGIN` con `team.clarvex.tech`.
- [x] **Crontab de root vacío en AWS**, como manda la regla de convivencia.
- [x] **Vigilante externo** montado y probado hasta el correo.

### Resuelto el 24 de agosto por la noche

- [x] **`.env` a la par.** 44 variables efectivas en los dos lados; no falta
      ninguna y **solo difieren las tres que deben diferir**: `DATABASE_URL`
      (las dos bases tienen contraseñas distintas), `WEBAUTHN_ORIGIN` y
      `WEBAUTHN_RP_ID`.
      ⚠️ **Copiar el `.env` entero habría roto dos cosas a la vez:** la conexión
      a la base, y WebAuthn devuelto al dominio viejo.
      ⚠️ **El `.env` de Vultr tiene cada variable de Sentry TRES veces**, con
      valores distintos. Funciona porque gana la última. En AWS quedó
      deduplicado; en Vultr sigue sucio y conviene limpiarlo.
- [x] **Rol `retool` recreado en AWS**, idéntico al de Vultr y con su contraseña
      intacta (el hash viaja en `pg_dumpall --roles-only`, sin verla nadie):
      SELECT sobre 71 tablas, privilegios por omisión para las tablas futuras, y
      los cuatro `GRANT UPDATE` por columna —`Store.commissionTier`,
      `Store.commissionBasis`, `Store.kpisEnabled` y `DataSource.url`—.
      ⚠️ Esos cuatro **no salen** en `information_schema.table_privileges` ni en
      `pg_class.relacl`: viven en `pg_attribute.attacl`. Buscarlos donde no
      están hace creer que el rol es de solo lectura.
- [x] **Dos migraciones que faltaban, aplicadas.** La copia se restauró el 21 de
      agosto y las de Cuota Justa son del 22 y 23, así que a AWS le faltaba la
      tabla `WeeklyPerformanceClose` entera. El volcado final lo habría tapado,
      pero se habría descubierto a las tres de la mañana.

### Lo que todavía bloquea

- [x] **Usuario Unix `retool` creado en AWS**, idéntico al de Vultr: shell
      `nologin`, `600 retool:retool` y el mismo `permitopen="127.0.0.1:5432"`.
      ⚠️ **Al copiarlo con una tubería de PowerShell llegó corrupto** —BOM de
      UTF-8 y CRLF— y los dos comandos salieron sin ningún error. El BOM habría
      hecho que sshd rechazara la llave. Solo se vio comparando huellas.
      Ver la memoria `powershell-corrompe-tuberias`.
- [x] **Los cuatro contenedores, preparados.** `/home/ubuntu/stack/` tiene sus
      carpetas y un `docker-compose.yml` con `n8n`, `uptime-kuma`, `vaultwarden`
      y `portainer`, con las imágenes ya descargadas. **Falta solo copiar los
      datos**, que se hace en la ventana para que no diverjan.
      ⚠️ El compose NO incluye `postgres` ni `npm`: en AWS esos dos ya corren,
      creados con `docker run` sueltos. Meterlos ahí los recrearía y se perdería
      lo que ya sirve `team.clarvex.tech`.

- [ ] **Mover los DATOS de los cuatro contenedores** (~120 MB): desde
      `/root/stack/{uptime-kuma,vaultwarden,portainer}` y `/root/n8n/n8n_data`
      en Vultr, hacia `/home/ubuntu/stack/` en AWS. Va en la ventana, con los
      contenedores parados en los dos lados: son bases SQLite y copiarlas en
      caliente puede dejarlas a medias.
- [ ] **`WEBHOOK_URL` sigue apuntando a `n8n.adrianluna.mx`**, que es el n8n de
      Vultr. Tras el corte, AWS mandaría las fotos al servidor viejo.
- [ ] **Textos legales** apuntando al dominio nuevo.
- [x] **El TTL NO es un problema** — comprobado, y desmiente lo que decía antes
      este documento. Los cinco subdominios de `.adrianluna.mx` resuelven a
      `104.21.39.155` y `172.67.146.111`: **están proxeados por Cloudflare**, así
      que la gente resuelve a IP que nunca cambian y mover el origen surte
      efecto en segundos. `team.clarvex.tech` va directo pero ya tiene TTL de
      300 s. Lo peor que puede tardar la conmutación son cinco minutos.
      No hace falta preparar nada 24 h antes.

- [x] **Textos legales al dominio nuevo** (`8614094`): las doce menciones en los
      Términos, el Aviso de Privacidad y las políticas de cookies, reembolsos y
      seguridad. Verificado que el archivo queda idéntico salvo el dominio.

### La base va 35 filas atrás

`User` 19 = 19 y `Store` 5 = 5, pero `Kpi` está en 483 en Vultr contra 448 en
AWS: son las capturas hechas desde que se restauró la copia el 21 de agosto. Es
lo esperado y es justo lo que arregla el volcado final de la Fase 2.

---

## No es un dominio, son cinco

⚠️ **El punto que más se subestima.** `npm` en Vultr no sirve solo la app:

| Dominio | Va a | Estado |
|---|---|---|
| `app.adrianluna.mx` | la app (`:3000`) | activo |
| `n8n.adrianluna.mx` | n8n (`:5678`) | activo |
| `status.adrianluna.mx` | `uptime-kuma:3001` | activo |
| `vault.adrianluna.mx` | `vaultwarden:80` | activo |
| `docker.adrianluna.mx` | `portainer:9000` | activo |
| `proxy.adrianluna.mx` | `npm:81` | desactivado |
| `dns.adrianluna.mx` | `78.14.12.58:8053` | desactivado |

Los cinco activos hay que recrearlos en el `npm` de AWS **con sus certificados**,
y mover sus registros de DNS. Apagar Vultr sin esto deja sin gestor de
contraseñas (`vault`), sin monitoreo (`status`) y sin el webhook de fotos
(`n8n`) — y de los tres, nadie se acuerda hasta que hacen falta.

Los dos desactivados no se migran. `dns` además apunta a una IP que ni siquiera
es de este servidor: es un resto de otra época.

### Dos avisos que ahorran trabajo

**El corte rota `CRON_SECRET` gratis.** Está pendiente rotarlo, y en AWS se
escribe un `.env` nuevo y un crontab nuevo de todas formas. Poner ahí el valor
nuevo cuenta como rotación: no hay que hacerlo dos veces. El de Vultr muere con
el servidor.

**La URL de Mercado Pago se arregla sola.** Cada preferencia manda su
`notification_url` armada con `WEBAUTHN_ORIGIN`, así que al cambiar esa variable
el webhook sigue al dominio nuevo sin tocar nada en el panel de Mercado Pago.
El secreto de firma es de la aplicación, no del dominio, y también sobrevive.

---

## La ventana

### Fase 1 — Congelar (5 min)

1. En Vultr: `MAINTENANCE_MODE=1` y `pm2 restart clarvex-team --update-env`.
2. Comprobar que `/login` muestra la ventana de mantenimiento.

> **Por qué primero:** a partir de aquí nadie escribe. Sin este paso, cualquier
> captura que entre entre el volcado y la conmutación se pierde sin dejar rastro.

### Fase 2 — Volcado y restauración (15-30 min)

3. Volcado fresco en Vultr:
   ```
   docker exec -i clarvex_postgres pg_dump -U clarvex -Fc clarvex_team > /root/corte-final.dump
   ```
4. Copiarlo a la instancia de AWS.
5. Restaurar ahí:
   ```
   docker exec -i clarvex_postgres pg_restore -U clarvex -d clarvex_team --clean --if-exists < corte-final.dump
   ```
   ⚠️ `-U clarvex` no es opcional: el rol `postgres` no existe en este contenedor.
6. **Crear el rol `retool`** sobre la base ya restaurada — el `--clean` se lleva
   por delante lo que hubiera.
7. Contar filas de las tablas grandes en los dos lados y comparar. Si no cuadran,
   se para aquí: todavía se puede volver sin consecuencias.

### Fase 2b — Los servicios de al lado (15-20 min)

Todo lo de abajo está preparado: carpetas creadas, compose escrito e imágenes
descargadas. Aquí solo se copian los datos y se levanta.

7a. **Parar los cuatro en Vultr**, para que las SQLite no se copien a medias:
    ```
    ssh clarvex 'cd /root/stack && docker compose stop uptime-kuma vaultwarden portainer && cd /root/n8n && docker compose stop n8n'
    ```

7b. **Copiar los datos.** ⚠️ Desde una shell POSIX (el Bash de Git), **nunca
    desde PowerShell**: su tubería mete BOM y CRLF y no avisa.
    ```
    ssh clarvex 'tar -C /root/stack -cz uptime-kuma vaultwarden portainer; tar -C /root/n8n -cz n8n_data' | ssh clarvex-aws 'tar -C /home/ubuntu/stack -xz'
    ```

7c. **Abrir el puerto 22 a Retool** — sin esto el túnel no llega y el panel de
    captura se queda a oscuras:
    ```
    for r in 35.90.103.132/30 44.208.168.68/30 3.77.79.248/30; do aws ec2 authorize-security-group-ingress --group-name clarvex-app --protocol tcp --port 22 --cidr "$r" --profile clarvex --region us-east-1; done
    ```

7d. **Levantar y conectar npm a la red compartida:**
    ```
    ssh clarvex-aws 'cd /home/ubuntu/stack && sudo docker compose up -d && sudo docker network connect clarvex_net npm'
    ```
    ⚠️ Sin el `network connect`, los proxys de `status`, `vault` y `docker`
    responden **502** y el síntoma no dice por qué: el bridge por omisión de
    Docker no resuelve nombres de contenedor.

7e. **Recrear los proxys en el npm de AWS**, con sus certificados:
    `n8n`, `status`, `vault` y `docker`. Los tres últimos apuntan a
    `uptime-kuma:3001`, `vaultwarden:80` y `portainer:9000`; `n8n` a `n8n:5678`.

7f. ⚠️ **`app.adrianluna.mx` va como REDIRECCIÓN, no como segundo origen.**
    La app tiene `WEBAUTHN_ORIGIN=https://team.clarvex.tech`: si se sirviera
    también por el dominio viejo, el navegador rechazaría las credenciales por
    venir de otro origen y **la biometría no funcionaría**, sin que el fallo
    explique por qué. Se configura como *Redirection Host* hacia
    `https://team.clarvex.tech`. Sin esto, quien tenga el marcador viejo se
    encuentra un sitio caído.

### Fase 3 — Conmutación

8. Arrancar Clarvex en AWS con el `.env` definitivo y `MAINTENANCE_MODE=1`.
9. Comprobar `https://team.clarvex.tech/api/health` → `{"status":"ok"}`.
10. **Cambiar el DNS en Cloudflare** al nuevo destino.
11. Quitar el mantenimiento en AWS: `MAINTENANCE_MODE=0` y reiniciar PM2.

> ### ⛔ Punto de no retorno
>
> **Es el paso 11, no el cambio de DNS.** Mientras la app siga cerrada se puede
> devolver el DNS a Vultr y no se ha perdido nada. En cuanto se abre, empiezan a
> entrar capturas reales en AWS — y volver atrás significaría tirarlas.

### Fase 4 — Verificación

12. Entrar con PIN desde un teléfono.
13. **Registrar la huella otra vez.** Es lo esperado: la credencial de WebAuthn
    solo vale en el dominio donde se creó. Comprobar que el perfil ofrece
    registrarla y que después el login la ofrece — los dos, no uno.
14. Abrir el panel de Retool y guardar algo real de una pantalla de captura.
15. Subir una foto y comprobar que R2 responde y que llega a Telegram.

### Fase 5 — Crons y limpieza

16. **Crontab de Vultr: vaciarlo.** Dos servidores con los mismos crons mandan
    cada notificación por duplicado.
17. **Crontab de AWS: activarlo**, con el `CRON_SECRET` nuevo en las cabeceras.
18. Comprobar `GET /api/health?deep=1` con ese Bearer — es donde se confirma que
    el `.env` y el crontab llevan el mismo secreto.

---

## Rollback

**Mientras no se haya pasado el punto de no retorno:** devolver el DNS a Vultr,
`MAINTENANCE_MODE=0` allí, y todo sigue como estaba. Coste: cero.

**Después:** hay que decidir qué se hace con lo capturado en AWS. Por eso el
paso 7 —cuadrar las filas antes de abrir— es el que más importa de la noche.

---

## Los días siguientes

- **No apagar Vultr.** Dejarlo encendido pero cerrado varios días: es el único
  camino de vuelta si algo aparece tarde.
- Vigilar el correo del vigilante. Si `team.clarvex.tech` cae, avisa en 10 min.
- **Borrar la alarma `clarvex-caido-vultr`** el día que se apague de verdad, o
  quedará sonando por un servidor apagado a propósito.
- **Repetir el barrido de recursos de costo fijo.** Es cuando aparecen:
  ```
  aws ec2 describe-nat-gateways --profile clarvex --region us-east-1 --output table
  ```
- **Subir la alerta de presupuesto.** A $20 quedará por debajo del costo normal
  (~$35) y se convertirá en una alerta que nadie mira.
- **Borrar el usuario IAM `clarvex-bedrock`** y pasar la app al rol de instancia,
  para que deje de llevar llaves en el `.env`.
- Volver a medir el gasto una semana después, cuando ya sea tráfico real y no
  una copia parada.
