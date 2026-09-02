# Prepara el despliegue por OIDC: GitHub Actions -> AWS sin credenciales fijas.
#
# Crea tres cosas:
#   1. El proveedor de identidad de GitHub en IAM (uno por cuenta).
#   2. Un rol que SOLO puede asumir este repositorio.
#   3. Una politica que SOLO permite lanzar el script de despliegue en UNA
#      instancia concreta.
#
# ⚠️ La confianza se ata al REPOSITORIO Y A LA RAMA. Sin esa condicion,
# cualquier repositorio de GitHub —de cualquier persona— podria asumir el rol.
# Es el fallo clasico de las guias de OIDC, y no avisa: funciona igual de bien
# mientras nadie lo intente.
#
#   powershell -ExecutionPolicy Bypass -File scripts\aws-oidc-deploy.ps1
#
# Requiere sesion viva:  aws sso login --profile clarvex

$ErrorActionPreference = "Stop"

$Perfil     = "clarvex"
$Region     = "us-east-1"
$Repo       = "CLARVEX-TEAM/clarvex-platform"
$Instancia  = "i-06fd0869766482dc1"
$RolNombre  = "clarvex-github-deploy"

$Cuenta = (aws sts get-caller-identity --profile $Perfil --query Account --output text)
if (-not $Cuenta) { throw "Sin sesion de AWS. Corre: aws sso login --profile $Perfil" }
Write-Output "Cuenta: $Cuenta"

# ── 1. Proveedor de identidad de GitHub ───────────────────────────────────
$ArnProveedor = "arn:aws:iam::${Cuenta}:oidc-provider/token.actions.githubusercontent.com"
$existe = aws iam get-open-id-connect-provider --open-id-connect-provider-arn $ArnProveedor --profile $Perfil 2>$null

if ($LASTEXITCODE -ne 0) {
  Write-Output "Creando el proveedor OIDC de GitHub..."
  # La huella ya no se valida desde 2023, pero el API sigue exigiendo el campo.
  aws iam create-open-id-connect-provider `
    --url "https://token.actions.githubusercontent.com" `
    --client-id-list "sts.amazonaws.com" `
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" `
    --profile $Perfil | Out-Null
} else {
  Write-Output "El proveedor OIDC ya existia."
}

# ── 2. Politica de confianza: SOLO este repo y SOLA esta rama ─────────────
$confianza = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$ArnProveedor" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${Repo}:ref:refs/heads/main"
      }
    }
  }]
}
"@

$confianza | Out-File -FilePath "$env:TEMP\clarvex-trust.json" -Encoding utf8 -NoNewline

$rol = aws iam get-role --role-name $RolNombre --profile $Perfil 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Output "Creando el rol $RolNombre..."
  aws iam create-role `
    --role-name $RolNombre `
    --assume-role-policy-document "file://$env:TEMP\clarvex-trust.json" `
    --description "Despliegue de Clarvex desde GitHub Actions por OIDC" `
    --max-session-duration 3600 `
    --profile $Perfil | Out-Null
} else {
  Write-Output "El rol ya existia; actualizando su politica de confianza."
  aws iam update-assume-role-policy `
    --role-name $RolNombre `
    --policy-document "file://$env:TEMP\clarvex-trust.json" `
    --profile $Perfil | Out-Null
}

# ── 3. Permisos: lo minimo para lanzar el despliegue ──────────────────────
#
# ⚠️ Acotado a UNA instancia y a UN documento de SSM. Con `Resource: "*"` este
# rol podria ejecutar cualquier comando en cualquier maquina de la cuenta, que
# es mucho mas de lo que hace falta para un `git pull` y un `pm2 restart`.
$permisos = @"
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
"@

$permisos | Out-File -FilePath "$env:TEMP\clarvex-perms.json" -Encoding utf8 -NoNewline

aws iam put-role-policy `
  --role-name $RolNombre `
  --policy-name "clarvex-deploy-ssm" `
  --policy-document "file://$env:TEMP\clarvex-perms.json" `
  --profile $Perfil | Out-Null

Remove-Item "$env:TEMP\clarvex-trust.json", "$env:TEMP\clarvex-perms.json" -ErrorAction SilentlyContinue

# ── 4. Comprobar que SSM ve la instancia ──────────────────────────────────
Write-Output ""
Write-Output "=== Comprobacion: ¿SSM administra la instancia? ==="
$ssm = aws ssm describe-instance-information `
  --filters "Key=InstanceIds,Values=$Instancia" `
  --query "InstanceInformationList[0].[PingStatus,PlatformName,AgentVersion]" `
  --output text --profile $Perfil 2>$null

if ($ssm -and $ssm -ne "None") {
  Write-Output "  $ssm"
} else {
  Write-Output "  ⚠️ SSM NO ve la instancia."
  Write-Output "  Falta que su rol '$($env:ROL)clarvex-instancia' tenga la politica"
  Write-Output "  AmazonSSMManagedInstanceCore. Sin eso el despliegue no llega."
}

$ArnRol = "arn:aws:iam::${Cuenta}:role/$RolNombre"
Write-Output ""
Write-Output "=== LISTO. Ahora en GitHub ==="
Write-Output "Settings > Secrets and variables > Actions > Variables > New:"
Write-Output ""
Write-Output "  AWS_DEPLOY_ROLE_ARN = $ArnRol"
Write-Output "  AWS_INSTANCE_ID     = $Instancia"
Write-Output ""
Write-Output "Son VARIABLES, no secretos: un ARN no es una credencial y verlo"
Write-Output "en el registro de la ejecucion ayuda a depurar."
