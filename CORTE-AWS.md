# Corte de Vultr a AWS — guion de la madrugada

Documento operativo para seguir paso a paso durante la ventana. No es una
explicación del proyecto: eso está en `CLAUDE.md` y `AGENTS.md`.

- **Origen:** Vultr `216.238.88.93` — `app.adrianluna.mx`
- **Destino:** AWS EC2 `t4g.medium` en `us-east-1` — `team.clarvex.tech`
- **Vigilante externo:** ya montado (`scripts/aws-vigilante.yaml`), avisa a
  `soporte@clarvex.adrianluna.mx`

---

## Lo que NO está listo todavía

⚠️ **Esta lista bloquea el corte.** Mientras quede algo sin marcar, la ventana
de madrugada no se abre: son cosas que llevan tiempo y no se improvisan a las
tres de la mañana.

- [ ] **Mover los cuatro contenedores** a la instancia de AWS: `n8n`,
      `uptime-kuma`, `vaultwarden` y `portainer`. Hoy solo viven en Vultr.
- [ ] **Crear el rol `retool`** (solo lectura + 3 columnas de `Store`) en la
      base restaurada de AWS. Sin él, el panel de captura no entra.
- [ ] **Textos legales** apuntando al dominio nuevo.
- [ ] **`.env` completo en AWS** — 37 variables. Las que CAMBIAN de valor:
      - `WEBAUTHN_RP_ID` → `team.clarvex.tech`
      - `WEBAUTHN_ORIGIN` → `https://team.clarvex.tech`
      - `APP_URL` → `https://team.clarvex.tech`
      - `WEBHOOK_URL` → la dirección nueva de n8n
      - `DATABASE_URL` → apunta al Postgres local de la instancia
- [ ] **Comprobar que `pnpm run build` termina** en la instancia de AWS. Tiene
      4 GB contra los 3.3 de Vultr, así que debería ir mejor — pero se confirma
      antes, no durante.
- [ ] **Bajar el TTL del DNS a 60 s en Cloudflare**, al menos 24 h antes.
      Si se hace el mismo día, el cambio tarda lo que diga el TTL viejo y la
      tienda queda repartida entre dos servidores durante horas.

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
