"""
Crea las alertas de Clarvex en Grafana Cloud, por su API.

    python3 /home/ubuntu/alertas-grafana.py

⚠️ **Esto es lo unico que cierra el circulo.** Los 22 paneles son un log con
colores: nadie los va a mirar a las tres de la manana. Este proyecto lleva
escrito TRES veces el mismo fallo --31 archivos de log que nadie abre, tres crons
rotos 24 dias escribiendo el error correcto en un archivo cerrado, un respaldo
que conservaba el estado del exito de ayer-- y el problema nunca fue que faltara
el dato. Era que estaba donde nadie lo veia.

⚠️ **Cada alerta dice QUE HACER, no solo que algo pasa.** Una alerta que dice
«disco al 90 %» obliga a recordar por que importa; una que dice «Postgres va a
dejar de escribir y la tienda no podra capturar» se actua sola.

⚠️ **Y `noDataState` NO es OK.** Si la serie desaparece --el colector caido, el
cron que dejo de correr-- eso es exactamente lo que hay que saber. Tratarlo como
«todo bien» reproduce el fallo original: el silencio pareciendo salud.
"""

import io
import json
import sys
import urllib.error
import urllib.request

ENV = "/home/ubuntu/stack/.env"
PROM = "grafanacloud-prom"
LOKI = "grafanacloud-logs"
FLUJO = '{service_name="unknown_service"}'
CARPETA = "clarvex"


def leer(clave):
    with io.open(ENV, encoding="utf-8") as archivo:
        for linea in archivo:
            if linea.startswith(clave + "="):
                return linea.split("=", 1)[1].strip()
    raise SystemExit(f"falta {clave} en el .env")


BASE = leer("GRAFANA_URL")
TOKEN = leer("GRAFANA_API_TOKEN")


def api(ruta, metodo="GET", cuerpo=None):
    peticion = urllib.request.Request(
        f"{BASE}{ruta}",
        data=json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None,
        method=metodo,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
    )
    with urllib.request.urlopen(peticion, timeout=40) as respuesta:
        crudo = respuesta.read()
        return json.loads(crudo) if crudo else {}


def regla(uid, titulo, resumen, accion, fuente, expr, umbral, operador="gt", para="5m", severidad="critica", sin_datos="Alerting"):
    """
    Una regla = la consulta (A) + la comparacion (B).

    ⚠️ `reduce` antes de `threshold`: una consulta de rango devuelve una serie y
    el umbral necesita UN numero. Sin reducir, Grafana guarda la regla y luego
    falla al evaluarla, que es un fallo que solo se ve en la pagina de alertas.
    """
    return {
        "uid": uid,
        "title": titulo,
        "condition": "C",
        "for": para,
        "data": [
            {
                "refId": "A",
                "relativeTimeRange": {"from": 3600, "to": 0},
                "datasourceUid": fuente,
                "model": {"refId": "A", "expr": expr, "instant": False, "range": True,
                          "intervalMs": 60000, "maxDataPoints": 43200},
            },
            {
                "refId": "B",
                "datasourceUid": "__expr__",
                "model": {"refId": "B", "type": "reduce", "expression": "A",
                          "reducer": "last", "settings": {"mode": "dropNN"}},
            },
            {
                "refId": "C",
                "datasourceUid": "__expr__",
                "model": {"refId": "C", "type": "threshold", "expression": "B",
                          "conditions": [{"evaluator": {"type": operador, "params": [umbral]}}]},
            },
        ],
        # ⚠️ Que significa «sin datos» depende de lo que mida la regla, y
        # confundirlo cuesta caro en las dos direcciones:
        #
        #   - Mide la AUSENCIA de algo bueno --el disco, el DNS, un cron que
        #     deberia haber corrido--: sin datos es ALERTA. Una serie que
        #     desaparece es justo lo que hay que saber.
        #   - Cuenta la PRESENCIA de algo malo --5xx, crons fallando--: sin
        #     datos es que NO HA PASADO NADA, o sea OK. Con «Alerting» estas dos
        #     reglas se pusieron en `pending` con cero errores reales, porque
        #     una consulta que no encuentra 5xx no devuelve cero: no devuelve
        #     nada. Una alerta que grita cuando todo va bien es exactamente como
        #     se deja de mirar un canal.
        #
        # Que apagarlas no deja un hueco lo garantizan «Ningun cron ha corrido»
        # y «La app no responde», que SI alertan por ausencia.
        "noDataState": sin_datos,
        "execErrState": "Alerting",
        "annotations": {
            "summary": resumen,
            "description": accion,
        },
        "labels": {"severidad": severidad, "equipo": "clarvex"},
    }


