# Prepara el despliegue por OIDC: GitHub Actions -> AWS sin credenciales fijas.
#
# Crea tres cosas:
#   1. El proveedor de identidad de GitHub en IAM (uno por cuenta).
#   2. Un rol que SOLO puede asumir este repositorio.
#   3. Una politica que SOLO permite lanzar el despliegue en UNA instancia.
#
# ⚠️ La confianza se ata al REPOSITORIO Y AL ENTORNO. Sin esa condicion,
# cualquier repositorio de GitHub —de cualquier persona— podria asumir el rol.
# Es el fallo clasico de las guias de OIDC, y no avisa: funciona igual de bien
# mientras nadie lo intente.
#
# ⚠️ EL SUJETO LLEVA IDENTIFICADORES, no solo los nombres. Esta
# organizacion emite el sujeto del token asi:
#
#   repo:CLARVEX-TEAM@321237585/clarvex-platform@1260997933:environment:Production
#
# y no como sale en todas las guias:
#
#   repo:CLARVEX-TEAM/clarvex-platform:environment:Production
#
# Es una proteccion de GitHub: con los identificadores dentro, el permiso
# sobrevive a un cambio de nombre, y nadie se lo queda creando despues un
# repositorio con el nombre que quedo libre.
#
# Costo tres intentos porque STS no lo dice: responde «no autorizado» y jamas
# revela que sujeto presentaste --si lo hiciera seria un oraculo para adivinar
# condiciones--. Donde SI aparece es en CloudTrail, en userIdentity.userName
# del evento AssumeRoleWithWebIdentity:
#
#   aws cloudtrail lookup-events --profile clarvex --region us-east-1 \
#     --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity
#
# Y va al ENTORNO, no a la rama: cuando un job declara `environment`, GitHub
# cambia esa parte del sujeto. Ademas es mas estricto, porque el entorno es el
# unico sitio donde se puede exigir aprobacion manual.
#
#   powershell -ExecutionPolicy Bypass -File "D:\Documents\New project\scripts\aws-oidc-deploy.ps1"
#
# Requiere sesion viva:  aws sso login --profile clarvex

$ErrorActionPreference = "Stop"

$Perfil    = "clarvex"
$Region    = "us-east-1"
$Instancia = "i-06fd0869766482dc1"
$RolNombre = "clarvex-github-deploy"
$RolInstancia = "clarvex-instancia"
$Entorno   = "Production"

# ⚠️ El sujeto lleva IDENTIFICADORES NUMERICOS, no solo los nombres. Se saca
# de CloudTrail (campo userName) o del API de GitHub: /orgs/<org> y
# /repos/<org>/<repo>, campo "id".
$Sujeto    = "CLARVEX-TEAM@321237585/clarvex-platform@1260997933"

# ── Preguntarle a AWS sin que el script se muera ──────────────────────────
#
# ⚠️ Con `$ErrorActionPreference = "Stop"`, CUALQUIER cosa que un ejecutable
# escriba en stderr se convierte en error mortal. Y aqui se pregunta a
# proposito por cosas que puede que no existan: la respuesta «no existe» llega
# por stderr y mataba el script en la primera comprobacion.
#
# Por eso las consultas pasan por aqui: se relaja la preferencia mientras dura
# la llamada y se decide por el CODIGO DE SALIDA, que es lo fiable.
function Preguntar-Aws {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Argumentos)

  $previo = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $salida = & aws @Argumentos 2>$null
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $previo

  return [pscustomobject]@{ Ok = ($codigo -eq 0); Salida = $salida }
}

# ── Cuenta ────────────────────────────────────────────────────────────────
$r = Preguntar-Aws sts get-caller-identity --profile $Perfil --query Account --output text
if (-not $r.Ok) { throw "Sin sesion de AWS. Corre primero:  aws sso login --profile $Perfil" }
$Cuenta = ($r.Salida | Select-Object -First 1).Trim()
Write-Output "Cuenta: $Cuenta"

# ── 1. Proveedor de identidad de GitHub ───────────────────────────────────
$ArnProveedor = "arn:aws:iam::${Cuenta}:oidc-provider/token.actions.githubusercontent.com"

