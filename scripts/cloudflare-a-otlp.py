"""
Trae las analiticas de Cloudflare y las manda al colector.

    python3 /home/ubuntu/cloudflare-a-otlp.py

Que aporta, que no se ve en los logs del proxy: lo que Cloudflare atiende o
BLOQUEA antes de llegar al servidor. Una peticion filtrada por Cloudflare no
deja rastro en nginx, asi que hoy es un punto ciego.

⚠️ **El token debe ser NUEVO y de SOLO LECTURA de analiticas.** El que ya existe
--`CLOUDFLARE_API_TOKEN`, en el Windows de Adrian-- probablemente puede editar
DNS, y un token capaz de reapuntar `team.clarvex.tech` no tiene por que vivir en
un servidor que mira hacia internet. Con `Analytics: Read` basta para esto, y lo
peor que puede hacer quien lo robe es leer cuantas visitas hubo.

⚠️ **Por HORA, no por minuto.** `httpRequests1mGroups` --el de granularidad de
un minuto-- existe solo en planes de pago, y con el plan gratuito devuelve
`zone does not have access to the path`, que no suena a limite de plan. Los tres
que si permite son el diario, el adaptativo y el de hora; se usa el de hora, que
es el mejor equilibrio y no cuesta nada.
"""

import io
import json
import sys
import time
import urllib.error
import urllib.request

ENV = "/home/ubuntu/stack/.env"
COLECTOR = "http://127.0.0.1:4318/v1/metrics"
GRAPHQL = "https://api.cloudflare.com/client/v4/graphql"


def leer(clave, obligatorio=True):
    with io.open(ENV, encoding="utf-8") as archivo:
        for linea in archivo:
            if linea.startswith(clave + "="):
                return linea.split("=", 1)[1].strip()
    if obligatorio:
        raise SystemExit(f"falta {clave} en el .env")
    return None


def consultar(token, consulta, variables):
    peticion = urllib.request.Request(
        GRAPHQL,
        data=json.dumps({"query": consulta, "variables": variables}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(peticion, timeout=40) as respuesta:
        datos = json.loads(respuesta.read())
    # ⚠️ GraphQL contesta 200 CON los errores dentro. Mirar solo el codigo HTTP
    # daria por buena una consulta que no devolvio nada, y el panel saldria
    # vacio sin que nada lo explique. Es la misma trampa que Slack.
    if datos.get("errors"):
        raise SystemExit(f"Cloudflare respondio con errores: {json.dumps(datos['errors'])[:400]}")
    return datos["data"]


ZONAS = """
query { viewer { zones: accounts { __typename } } }
"""

TRAFICO = """
query($zona: String!, $desde: Time!) {
  viewer {
    zones(filter: {zoneTag: $zona}) {
      httpRequests1hGroups(
        limit: 48
        filter: {datetime_geq: $desde}
        orderBy: [datetime_DESC]
      ) {
        dimensions { datetime }
        sum { requests cachedRequests bytes threats }
      }
    }
  }
}
"""


def punto(valor, atributos, cuando=None):
    return {
        "asDouble": float(valor),
        "timeUnixNano": str(int(cuando or time.time()) * 10**9),
        "attributes": [{"key": k, "value": {"stringValue": str(v)}} for k, v in atributos.items()],
    }


def main():
    token = leer("CLOUDFLARE_ANALYTICS_TOKEN")
    zonas = leer("CLOUDFLARE_ZONAS")  # "clarvex.tech=abc123,adrianluna.mx=def456"

    peticiones, cacheadas, bytes_, amenazas = [], [], [], []
    # 48 horas hacia atras: el dato se consolida con retraso, asi que reenviar
    # la ventana corrige lo que ya se mando.
    desde = time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(time.time() - 48 * 3600))

    ahora = int(time.time())
    for par in zonas.split(","):
        nombre, _, etiqueta = par.partition("=")
        nombre, etiqueta = nombre.strip(), etiqueta.strip()
        if not etiqueta:
            continue
        datos = consultar(token, TRAFICO, {"zona": etiqueta, "desde": desde})
        grupos = datos["viewer"]["zones"][0]["httpRequests1hGroups"] if datos["viewer"]["zones"] else []
        if not grupos:
            continue
        """
        ⚠️ Solo la hora MAS RECIENTE, y sellada AHORA.

        Mandar las 48 horas con su fecha original hace que Prometheus rechace
        el lote ENTERO --`InvalidArgument`, muestra demasiado vieja-- y no se
        guarda ni el dato de hoy. Es el mismo error que ya costo una vuelta con
        el gasto de AWS: una metrica es una foto de lo que se sabe AHORA, y el
        periodo al que corresponde viaja como atributo.
        """
        g = max(grupos, key=lambda x: x["dimensions"]["datetime"])
        hora = g["dimensions"]["datetime"]
        s_ = g["sum"]
        peticiones.append(punto(s_["requests"], {"zona": nombre, "hora": hora}, ahora))
        cacheadas.append(punto(s_["cachedRequests"], {"zona": nombre, "hora": hora}, ahora))
        bytes_.append(punto(s_["bytes"], {"zona": nombre, "hora": hora}, ahora))
        amenazas.append(punto(s_["threats"], {"zona": nombre, "hora": hora}, ahora))

    if not peticiones:
        print("sin datos de Cloudflare en la ventana")
        return 0

    cuerpo = {"resourceMetrics": [{
        "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "cloudflare"}}]},
        "scopeMetrics": [{"metrics": [
            {"name": "cf.peticiones", "unit": "{peticion}", "gauge": {"dataPoints": peticiones}},
            {"name": "cf.cacheadas", "unit": "{peticion}", "gauge": {"dataPoints": cacheadas}},
            {"name": "cf.bytes", "unit": "By", "gauge": {"dataPoints": bytes_}},
            # Lo que Cloudflare FILTRA antes de llegar al servidor: el punto
            # ciego que los logs de nginx no pueden ver.
            {"name": "cf.amenazas", "unit": "{amenaza}", "gauge": {"dataPoints": amenazas}},
        ]}],
    }]}

    peticion = urllib.request.Request(
        COLECTOR, data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        print(json.dumps({
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "cron": "cloudflare",
            "zonas": len(peticiones),
            "http": respuesta.status,
            "ok": True,
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode()[:300]}", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(f"fallo: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
