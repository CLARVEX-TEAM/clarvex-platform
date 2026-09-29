"""
Crea el dashboard de Clarvex en SigNoz, en el esquema v6 y por su API.

    python3 /home/ubuntu/dashboard-signoz-v6.py <id-del-dashboard>

⚠️ **El formato de importar JSON que documenta medio internet es el VIEJO.**
SigNoz v0.142 guarda los dashboards en `schemaVersion: v6` y su `/api/v1/
dashboards` responde 501 `dashboard_deprecated`. Un JSON del formato antiguo se
importa sin quejarse y se convierte mal: los paneles aparecen con su titulo y
sus consultas salen rotas. En el nuestro quedo esta expresion, que es invalida
y explica los doce paneles vacios con aviso:

    ruta CONTAINS 'env' ruta EXISTS AND red EXISTS
                       ^ falta el AND

⚠️ **Y los nombres de metrica llevan PUNTOS, no guiones bajos.** La costumbre de
`system_memory_usage` viene de Prometheus; aqui la lista real que devuelve
`/api/v2/metrics` dice `system.memory.usage`. Con el nombre cambiado la consulta
es valida, no da error, y el panel sale vacio para siempre.
"""

import io
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = "https://kind-stinkbug.us2.signoz.cloud"
ENV = "/home/ubuntu/stack/.env"


def clave():
    with io.open(ENV, encoding="utf-8") as archivo:
        for linea in archivo:
            if linea.startswith("SIGNOZ_API_KEY="):
                return linea.split("=", 1)[1].strip()
    raise SystemExit("falta SIGNOZ_API_KEY en el .env")


def campo(nombre, tipo="string"):
    return {"name": nombre, "signal": "", "fieldContext": "attribute", "fieldDataType": tipo}


def consulta(signal, agregaciones, filtro="", group=None, leyenda="", limite=None, orden=None, kind="time_series"):
    return {
        "kind": kind,
        "spec": {
            "name": "A",
            "plugin": {
                "kind": "signoz/BuilderQuery",
                "spec": {
                    "name": "A",
                    "stepInterval": 60,
                    "signal": signal,
                    "source": "",
                    "aggregations": agregaciones,
                    "disabled": False,
                    "filter": {"expression": filtro},
                    "groupBy": group or [],
                    "order": orden or [],
                    "limit": limite,
                    "having": {"expression": ""},
                    "functions": [],
                    "legend": leyenda,
                },
            },
        },
    }


def metrica(nombre, tiempo="avg", espacio="sum"):
    return [{
        "metricName": nombre,
        "temporality": "",
        "timeAggregation": tiempo,
        "spaceAggregation": espacio,
        "reduceTo": "last",
    }]


def serie(titulo, desc, consulta_spec, unidad="none"):
    return {
        "kind": "Panel",
        "spec": {
            "display": {"name": titulo, "description": desc},
            "plugin": {
                "kind": "signoz/TimeSeriesPanel",
                "spec": {
                    "visualization": {"timePreference": "global_time", "fillSpans": False},
                    "formatting": {"unit": unidad, "decimalPrecision": "2"},
                    "chartAppearance": {
                        "lineInterpolation": "spline",
                        "showPoints": False,
                        "lineStyle": "solid",
                        "fillMode": "none",
                        "spanGaps": {"fillOnlyBelow": False, "fillLessThan": ""},
                    },
                    "axes": {"softMin": None, "softMax": None, "isLogScale": False},
                    "legend": {"position": "bottom", "mode": "list", "customColors": None},
                    "thresholds": None,
                },
            },
            "queries": [consulta_spec],
            "links": [],
        },
    }


def tabla(titulo, desc, consulta_spec):
    return {
        "kind": "Panel",
        "spec": {
            "display": {"name": titulo, "description": desc},
            "plugin": {
                "kind": "signoz/TablePanel",
                "spec": {
                    "visualization": {"timePreference": "global_time"},
                    "formatting": {"columnUnits": None, "decimalPrecision": "0"},
                    "thresholds": None,
                },
            },
            "queries": [consulta_spec],
            "links": [],
        },
    }


def numero(titulo, desc, consulta_spec):
    return {
        "kind": "Panel",
        "spec": {
            "display": {"name": titulo, "description": desc},
            "plugin": {
                "kind": "signoz/NumberPanel",
                "spec": {
                    "visualization": {"timePreference": "global_time"},
                    "formatting": {"unit": "none", "decimalPrecision": "0"},
                    "thresholds": None,
                },
            },
            "queries": [consulta_spec],
            "links": [],
        },
    }