$r = Preguntar-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $ArnProveedor --profile $Perfil
if ($r.Ok) {
  Write-Output "1/4  El proveedor OIDC ya existia."
} else {
  Write-Output "1/4  Creando el proveedor OIDC de GitHub..."
  # La huella ya no se valida desde 2023, pero el API sigue exigiendo el campo.
  aws iam create-open-id-connect-provider `
    --url "https://token.actions.githubusercontent.com" `
    --client-id-list "sts.amazonaws.com" `
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" `
    --profile $Perfil | Out-Null
}

# ── 2. El rol, con confianza atada al repositorio ─────────────────────────
$archivoConfianza = Join-Path $env:TEMP "clarvex-trust.json"
@"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$ArnProveedor" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:${Sujeto}:environment:${Entorno}"
      }
    }
  }]
}
"@ | Out-File -FilePath $archivoConfianza -Encoding ascii

$r = Preguntar-Aws iam get-role --role-name $RolNombre --profile $Perfil
if ($r.Ok) {
  Write-Output "2/4  El rol ya existia; actualizando su politica de confianza."
  aws iam update-assume-role-policy `
    --role-name $RolNombre `
    --policy-document "file://$archivoConfianza" `
    --profile $Perfil | Out-Null
} else {
  Write-Output "2/4  Creando el rol $RolNombre..."
  aws iam create-role `
    --role-name $RolNombre `
    --assume-role-policy-document "file://$archivoConfianza" `
    --description "Despliegue de Clarvex desde GitHub Actions por OIDC" `
    --max-session-duration 3600 `
    --profile $Perfil | Out-Null
}

# ── 3. Permisos: lo minimo para lanzar el despliegue ──────────────────────
#
# ⚠️ Acotado a UNA instancia y UN documento de SSM. Con `Resource: "*"` este
# rol podria ejecutar cualquier comando en cualquier maquina de la cuenta, que
# es mucho mas de lo que hace falta para un `git pull` y un `pm2 restart`.
$archivoPermisos = Join-Path $env:TEMP "clarvex-perms.json"
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LanzarElDespliegue",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:${Region}:${Cuenta}:instance/${Instancia}",
        "arn:aws:ssm:${Region}::document/AWS-RunShellScript"
      ]
    },
    {
      "Sid": "LeerElResultado",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands"
      ],
      "Resource": "*"
    }
  ]
}
"@ | Out-File -FilePath $archivoPermisos -Encoding ascii

Write-Output "3/4  Escribiendo los permisos del rol..."
aws iam put-role-policy `
  --role-name $RolNombre `
  --policy-name "clarvex-deploy-ssm" `
  --policy-document "file://$archivoPermisos" `
  --profile $Perfil | Out-Null

Remove-Item $archivoConfianza, $archivoPermisos -ErrorAction SilentlyContinue

# ── 4. ¿SSM ve la instancia? ──────────────────────────────────────────────
Write-Output "4/4  Comprobando que SSM administre la instancia..."
$r = Preguntar-Aws ssm describe-instance-information `
  --filters "Key=InstanceIds,Values=$Instancia" `
  --query "InstanceInformationList[0].PingStatus" `
  --output text --profile $Perfil

$ping = if ($r.Ok) { ($r.Salida | Select-Object -First 1) } else { $null }

if ($ping -eq "Online") {
  Write-Output "     SSM ve la instancia: Online."
} else {
  Write-Output ""
  Write-Output "     ⚠️ SSM NO administra la instancia (respuesta: '$ping')."
  Write-Output "     El agente esta corriendo, asi que lo que falta es el permiso."
  Write-Output "     Corre esto y espera un par de minutos:"
  Write-Output ""
  Write-Output "       aws iam attach-role-policy --role-name $RolInstancia ``"
  Write-Output "         --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore ``"
  Write-Output "         --profile $Perfil"
}

# ── Resumen ───────────────────────────────────────────────────────────────
$ArnRol = "arn:aws:iam::${Cuenta}:role/$RolNombre"
Write-Output ""
Write-Output "=== LISTO. Ahora en GitHub ==="
Write-Output "clarvex-platform > Settings > Secrets and variables > Actions > Variables:"
Write-Output ""
Write-Output "  AWS_DEPLOY_ROLE_ARN = $ArnRol"
Write-Output "  AWS_INSTANCE_ID     = $Instancia"
Write-Output ""
Write-Output "Son VARIABLES, no secretos: un ARN no es una credencial, y verlo en"
Write-Output "el registro de la ejecucion ayuda a depurar."
