"""
Crea el dashboard de Clarvex en Grafana Cloud, por su API.

    python3 /home/ubuntu/dashboard-grafana.py

⚠️ Los nombres NO se suponen: se leyeron de la propia cuenta antes de escribir
esto. Grafana renombra al recibir por OTLP y ADEMAS le pega el sufijo de la
unidad, asi que lo que el colector manda como `system.memory.usage` se consulta
como `system_memory_usage_bytes`. La costumbre de escribir `system_memory_usage`
da una consulta valida que no falla y devuelve nada, que es el peor de los tres
finales: parece que no hay datos.

    system.memory.usage      -> system_memory_usage_bytes
    system.cpu.utilization   -> system_cpu_utilization_ratio
    system.network.io        -> system_network_io_bytes_total
    aws.costo.diario         -> aws_costo_diario_USD

⚠️ Y en Loki los campos del proxy y de los crons NO son etiquetas: la unica
etiqueta es `service_name`. Todo lo demas --estado, ruta, cron, ok-- llega como
metadato estructurado y se filtra DESPUES del selector, con `| estado=~"5.."`.
Metido dentro de las llaves, la consulta no encuentra ningun flujo.
"""

import io
import json
import sys
import urllib.error
import urllib.request

ENV = "/home/ubuntu/stack/.env"
PROM = {"type": "prometheus", "uid": "grafanacloud-prom"}
LOKI = {"type": "loki", "uid": "grafanacloud-logs"}
# Todo lo del colector cae en este servicio: no lleva `service.name` propio.
FLUJO = '{service_name="unknown_service"}'


def leer(clave):
    with io.open(ENV, encoding="utf-8") as archivo:
        for linea in archivo:
            if linea.startswith(clave + "="):
                return linea.split("=", 1)[1].strip()
    raise SystemExit(f"falta {clave} en el .env")


_id = [0]


def siguiente():
    _id[0] += 1
    return _id[0]


def panel(titulo, desc, tipo, datasource, targets, x, y, w, h, unidad="short", extra=None):
    p = {
        "id": siguiente(),
        "type": tipo,
        "title": titulo,
        "description": desc,
        "datasource": datasource,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "targets": targets,
        "fieldConfig": {"defaults": {"unit": unidad, "custom": {}}, "overrides": []},
        "options": {},
    }
    if extra:
        p["options"].update(extra.pop("options", {}))
        p.update(extra)
    return p


def prom(expr, leyenda=""):
    return [{"refId": "A", "datasource": PROM, "expr": expr, "legendFormat": leyenda, "range": True}]


def loki(expr, leyenda="", instant=False):
    return [{
        "refId": "A", "datasource": LOKI, "expr": expr, "legendFormat": leyenda,
        "queryType": "range", "instant": instant, "range": not instant,
    }]


PANELES = []

# --- lo que PARA la tienda ------------------------------------------------
PANELES.append(panel(
    "Disco usado", "Con el disco lleno Postgres deja de escribir y la tienda no puede capturar. Es el fallo mas caro de esta maquina.",
    "timeseries", PROM,
    prom('system_filesystem_usage_bytes{mountpoint="/"}', "{{state}}"),
    0, 0, 8, 7, "bytes"))

PANELES.append(panel(
    "Disco libre", "Por debajo de 2 GB el despliegue se niega a construir.",
    "stat", PROM,
    prom('system_filesystem_usage_bytes{mountpoint="/",state="free"}', "libre"),
    8, 0, 4, 7, "bytes",
    {"options": {"colorMode": "background", "graphMode": "area", "reduceOptions": {"calcs": ["lastNotNull"]}},
     "fieldConfig": {"defaults": {"unit": "bytes", "thresholds": {"mode": "absolute", "steps": [
         {"color": "red", "value": None}, {"color": "orange", "value": 2_000_000_000},
         {"color": "green", "value": 5_000_000_000}]}}, "overrides": []}}))

PANELES.append(panel(
    "Memoria", "3.7 GB en total. Cuando lo disponible baja, el build de Next se va a swap y tarda minutos de mas.",
    "timeseries", PROM, prom("system_memory_usage_bytes", "{{state}}"), 0, 7, 6, 7, "bytes"))

PANELES.append(panel(
    "CPU", "Por estado. Un `iowait` alto suele ser el disco, no la CPU.",
    "timeseries", PROM, prom("system_cpu_utilization_ratio", "{{state}}"), 6, 7, 6, 7, "percentunit"))

PANELES.append(panel(
    "Swap en uso", "Ya hay swap tocado en reposo. Si sube mucho, algo se esta comiendo la RAM.",
    "timeseries", PROM, prom('system_paging_usage_bytes{state="used"}', "swap"), 0, 14, 4, 6, "bytes"))