REGLAS = [
    # --- lo que deja a la tienda sin trabajar ------------------------------
    regla("cx-disco", "Disco casi lleno",
          "Quedan menos de 3 GB libres en el servidor",
          "Con el disco lleno Postgres DEJA DE ESCRIBIR y la tienda no puede capturar nada. "
          "Lo que mas devuelve: borrar .next/cache/webpack (~2 GB), luego `apt-get clean`.",
          PROM, 'system_filesystem_usage_bytes{mountpoint="/",state="free"}', 3_000_000_000, "lt"),

    regla("cx-memoria", "Memoria casi agotada",
          "Queda muy poca memoria disponible",
          "La maquina tiene 3.7 GB y `next build` ya se apoya en swap. Si esto se mantiene, "
          "el siguiente despliegue puede no caber. Mirar que proceso crecio.",
          PROM, 'sum(system_memory_usage_bytes{state=~"free|cached"})', 400_000_000, "lt", para="10m"),

    # --- la tienda inalcanzable sin error en el servidor -------------------
    regla("cx-dns", "Un dominio dejo de resolver",
          "Al menos un dominio de Clarvex no resuelve",
          "La app puede estar perfecta y nadie poder entrar: esto no produce ningun error "
          "en el servidor. Revisar el DNS en Cloudflare y a que IP apunta.",
          PROM, "min(dns_resuelve_ratio)", 1, "lt", para="5m"),

    regla("cx-tls", "Certificado a punto de caducar",
          "A un certificado le quedan menos de 14 dias",
          "Se renueva solo, pero cuando la renovacion falla nadie se entera hasta que el "
          "navegador avisa a la tienda. Revisar Nginx Proxy Manager.",
          PROM, "min(tls_dias_days)", 14, "lt", para="1h", severidad="aviso"),

    # --- los crons, que es el fallo historico de este proyecto -------------
    regla("cx-cron-fallo", "Un cron esta fallando",
          "Al menos un cron termino con ok=false",
          "Antes esto se escribia en un archivo que nadie abria: tres crons estuvieron rotos "
          "24 dias asi. Mirar cual en el panel «Crons que FALLARON».",
          LOKI, f'sum(count_over_time({FLUJO} | cron != `` | ok = `false` [30m]))', 0, "gt", para="10m", sin_datos="OK"),

    regla("cx-cron-mudo", "Ningun cron ha corrido en 3 horas",
          "No se ve ninguna ejecucion de cron reciente",
          "Si el crontab se vacio o el wrapper se rompio, los crons dejan de correr sin "
          "producir ningun error. Comprobar con `crontab -l` como usuario ubuntu.",
          LOKI, f'sum(count_over_time({FLUJO} | cron != `` [3h]))', 1, "lt", para="15m"),

    # --- la app -----------------------------------------------------------
    regla("cx-5xx", "Errores 5xx en la app",
          "El servidor esta devolviendo errores",
          "Suele ser un despliegue recien hecho. Mirar los logs de la app y, si acaba de "
          "desplegarse, valorar volver a la version anterior.",
          LOKI, f'sum(count_over_time({FLUJO} | estado =~ `5..` [15m]))', 5, "gt", para="5m", sin_datos="OK"),

    regla("cx-salud", "La app no responde",
          "Han dejado de entrar peticiones por el proxy",
          "Cero trafico durante 15 minutos en horario de tienda significa que algo esta "
          "cortado antes de la app: proxy, DNS o la propia maquina.",
          LOKI, f'sum(count_over_time({FLUJO} | estado != `` [15m]))', 1, "lt", para="15m"),

    # --- el dinero --------------------------------------------------------
    regla("cx-gasto", "El gasto de AWS se disparo",
          "El gasto diario supera el ritmo normal",
          "El ritmo normal es ~$1 al dia (~$31/mes) con el presupuesto en $45. Un dia por "
          "encima de $3 merece mirar que servicio subio en el panel de gasto.",
          PROM, "sum(last_over_time(aws_costo_diario_USD[24h]))", 3, "gt", para="1h", severidad="aviso"),
]


def carpeta():
    """
    La carpeta donde viven las reglas.

    ⚠️ Se busca en el LISTADO, no pidiendola por su uid. Esta cuenta de servicio
    puede listar carpetas y crearlas, pero `GET /api/folders/<uid>` le devuelve
    403 exista o no --no 404--, asi que ese camino no distingue «no esta» de «no
    puedo verla» y el guion moria con un «Forbidden» que parecia falta de
    permisos cuando la carpeta ya estaba creada.
    """
    for f in api("/api/folders"):
        if f.get("uid") == CARPETA:
            return CARPETA
    return api("/api/folders", "POST", {"uid": CARPETA, "title": "Clarvex"})["uid"]


def main():
    uid = carpeta()
    puestas, fallos = 0, []
    for r in REGLAS:
        r["folderUID"] = uid
        r["ruleGroup"] = "clarvex"
        r["orgID"] = 1
        # `for` es palabra reservada en el JSON de Grafana pero se manda igual.
        try:
            # Si ya existe se reemplaza; si no, se crea.
            try:
                api(f"/api/v1/provisioning/alert-rules/{r['uid']}", "PUT", r)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                api("/api/v1/provisioning/alert-rules", "POST", r)
            puestas += 1
        except urllib.error.HTTPError as error:
            fallos.append(f"{r['uid']}: HTTP {error.code} {error.read().decode()[:200]}")

    print(f"{puestas} de {len(REGLAS)} alertas puestas en la carpeta «Clarvex»")
    for f in fallos:
        print("  FALLO", f, file=sys.stderr)
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
