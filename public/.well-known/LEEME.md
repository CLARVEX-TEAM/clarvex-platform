# `assetlinks.json` — qué es y por qué importa

Este archivo dice **qué app de Android puede actuar en nombre de
`team.clarvex.tech`**. Android lo descarga y lo cree.

## Las dos relaciones no son lo mismo

| Relación | Para qué |
|---|---|
| `handle_all_urls` | abrir enlaces del dominio dentro de la app en vez del navegador |
| `get_login_creds` | **la huella**: dejar que la app use las credenciales del dominio |

⚠️ **La segunda es la que hace falta para WebAuthn, y faltaba.** El archivo venía
de un intento de TWA de julio de 2026 y solo traía `handle_all_urls`. Con el
contenedor de Capacitor en modo `WEB_AUTHENTICATION_SUPPORT_FOR_APP`, la
petición de huella se enruta por el Credential Manager de Android, que exige la
asociación antes de dejar a la app tocar credenciales del dominio. Sin ella, el
acceso por huella fallaba con **«An unknown error occurred while talking to the
credential manager»** — un mensaje que no menciona nada de esto.

## La huella tiene que ser la de la llave que firma HOY

⚠️ La que había (`D5:43:D8:…`) era de aquel TWA abandonado, y esa llave ya no
existe. Dejarla puesta **autoriza a quien la tenga** a presentarse como la app de
Clarvex ante este dominio. Se retiró.

La de ahora corresponde al almacén de firma estable
(`CN=Clarvex Team`, válido hasta 2054), que vive en los secretos de Actions y en
Vaultwarden — nunca en el repositorio.

⚠️ **Si la llave de firma cambia, este archivo hay que cambiarlo el mismo día.**
La huella no está en ningún sitio donde una prueba pueda comprobarla: son dos
repositorios distintos y un archivo estático. El síntoma sería el mismo error del
Credential Manager, que no señala aquí.

⚠️ **Y al publicar en la Play Store va a cambiar.** Con Play App Signing, Google
vuelve a firmar la app con SU llave; la nuestra pasa a ser solo la de subida.
Ese día hay que poner aquí la huella que muestra Play Console, o la huella dejará
de funcionar para quien instale desde la tienda.

## Cómo comprobar que está bien puesto

```bash
curl -s https://team.clarvex.tech/.well-known/assetlinks.json
unzip -p app-debug.apk META-INF/*.RSA | openssl pkcs7 -inform DER -print_certs \
  | openssl x509 -noout -fingerprint -sha256
```

Las dos huellas tienen que coincidir.