PANELES.append(panel(
    "Carga del sistema", "Media de 1 minuto. Por encima del numero de nucleos, hay cola.",
    "timeseries", PROM, prom("system_cpu_load_average_1m", "carga"), 4, 14, 4, 6, "short"))

PANELES.append(panel(
    "Red", "Lo que entra y sale por la interfaz.",
    "timeseries", PROM, prom("rate(system_network_io_bytes_total[5m])", "{{direction}}"), 8, 14, 4, 6, "Bps"))

# --- el DNS y los certificados -------------------------------------------
# ⚠️ Van ARRIBA, con el disco, porque son de la misma familia: dejan la tienda
# inalcanzable sin un solo error en el servidor. La app responde perfecta, PM2
# dice `online`, la salud da 200 desde dentro, y nadie puede entrar.
PANELES.append(panel(
    "¿Resuelven los dominios?", "1 = resuelve. Un dominio que deja de resolver o que apunta a otro sitio no produce ningun error aqui dentro.",
    "stat", PROM, prom("dns_resuelve_ratio", "{{dominio}}"), 0, 20, 6, 6, "short",
    {"options": {"colorMode": "background", "textMode": "value_and_name",
                 "reduceOptions": {"calcs": ["lastNotNull"]}},
     "fieldConfig": {"defaults": {"unit": "short", "thresholds": {"mode": "absolute", "steps": [
         {"color": "red", "value": None}, {"color": "green", "value": 1}]}}, "overrides": []}}))

PANELES.append(panel(
    "Certificado: dias restantes", "El otro fallo mudo. Se renueva solo, pero cuando la renovacion falla nadie se entera hasta que el navegador avisa a la tienda.",
    "bargauge", PROM, prom("tls_dias_days", "{{dominio}}"), 6, 20, 6, 6, "d",
    {"options": {"displayMode": "gradient", "orientation": "horizontal",
                 "reduceOptions": {"calcs": ["lastNotNull"]}},
     "fieldConfig": {"defaults": {"unit": "d", "max": 90, "min": 0, "thresholds": {"mode": "absolute", "steps": [
         {"color": "red", "value": None}, {"color": "orange", "value": 14}, {"color": "green", "value": 30}]}}, "overrides": []}}))

PANELES.append(panel(
    "Tiempo de resolucion DNS", "Si se dispara, el problema esta antes de llegar al servidor.",
    "timeseries", PROM, prom("dns_tiempo_milliseconds", "{{dominio}}"), 0, 26, 12, 5, "ms"))

# --- el dinero ------------------------------------------------------------
PANELES.append(panel(
    # ⚠️ `last_over_time(...[24h])` y no la metrica a secas. Prometheus da por
    # VIEJO un dato de mas de ~5 minutos, y este se empuja UNA vez al dia: la
    # consulta directa devuelve vacio 23 horas y 55 minutos de cada 24. Mirar
    # hacia atras 24 horas cuesta cero; empujar mas seguido costaria $7 al mes.
    "Gasto de AWS por servicio", "Bruto antes de creditos, igual que el presupuesto. Se consulta UNA vez al dia: cada llamada a Cost Explorer cuesta $0.01.",
    "timeseries", PROM, prom("last_over_time(aws_costo_diario_USD[24h])", "{{servicio}}"), 0, 20, 8, 7, "currencyUSD"))

PANELES.append(panel(
    "Gasto del dia", "Suma de todos los servicios. El presupuesto esta en $45/mes con un ritmo real de ~$31.",
    "stat", PROM, prom("sum(last_over_time(aws_costo_diario_USD[24h]))", "total"), 8, 20, 4, 7, "currencyUSD",
    {"options": {"colorMode": "background", "graphMode": "area", "reduceOptions": {"calcs": ["lastNotNull"]}}}))

# --- Cloudflare ------------------------------------------------------------
# ⚠️ Esto es el PUNTO CIEGO de los logs de nginx: lo que Cloudflare atiende o
# bloquea NO llega al servidor, asi que no deja rastro alli. Y como
# `team.clarvex.tech` va directo a la EC2 y los otros tres pasan por Cloudflare,
# aqui se ve la diferencia entre lo que esta detras del filtro y lo que no.
#
# ⚠️ Con `last_over_time`: se empuja cada 15 minutos con el dato de la ultima
# hora cerrada, asi que entre empujon y empujon la serie esta hueca.
PANELES.append(panel(
    "Cloudflare · peticiones por hora", "Lo que ve Cloudflare de cada zona. Mandar las 48 horas con su fecha original hace que Prometheus rechace el lote entero por muestra vieja.",
    "timeseries", PROM, prom("last_over_time(cf_peticiones[2h])", "{{zona}}"), 0, 31, 6, 7, "short"))