ORDEN_DESC = [{"key": {"name": "count()", "signal": "", "fieldContext": "", "fieldDataType": ""}, "direction": "desc"}]

# ⚠️ `estado` lo pone el receptor del proxy y no existe en ningun otro log, asi
# que «tiene estado» es exactamente «es una peticion que entro por la puerta».
PROXY = "estado EXISTS"
CRONS = "cron EXISTS"

PANELES = [
    # --- lo que PARA la tienda -------------------------------------------
    (serie("Disco usado",
           "Con el disco lleno Postgres deja de escribir y la tienda no puede capturar. Es el fallo mas caro de esta maquina.",
           consulta("metrics", metrica("system.filesystem.usage"),
                    group=[campo("state"), campo("mountpoint")], leyenda="{{mountpoint}} · {{state}}"),
           "bytes"), (0, 0, 6, 4)),
    (serie("Memoria",
           "3.7 GB en total. Cuando lo disponible baja, el build de Next se va a swap y tarda minutos de mas.",
           consulta("metrics", metrica("system.memory.usage"), group=[campo("state")], leyenda="{{state}}"),
           "bytes"), (6, 0, 6, 4)),
    (serie("CPU",
           "Por estado. Un `iowait` alto suele ser el disco, no la CPU.",
           consulta("metrics", metrica("system.cpu.utilization"), group=[campo("state")], leyenda="{{state}}"),
           "percentunit"), (0, 4, 6, 4)),
    (serie("Swap en uso",
           "Ya hay swap tocado en reposo. Si sube mucho, algo se esta comiendo la RAM.",
           consulta("metrics", metrica("system.paging.usage"), group=[campo("state")], leyenda="{{state}}"),
           "bytes"), (6, 4, 6, 4)),
    (serie("Carga del sistema",
           "Media de 1 minuto. Por encima del numero de nucleos, hay cola.",
           consulta("metrics", metrica("system.cpu.load_average.1m", "avg", "avg"), leyenda="carga"),
           "none"), (0, 8, 6, 4)),
    (serie("Red",
           "Lo que entra y sale por la interfaz.",
           consulta("metrics", metrica("system.network.io"), group=[campo("direction")], leyenda="{{direction}}"),
           "bytes"), (6, 8, 6, 4)),

    # --- el dinero --------------------------------------------------------
    # ⚠️ TABLA y no serie de tiempo. El gasto es UN dato por dia y por servicio:
    # dibujado como linea son cuatro puntos sueltos que no cuentan nada, y en una
    # ventana de horas no cae ninguno. En tabla se lee de un vistazo cuanto y en
    # que, que es la pregunta real.
    (tabla("Gasto de AWS por servicio y dia",
           "Bruto antes de creditos, igual que el presupuesto. Se consulta UNA vez al dia: cada llamada a Cost Explorer cuesta $0.01, o sea ~$7/mes por hora frente a ~$0.30 asi.",
           consulta("metrics", metrica("aws.costo.diario", "avg", "sum"),
                    group=[campo("servicio"), campo("dia")], kind="scalar")), (0, 12, 8, 4)),
    (numero("Gasto total",
            "Suma de todos los servicios en la ventana elegida. El presupuesto de AWS esta en $45/mes con un ritmo real de ~$31.",
            consulta("metrics", metrica("aws.costo.diario", "avg", "sum"), kind="scalar")), (8, 12, 4, 4)),

    # --- el trafico -------------------------------------------------------
    (serie("Peticiones", "Todo lo que entra por el proxy a team.clarvex.tech.",
           consulta("logs", [{"expression": "count()"}], PROXY, leyenda="peticiones")), (0, 16, 8, 4)),
    (numero("Errores 5xx", "Fallos del servidor. Cualquier cosa por encima de cero merece una mirada.",
            consulta("logs", [{"expression": "count()"}],
                     "estado IN ('500','502','503','504')", kind="scalar")), (8, 16, 4, 4)),
    (serie("Por codigo de estado", "Un pico de 4xx suele ser un escaner; uno de 5xx somos nosotros.",
           consulta("logs", [{"expression": "count()"}], PROXY, group=[campo("estado")], leyenda="{{estado}}")),
     (0, 20, 6, 4)),
    (tabla("Rutas mas pedidas", "La query va recortada a proposito: esta app pone tokens en la URL.",
           consulta("logs", [{"expression": "count()"}], PROXY, group=[campo("ruta")],
                    limite=15, orden=ORDEN_DESC, kind="scalar")), (6, 20, 6, 4)),
    (tabla("Sondeos buscando secretos",
           "Peticiones a rutas tipo .env o .git. Ya estaban ocurriendo antes de montar esto; no encontraron nada.",
           consulta("logs", [{"expression": "count()"}],
                    "ruta EXISTS AND (ruta CONTAINS 'env' OR ruta CONTAINS 'git')",
                    group=[campo("ruta"), campo("red")], limite=20, orden=ORDEN_DESC, kind="scalar")),
     (0, 24, 12, 4)),

    # --- los crons --------------------------------------------------------
    (tabla("Crons que FALLARON",
           "Tres estuvieron rotos 24 dias sin que nadie se enterara. Si aqui hay algo, arreglalo hoy.",
           consulta("logs", [{"expression": "count()"}], "cron EXISTS AND ok = false",
                    group=[campo("cron"), campo("http")], limite=20, orden=ORDEN_DESC, kind="scalar")),
     (0, 28, 6, 4)),
    (tabla("Ejecuciones por cron",
           "Un cron que deja de aparecer es un cron que dejo de correr, y eso no da ningun error.",
           consulta("logs", [{"expression": "count()"}], CRONS, group=[campo("cron")],
                    limite=30, orden=ORDEN_DESC, kind="scalar")), (6, 28, 6, 4)),
    (serie("Cuanto tardan los crons", "Uno que se alarga de golpe suele ser la base, no el cron.",
           consulta("logs", [{"expression": "avg(ms)"}], CRONS, group=[campo("cron")], leyenda="{{cron}}"),
           "ms"), (0, 32, 12, 4)),
]


