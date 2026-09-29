"""
Vigila el DNS y el certificado de los dominios de Clarvex.

    python3 /home/ubuntu/dns-y-tls-a-otlp.py

⚠️ **Son los dos fallos que dejan la tienda inalcanzable SIN un solo error en el
servidor.** La app responde perfecta, PM2 dice `online`, la salud da 200 desde
dentro... y nadie puede entrar. Este proyecto ya comprobo a mano que ningun DNS
apuntara a Vultr antes de apagarlo, justo porque un registro equivocado no se
nota desde la maquina.

⚠️ **NO se comprueba contra una IP fija.** Los dominios pasan por Cloudflare, asi
que resuelven a SUS direcciones --se ve en los logs del proxy: `104.22.105.x`,
`172.70.174.x`-- y no a la de EC2. Comparar con `44.200.176.214` daria alarma
todos los dias. Lo que se registra es A QUE resuelve, como atributo: lo que
importa es que resuelva y que no CAMBIE, no que coincida con un valor escrito
aqui hace meses.
"""

import json
import socket
import ssl
import sys
import time
import urllib.request

COLECTOR = "http://127.0.0.1:4318/v1/metrics"

# Los que dejan a alguien fuera si fallan.
DOMINIOS = [
    ("team.clarvex.tech", True),    # la app; si esto cae, la tienda no trabaja
    ("clarvex.tech", True),         # el sitio publico
    ("app.adrianluna.mx", True),    # la pantalla de mudanza
    ("n8n.adrianluna.mx", True),    # el webhook de las fotos a Telegram
]


def resolver(dominio):
    inicio = time.time()
    try:
        ip = socket.gethostbyname(dominio)
        return 1, int((time.time() - inicio) * 1000), ip
    except OSError:
        return 0, int((time.time() - inicio) * 1000), "sin-respuesta"


def dias_de_certificado(dominio):
    """Dias que le quedan al certificado. `None` si no se pudo mirar."""
    try:
        contexto = ssl.create_default_context()
        with socket.create_connection((dominio, 443), timeout=10) as bruto:
            with contexto.wrap_socket(bruto, server_hostname=dominio) as tls:
                vence = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
        return int((vence - time.time()) / 86400)
    except Exception:
        # ⚠️ `None` y no 0: «no pude mirar» y «vence hoy» son cosas opuestas y
        # un cero dispararia una alarma falsa cada vez que parpadee la red.
        return None


def punto(valor, atributos):
    return {
        "asDouble": float(valor),
        "timeUnixNano": str(int(time.time()) * 10**9),
        "attributes": [{"key": k, "value": {"stringValue": v}} for k, v in atributos.items()],
    }


def main():
    resuelve, tiempos, dias = [], [], []

    for dominio, _ in DOMINIOS:
        ok, ms, ip = resolver(dominio)
        resuelve.append(punto(ok, {"dominio": dominio, "ip": ip}))
        tiempos.append(punto(ms, {"dominio": dominio}))
        if ok:
            restantes = dias_de_certificado(dominio)
            if restantes is not None:
                dias.append(punto(restantes, {"dominio": dominio}))

    cuerpo = {"resourceMetrics": [{
        "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "dns-y-tls"}}]},
        "scopeMetrics": [{"metrics": [
            {"name": "dns.resuelve", "unit": "1",
             "description": "1 si el dominio resuelve, 0 si no", "gauge": {"dataPoints": resuelve}},
            {"name": "dns.tiempo", "unit": "ms",
             "description": "Lo que tarda en resolver", "gauge": {"dataPoints": tiempos}},
            {"name": "tls.dias", "unit": "d",
             "description": "Dias que le quedan al certificado", "gauge": {"dataPoints": dias}},
        ]}],
    }]}

    peticion = urllib.request.Request(
        COLECTOR, data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        caidos = [p["attributes"][0]["value"]["stringValue"] for p in resuelve if p["asDouble"] == 0]
        print(f"{len(DOMINIOS)} dominios · {len(dias)} certificados · HTTP {respuesta.status}"
              + (f" · SIN RESOLVER: {', '.join(caidos)}" if caidos else ""))
        # Sale en 1 si alguno no resuelve, para que el cron lo registre como fallo.
        return 1 if caidos else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"fallo: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
