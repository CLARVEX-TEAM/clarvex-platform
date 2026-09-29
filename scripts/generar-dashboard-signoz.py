"""
Genera el dashboard de Clarvex para SigNoz.

Se genera con un guion y no a mano porque cada panel de SigNoz son ~40 lineas
de JSON casi identico: escritos a mano, la doceava copia acaba con un campo
distinto que nadie nota hasta que ese panel sale vacio.

    python scripts/generar-dashboard-signoz.py > scripts/signoz-dashboard-clarvex.json

Y se importa en SigNoz: Dashboards -> New Dashboard -> Import JSON.
"""

import json
import uuid

# ⚠️ Los puntos del nombre OTel se vuelven guiones bajos en SigNoz:
# `system.cpu.utilization` se consulta como `system_cpu_utilization`.
UNIDADES = {"percentunit": "percentunit", "bytes": "bytes", "ms": "ms", "none": "none", "reqps": "none"}


def consulta_metrica(clave, op="avg", group=None, filtros=None, leyenda=""):
    return {
        "dataSource": "metrics",
        "queryName": "A",
        "aggregateOperator": op,
        "aggregateAttribute": {"key": clave, "dataType": "float64", "type": "Gauge", "isColumn": True},
        "timeAggregation": op,
        "spaceAggregation": "sum" if group else op,
        "functions": [],
        "filters": {"items": filtros or [], "op": "AND"},
        "expression": "A",
        "disabled": False,
        "stepInterval": 60,
        "having": [],
        "limit": None,
        "orderBy": [],
        "groupBy": group or [],
        "legend": leyenda,
        "reduceTo": "last",
    }


def consulta_log(op="count", clave=None, group=None, filtros=None, leyenda="", limite=None, orden=None):
    agregado = {"key": "", "dataType": "", "type": "", "isColumn": True}
    if clave:
        agregado = {"key": clave, "dataType": "float64", "type": "tag", "isColumn": False}
    return {
        "dataSource": "logs",
        "queryName": "A",
        "aggregateOperator": op,
        "aggregateAttribute": agregado,
        "timeAggregation": op,
        "spaceAggregation": "sum",
        "functions": [],
        "filters": {"items": filtros or [], "op": "AND"},
        "expression": "A",
        "disabled": False,
        "stepInterval": 60,
        "having": [],
        "limit": limite,
        "orderBy": orden or [],
        "groupBy": group or [],
        "legend": leyenda,
        "reduceTo": "sum",
    }


def atributo(nombre, tipo="string"):
    return {"key": nombre, "dataType": tipo, "type": "tag", "isColumn": False}


def filtro(nombre, op, valor, tipo="string"):
    return {"id": str(uuid.uuid4())[:8], "key": atributo(nombre, tipo), "op": op, "value": valor}


def panel(titulo, descripcion, tipo, consulta, unidad="none", umbrales=None, columnas=None):
    return {
        "id": str(uuid.uuid4()),
        "title": titulo,
        "description": descripcion,
        "isStacked": False,
        "nullZeroValues": "zero",
        "opacity": "1",
        "panelTypes": tipo,
        "query": {
            "queryType": "builder",
            "promql": [{"name": "A", "query": "", "legend": "", "disabled": False}],
            "clickhouse_sql": [{"name": "A", "legend": "", "disabled": False, "query": ""}],
            "id": str(uuid.uuid4()),
            "builder": {"queryData": [consulta], "queryFormulas": []},
        },
        "timePreferance": "GLOBAL_TIME",
        "softMax": None,
        "softMin": None,
        "selectedLogFields": columnas or [],
        "selectedTracesFields": [],
        "yAxisUnit": unidad,
        "thresholds": umbrales or [],
        "fillSpans": False,
    }


def umbral(nombre, valor, color, unidad="none"):
    return {
        "index": str(uuid.uuid4())[:8],
        "keyIndex": 0,
        "moveThreshold": 0,
        "selectedGraph": "value",
        "thresholdColor": color,
        "thresholdFormat": "Text",
        "thresholdOperator": ">=",
        "thresholdUnit": unidad,
        "thresholdValue": valor,
        "thresholdLabel": nombre,
    }


PANELES = []

# ---------------------------------------------------------------- LA TIENDA --
# Lo primero es lo que PARA la tienda. El disco lleno hace que Postgres deje de
# escribir, y entonces nadie puede capturar: es el fallo mas caro del servidor y
# por eso abre el panel.
PANELES.append((
    panel(
        "Disco usado",
        "Con el disco lleno Postgres deja de escribir y la tienda no puede capturar. Es el fallo mas caro de esta maquina.",
        "graph",
        consulta_metrica(
            "system_filesystem_usage",
            "avg",
            group=[atributo("state")],
            filtros=[filtro("mountpoint", "=", "/hostfs")],
            leyenda="{{state}}",
        ),
        "bytes",
    ),
    {"x": 0, "y": 0, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "Memoria",
        "3.7 GB en total. Cuando lo disponible baja, el build de Next se va a swap y tarda minutos de mas.",
        "graph",
        consulta_metrica("system_memory_usage", "avg", group=[atributo("state")], leyenda="{{state}}"),
        "bytes",
    ),
    {"x": 6, "y": 0, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "CPU",
        "Por estado. Un `iowait` alto suele ser el disco, no la CPU.",
        "graph",
        consulta_metrica("system_cpu_utilization", "avg", group=[atributo("state")], leyenda="{{state}}"),
        "percentunit",
    ),
    {"x": 0, "y": 4, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "Swap en uso",
        "Ya hay swap tocado en reposo. Si sube mucho, algo se esta comiendo la RAM.",
        "graph",
        consulta_metrica("system_paging_usage", "avg", group=[atributo("state")], leyenda="{{state}}"),
        "bytes",
    ),
    {"x": 6, "y": 4, "w": 6, "h": 4},
))