PANELES.append(panel(
    "Cloudflare · amenazas filtradas", "Peticiones que Cloudflare bloqueo ANTES de tu servidor. Estas no aparecen en los logs de nginx, por definicion.",
    "timeseries", PROM, prom("last_over_time(cf_amenazas[2h])", "{{zona}}"), 6, 31, 6, 7, "short"))

# --- el trafico -----------------------------------------------------------
PANELES.append(panel(
    "Peticiones por minuto", "Todo lo que entra por el proxy.",
    "timeseries", LOKI,
    loki(f'sum(count_over_time({FLUJO} | estado != `` [1m]))', "peticiones"),
    0, 42, 8, 7, "short"))

PANELES.append(panel(
    "Errores 5xx", "Fallos del servidor. Cualquier cosa por encima de cero merece una mirada.",
    "stat", LOKI,
    loki(f'sum(count_over_time({FLUJO} | estado =~ `5..` [$__range]))', "5xx", instant=True),
    8, 42, 4, 7, "short",
    {"options": {"colorMode": "background", "reduceOptions": {"calcs": ["lastNotNull"]}},
     "fieldConfig": {"defaults": {"unit": "short", "thresholds": {"mode": "absolute", "steps": [
         {"color": "green", "value": None}, {"color": "orange", "value": 1}, {"color": "red", "value": 20}]}}, "overrides": []}}))

PANELES.append(panel(
    "Por codigo de estado", "Un pico de 4xx suele ser un escaner; uno de 5xx somos nosotros.",
    "timeseries", LOKI,
    loki(f'sum by (estado) (count_over_time({FLUJO} | estado != `` [5m]))', "{{estado}}"),
    0, 49, 6, 7, "short"))

PANELES.append(panel(
    "Rutas mas pedidas", "La query va recortada del propio cuerpo: esta app pone tokens en la URL.",
    "table", LOKI,
    loki(f'topk(15, sum by (ruta) (count_over_time({FLUJO} | ruta != `` [$__range])))', "", instant=True),
    6, 49, 6, 7, "short"))

PANELES.append(panel(
    "Sondeos buscando secretos", "Peticiones a rutas tipo .env o .git. Ya estaban ocurriendo antes de montar esto; no encontraron nada.",
    "table", LOKI,
    loki(f'topk(20, sum by (ruta, red) (count_over_time({FLUJO} | ruta =~ `.*(env|git|wp-|php).*` [$__range])))', "", instant=True),
    0, 56, 12, 7, "short"))

# --- los crons ------------------------------------------------------------
PANELES.append(panel(
    "Crons que FALLARON", "Tres estuvieron rotos 24 dias sin que nadie se enterara. Si aqui hay algo, arreglalo hoy.",
    "table", LOKI,
    loki(f'sum by (cron, http) (count_over_time({FLUJO} | cron != `` | ok = `false` [$__range]))', "", instant=True),
    0, 63, 6, 7, "short"))

PANELES.append(panel(
    "Ejecuciones por cron", "Un cron que deja de aparecer es un cron que dejo de correr, y eso no da ningun error.",
    "table", LOKI,
    loki(f'sum by (cron) (count_over_time({FLUJO} | cron != `` [$__range]))', "", instant=True),
    6, 63, 6, 7, "short"))

PANELES.append(panel(
    "Cuanto tardan los crons", "Uno que se alarga de golpe suele ser la base, no el cron.",
    "timeseries", LOKI,
    loki(f'avg by (cron) (avg_over_time({FLUJO} | cron != `` | unwrap ms [5m]))', "{{cron}}"),
    0, 70, 12, 7, "ms"))


def main():
    cuerpo = json.dumps({
        "dashboard": {
            "uid": "clarvex-infra",
            "title": "Clarvex · Servidor, tráfico y crons",
            "description": "Arriba lo que deja a la tienda sin capturar, en medio el dinero y lo que entra por la puerta, y abajo los crons.",
            "tags": ["clarvex", "infra", "crons", "trafico", "costos"],
            "timezone": "America/Monterrey",
            "time": {"from": "now-24h", "to": "now"},
            "refresh": "1m",
            "schemaVersion": 39,
            "panels": PANELES,
        },
        "overwrite": True,
        "message": "Generado por scripts/dashboard-grafana.py",
    }).encode("utf-8")

    peticion = urllib.request.Request(
        f"{leer('GRAFANA_URL')}/api/dashboards/db",
        data=cuerpo, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {leer('GRAFANA_API_TOKEN')}"},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=40) as respuesta:
            datos = json.loads(respuesta.read())
            print(f"HTTP {respuesta.status} · {len(PANELES)} paneles · {leer('GRAFANA_URL')}{datos.get('url','')}")
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode()[:600]}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
