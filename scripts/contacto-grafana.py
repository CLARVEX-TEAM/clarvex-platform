"""
Punto de contacto y ruta de aviso de las alertas de Grafana.

⚠️ Va DIRECTO a Slack, no por n8n. El flujo de n8n es el dueno del webhook del
bot de Telegram --el que lleva las fotos y los PDF de la tienda-- y su switch
reparte por `body.format`. Grafana manda su propio formato, que no lleva ese
campo: caeria en la rama de las fotos e intentaria mandar una alerta como
imagen. Un aviso mal enrutado que ademas ensucia el camino de las evidencias.

⚠️ El webhook de Slack sale del .env del stack; aqui no se escribe.
"""
import io, json, sys, urllib.error, urllib.request

ENV = "/home/ubuntu/stack/.env"


def leer(c):
    for l in io.open(ENV, encoding="utf-8"):
        if l.startswith(c + "="):
            return l.split("=", 1)[1].strip()
    raise SystemExit(f"falta {c}")


BASE, TOKEN = leer("GRAFANA_URL"), leer("GRAFANA_API_TOKEN")


def api(ruta, metodo="GET", cuerpo=None):
    p = urllib.request.Request(
        f"{BASE}{ruta}",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        method=metodo,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}",
                 "X-Disable-Provenance": "true"})
    with urllib.request.urlopen(p, timeout=40) as r:
        b = r.read()
        return json.loads(b) if b else {}


CONTACTO = {
    "name": "clarvex-slack",
    "type": "slack",
    "settings": {
        "url": leer("SLACK_ALERT_WEBHOOK"),
        # ⚠️ Texto PLANO y sin marcado. Es la leccion de Telegram que este
        # proyecto ya escribio: alli n8n forzaba Markdown y un mensaje de error
        # con corchetes rompia el envio del propio aviso, asi que un fallo salia
        # MUDO. Un aviso que no puede fallar por su formato vale mas que uno
        # bonito.
        "title": "{{ .CommonLabels.severidad }} · {{ .CommonAnnotations.summary }}",
        "text": "{{ .CommonAnnotations.description }}\n\n{{ range .Alerts }}{{ .Status }} · {{ .Labels.alertname }}\n{{ end }}",
    },
    "disableResolveMessage": False,
}

RUTA = {
    "receiver": "clarvex-slack",
    "group_by": ["alertname"],
    # Agrupa 30 s y no repite antes de 4 h: sin esto, una alerta que va y viene
    # --el disco rozando el umbral-- manda un mensaje cada evaluacion y el canal
    # se vuelve ruido, que es como se deja de mirar un canal.
    "group_wait": "30s",
    "group_interval": "5m",
    "repeat_interval": "4h",
}

try:
    api("/api/v1/provisioning/contact-points", "POST", CONTACTO)
    print("punto de contacto creado")
except urllib.error.HTTPError as e:
    if e.code == 409:
        print("el punto de contacto ya existe")
    else:
        print(f"HTTP {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        sys.exit(1)

try:
    api("/api/v1/provisioning/policies", "PUT", RUTA)
    print("ruta de aviso: todas las alertas -> clarvex-slack")
except urllib.error.HTTPError as e:
    print(f"ruta HTTP {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
    sys.exit(1)