# ----------------------------------------------------------------- TRAFICO --
PROXY = [filtro("log_file_name", "contains", "_access.log")]

PANELES.append((
    panel(
        "Peticiones",
        "Todo lo que entra por el proxy a team.clarvex.tech.",
        "graph",
        consulta_log("count", filtros=PROXY, leyenda="peticiones"),
        "none",
    ),
    {"x": 0, "y": 8, "w": 8, "h": 4},
))

PANELES.append((
    panel(
        "Errores 5xx",
        "Fallos del servidor. Cualquier cosa por encima de cero merece una mirada.",
        "value",
        consulta_log("count", filtros=PROXY + [filtro("estado", ">=", "500")]),
        "none",
        umbrales=[umbral("revisar", 1, "#F59E0B"), umbral("grave", 20, "#EF4444")],
    ),
    {"x": 8, "y": 8, "w": 4, "h": 4},
))

PANELES.append((
    panel(
        "Por codigo de estado",
        "Un pico de 4xx suele ser un escaner; uno de 5xx somos nosotros.",
        "graph",
        consulta_log("count", group=[atributo("estado")], filtros=PROXY, leyenda="{{estado}}"),
        "none",
    ),
    {"x": 0, "y": 12, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "Rutas mas pedidas",
        "La query va recortada a proposito: esta app pone tokens en la URL.",
        "table",
        consulta_log(
            "count",
            group=[atributo("ruta")],
            filtros=PROXY,
            limite=15,
            orden=[{"columnName": "#SIGNOZ_VALUE", "order": "desc"}],
        ),
        "none",
    ),
    {"x": 6, "y": 12, "w": 6, "h": 4},
))

# ⚠️ Esto no es paranoia: el 29 de septiembre de 2026 los logs ya tenian
# sondeos buscando `/var/www/.env`, `/.git/config` y `/.git-credentials`.
PANELES.append((
    panel(
        "Sondeos buscando secretos",
        "Peticiones a rutas tipo .env o .git. Ya estaban ocurriendo antes de montar esto; no encontraron nada.",
        "table",
        consulta_log(
            "count",
            group=[atributo("ruta"), atributo("red")],
            filtros=PROXY + [filtro("ruta", "contains", "env")],
            limite=20,
            orden=[{"columnName": "#SIGNOZ_VALUE", "order": "desc"}],
        ),
        "none",
    ),
    {"x": 0, "y": 16, "w": 12, "h": 4},
))

# ------------------------------------------------------------------ CRONS --
# ⚠️ La razon por la que existe todo esto: tres crons fallaron 24 dias
# escribiendo el error correcto en archivos que nadie abria.
CRONS = [filtro("cron", "exists", "")]

PANELES.append((
    panel(
        "Crons que FALLARON",
        "Tres estuvieron rotos 24 dias sin que nadie se enterara. Si aqui hay algo, arreglalo hoy.",
        "table",
        consulta_log(
            "count",
            group=[atributo("cron"), atributo("http")],
            filtros=[filtro("ok", "=", "false", "bool")],
            limite=20,
            orden=[{"columnName": "#SIGNOZ_VALUE", "order": "desc"}],
        ),
        "none",
    ),
    {"x": 0, "y": 20, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "Ejecuciones por cron",
        "Un cron que deja de aparecer es un cron que dejo de correr, y eso no da ningun error.",
        "table",
        consulta_log(
            "count",
            group=[atributo("cron")],
            filtros=CRONS,
            limite=30,
            orden=[{"columnName": "#SIGNOZ_VALUE", "order": "desc"}],
        ),
        "none",
    ),
    {"x": 6, "y": 20, "w": 6, "h": 4},
))

PANELES.append((
    panel(
        "Cuanto tardan los crons",
        "Uno que se alarga de golpe suele ser la base, no el cron.",
        "graph",
        consulta_log("avg", clave="ms", group=[atributo("cron")], filtros=CRONS, leyenda="{{cron}}"),
        "ms",
    ),
    {"x": 0, "y": 24, "w": 12, "h": 4},
))

dashboard = {
    "title": "Clarvex · Servidor, tráfico y crons",
    "description": (
        "Lo que de verdad para la tienda, en un sitio. El orden no es estético: "
        "arriba lo que la deja sin capturar (disco, memoria), en medio lo que "
        "entra por la puerta, y abajo los crons — que llevan tres fallos "
        "históricos de semanas en silencio."
    ),
    "tags": ["clarvex", "infra", "crons", "trafico"],
    "layout": [],
    "widgets": [],
    "variables": {},
    "version": "v4",
}

for widget, pos in PANELES:
    dashboard["widgets"].append(widget)
    dashboard["layout"].append({"i": widget["id"], **pos, "moved": False, "static": False})

# ⚠️ Lo escribe el propio guion, NO por redireccion de la consola. En Windows
# el `>` usa la pagina de codigos del sistema y se carga los acentos: el JSON
# sale con bytes invalidos y SigNoz lo rechaza al importarlo sin decir por que.
import io
import os

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "signoz-dashboard-clarvex.json")
with io.open(destino, "w", encoding="utf-8", newline="\n") as salida:
    json.dump(dashboard, salida, indent=2, ensure_ascii=False)
    salida.write("\n")
print("escrito:", destino, "|", len(dashboard["widgets"]), "paneles")