def construir():
    paneles, items = {}, []
    for panel, (x, y, w, h) in PANELES:
        pid = str(uuid.uuid4())
        paneles[pid] = panel
        items.append({"x": x, "y": y, "width": w, "height": h,
                      "content": {"$ref": f"#/spec/panels/{pid}"}})
    return {
        "display": {
            "name": "Clarvex · Servidor, tráfico y crons",
            "description": (
                "Lo que de verdad para la tienda, en un sitio. El orden no es estético: "
                "arriba lo que la deja sin capturar, en medio el dinero y lo que entra "
                "por la puerta, y abajo los crons — que llevan tres fallos históricos de "
                "semanas en silencio."
            ),
        },
        "variables": [],
        "panels": paneles,
        "layouts": [{"kind": "Grid", "spec": {"items": items}}],
        "duration": "",
        "refreshInterval": "",
        "links": [],
    }


def nombre_actual(ident):
    peticion = urllib.request.Request(
        f"{BASE}/api/v2/dashboards/{ident}",
        headers={"SIGNOZ-API-KEY": clave()},
    )
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return json.loads(respuesta.read())["data"]["name"]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: dashboard-signoz-v6.py <id-del-dashboard>")
    destino = f"{BASE}/api/v2/dashboards/{sys.argv[1]}"
    cuerpo = json.dumps({
        # ⚠️ Obligatorio y explicito: sin el, la API responde 400 diciendo
        # `schemaVersion must be "v6", got ""`. No se hereda del dashboard que
        # ya existe.
        "schemaVersion": "v6",
        # ⚠️ El `name` es INMUTABLE y no es el titulo: es el identificador corto
        # que SigNoz genero al crearlo. Mandar otro da 400 `dashboard_immutable`,
        # asi que se LEE del propio dashboard en vez de inventarlo.
        "name": nombre_actual(sys.argv[1]),
        "tags": [{"key": "tag", "value": t} for t in ("clarvex", "infra", "crons", "trafico", "costos")],
        "spec": construir(),
    }).encode("utf-8")
    peticion = urllib.request.Request(destino, data=cuerpo, method="PUT", headers={
        "Content-Type": "application/json",
        "SIGNOZ-API-KEY": clave(),
    })
    try:
        with urllib.request.urlopen(peticion, timeout=40) as respuesta:
            print(f"HTTP {respuesta.status} · {len(PANELES)} paneles publicados")
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode()[:600]}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
