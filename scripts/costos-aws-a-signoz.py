"""
Empuja el gasto de AWS a SigNoz, como metrica.

SigNoz no lee Cost Explorer por su cuenta: no hay integracion. Esto consulta el
gasto por servicio y lo manda al colector local, que ya sabe llegar a SigNoz.

    python3 /home/ubuntu/costos-aws-a-signoz.py

⚠️ **UNA VEZ AL DIA, y esto es dinero.** Cada llamada a Cost Explorer cuesta
$0.01. Una por hora son ~$7 al mes --mas que el propio ahorro de vigilarlo-- y
una al dia son ~$0.30. El dato de costo se actualiza varias veces al dia pero
con retraso de horas: pedirlo mas seguido no lo hace mas fresco, solo mas caro.

⚠️ **El gasto va BRUTO, antes de creditos.** Es la misma decision que ya tomo la
alerta de presupuesto `clarvex-mensual`: con los creditos de Activate aplicados,
el consumo real queda escondido detras de un cero y el dia que se agoten --el 31
de agosto de 2028-- la factura aparece de golpe sin que nadie hubiera visto
venir el ritmo.

⚠️ **Necesita `ce:GetCostAndUsage` en el rol `clarvex-instancia`**, que hoy solo
puede invocar Bedrock. La politica esta en scripts/iam-costos-signoz.json.
"""

import datetime
import json
import sys
import time
import urllib.request

import boto3

COLECTOR = "http://127.0.0.1:4318/v1/metrics"

# Los ultimos dias, no solo hoy: el costo de un dia se sigue ajustando durante
# horas, asi que reenviar la ventana corrige lo que ya se habia mandado.
DIAS = 3


def gasto_por_servicio():
    ce = boto3.client("ce", region_name="us-east-1")
    hoy = datetime.date.today()
    respuesta = ce.get_cost_and_usage(
        TimePeriod={
            "Start": (hoy - datetime.timedelta(days=DIAS)).isoformat(),
            # Cost Explorer excluye el final, asi que manana incluye hoy.
            "End": (hoy + datetime.timedelta(days=1)).isoformat(),
        },
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
    )
    filas = []
    for periodo in respuesta["ResultsByTime"]:
        # El inicio del dia, en nanosegundos: es la marca que lleva la metrica.
        cuando = int(time.mktime(datetime.date.fromisoformat(periodo["TimePeriod"]["Start"]).timetuple())) * 10**9
        for grupo in periodo["Groups"]:
            importe = float(grupo["Metrics"]["UnblendedCost"]["Amount"])
            # Los servicios en cero son casi todos: mandarlos multiplicaria por
            # diez los puntos sin decir nada.
            if importe > 0:
                filas.append((grupo["Keys"][0], importe, cuando))
    return filas


def mandar(filas):
    if not filas:
        print("sin gasto que mandar")
        return
    puntos = [
        {
            "asDouble": importe,
            "timeUnixNano": str(cuando),
            "attributes": [{"key": "servicio", "value": {"stringValue": servicio}}],
        }
        for servicio, importe, cuando in filas
    ]
    cuerpo = {
        "resourceMetrics": [{
            "resource": {"attributes": [
                {"key": "service.name", "value": {"stringValue": "aws-costos"}}
            ]},
            "scopeMetrics": [{"metrics": [{
                "name": "aws.costo.diario",
                "unit": "USD",
                "description": "Gasto diario por servicio, bruto antes de creditos",
                # Gauge y no Sum: es una FOTO del gasto de ese dia, y el dia se
                # reenvia corregido. Como contador, cada reenvio se sumaria al
                # anterior y el total crecerian solo por haberlo consultado.
                "gauge": {"dataPoints": puntos},
            }]}],
        }]
    }
    peticion = urllib.request.Request(
        COLECTOR,
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        print(f"mandados {len(puntos)} puntos de {len(set(f[0] for f in filas))} servicios -> HTTP {respuesta.status}")


if __name__ == "__main__":
    try:
        mandar(gasto_por_servicio())
    except Exception as error:
        # ⚠️ Sale en 1 para que el cron lo registre como fallo. Un empujador de
        # costos que muere callado deja el panel congelado en el ultimo dato
        # bueno, que es peor que un panel vacio: parece que no se gasta nada.
        print(f"fallo: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
