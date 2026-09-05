# Mueve a la nube personal lo que el bot deja en la carpeta Buzon.
#
# POR QUE EXISTE: el servidor NO puede sincronizar la nube entera. Le quedan
# ~6 GB libres y ahi corre la base de datos de la tienda: el dia que la nube
# personal pase de ese tamano, el disco se llena y Postgres deja de escribir.
# `Buzon` es por eso una carpeta de paso, no un sitio donde vivan las cosas.
#
# Este script cierra el circulo desde el lado de la PC: saca lo que llego,
# lo deja en la nube de verdad, y al vaciarse Buzon el servidor se limpia solo.
# Asi solo hay una carpeta que mirar.
#
# Instalar (una vez, en PowerShell como tu usuario):
#   .\mover-buzon-a-nube.ps1 -Instalar
#
# Probar sin mover nada:
#   .\mover-buzon-a-nube.ps1 -Simular

[CmdletBinding()]
param(
    [switch]$Instalar,
    [switch]$Simular,
    # La carpeta que sincroniza con el servidor: lo que deja el bot.
    [string]$RutaBuzon = (Join-Path $env:USERPROFILE "Buzon"),
    # La nube personal, que en esta maquina vive en otro disco.
    [string]$RutaNube = "D:\Nube",
    # Dentro de la nube, todo lo del bot aterriza aqui. Una sola carpeta
    # predecible en vez de sembrar archivos por la raiz.
    [string]$SubcarpetaDestino = "Buzon"
)

$ErrorActionPreference = "Stop"

# Se captura AQUI, a nivel de script. Dentro de una funcion,
# $MyInvocation.MyCommand.Path apunta a la funcion y devuelve vacio, con lo que
# la tarea programada quedaria registrada sin archivo que ejecutar.
$RutaDeEsteScript = $PSCommandPath

# --- las dos rutas ------------------------------------------------------------
# Se pasan como parametros en vez de leerlas del config.xml de Syncthing. Se
# intento eso primero y no funciona: la tarea programada NO encuentra ese
# archivo. En el `AppData\Local` real de esta maquina no existe ninguna carpeta
# `Syncthing` --si `kopia`, `rustdesk` y `Tailscale`, pero esa no--, asi que
# depender de ella deja la tarea fallando en silencio cada cinco minutos.
#
# Si algun dia mueves la nube de disco, cambia el valor por omision de -RutaNube.
function Obtener-Rutas {
    if (-not (Test-Path -LiteralPath $RutaBuzon)) {
        throw "No existe la carpeta Buzon: $RutaBuzon"
    }
    if (-not (Test-Path -LiteralPath $RutaNube)) {
        throw "No existe la carpeta de la nube: $RutaNube"
    }
    return @{ Buzon = $RutaBuzon; Nube = $RutaNube }
}

# --- ¿el archivo termino de bajar? -------------------------------------------
# Syncthing escribe `.syncthing.NOMBRE.tmp` y renombra al terminar, asi que un
# nombre normal ya esta completo. Aun asi se comprueba que nadie lo tenga
# abierto: mover un archivo a medio escribir lo parte en dos y no avisa.
function Esta-Libre([string]$ruta) {
    try {
        $f = [System.IO.File]::Open($ruta, 'Open', 'Read', 'None')
        $f.Close()
        return $true
    } catch {
        return $false
    }
}

# Metadatos de Syncthing: si se mueven, se rompe la carpeta.
$Ignorar = @(".stfolder", ".stversions", ".stignore")

function Mover-Todo {
    $rutas = Obtener-Rutas
    $origen = $rutas.Buzon
    $destino = Join-Path $rutas.Nube $SubcarpetaDestino

    if (-not (Test-Path $origen)) { throw "No existe la carpeta Buzon: $origen" }
    if (-not (Test-Path $destino)) {
        if (-not $Simular) { New-Item -ItemType Directory -Path $destino -Force | Out-Null }
    }

    Write-Output "  origen : $origen"
    Write-Output "  destino: $destino"

    $movidos = 0
    $saltados = 0

    Get-ChildItem -LiteralPath $origen -Force | ForEach-Object {
        $nombre = $_.Name

        if ($Ignorar -contains $nombre) { return }
        if ($nombre -like ".syncthing*") { $saltados++; return }
        if ($_.PSIsContainer) {
            # Las subcarpetas se quedan: el bot no crea ninguna, asi que una
            # carpeta aqui la pusiste tu a proposito.
            return
        }
        if (-not (Esta-Libre $_.FullName)) {
            Write-Output "  todavia en uso, se queda: $nombre"
            $saltados++
            return
        }

        # No sobrescribir nunca. Si ya existe uno igual, se numera.
        $final = Join-Path $destino $nombre
        if (Test-Path -LiteralPath $final) {
            $base = [System.IO.Path]::GetFileNameWithoutExtension($nombre)
            $ext = [System.IO.Path]::GetExtension($nombre)
            $n = 2
            while (Test-Path -LiteralPath $final) {
                $final = Join-Path $destino "$base ($n)$ext"
                $n++
            }
        }

        if ($Simular) {
            Write-Output "  [simulacion] $nombre -> $([System.IO.Path]::GetFileName($final))"
        } else {
            Move-Item -LiteralPath $_.FullName -Destination $final
            Write-Output "  movido: $nombre"
        }
        $movidos++
    }

    Write-Output "  total: $movidos movido(s), $saltados en espera"
}

# --- instalacion de la tarea programada ---------------------------------------
function Instalar-Tarea {
    if (-not $RutaDeEsteScript) { throw "No se de que archivo soy; ejecutame desde el .ps1, no pegado en la consola." }

    $lanzador = Join-Path (Split-Path -Parent $RutaDeEsteScript) "mover-buzon-a-nube.vbs"
    if (-not (Test-Path -LiteralPath $lanzador)) { throw "Falta el lanzador sin consola: $lanzador" }

    # WScript no crea consola; el lanzador espera y devuelve el resultado de PowerShell.
    $accion = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR "System32\wscript.exe") `
        -Argument "//B //Nologo `"$lanzador`""

    $existente = Get-ScheduledTask -TaskName "Mover buzon a la nube" -TaskPath "\" -ErrorAction SilentlyContinue
    if ($existente) {
        # Actualizar solo el arranque conserva permisos, disparadores y ajustes existentes.
        Set-ScheduledTask -TaskName $existente.TaskName -TaskPath $existente.TaskPath -Action $accion | Out-Null
        Write-Output "Arranque sin consola actualizado; frecuencia y permisos conservados."
        return
    }

    # Cada 5 minutos, indefinidamente. No hace falta mas: el bot ya te confirma
    # por Telegram en cuanto guarda, asi que esto solo ordena, no informa.
    $disparador = New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 5)

    $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    Register-ScheduledTask -TaskName "Mover buzon a la nube" `
        -Action $accion -Trigger $disparador -Settings $ajustes `
        -Description "Saca a la nube personal lo que el bot de Telegram deja en Buzon." `
        -Force | Out-Null

    Write-Output "Tarea instalada: se ejecuta cada 5 minutos."
    Write-Output "Para quitarla: Unregister-ScheduledTask -TaskName 'Mover buzon a la nube'"
}

if ($Instalar) {
    Instalar-Tarea
    return
}

# Corriendo por tarea programada no hay consola que mire nadie: si algo falla,
# el unico rastro seria un codigo de salida sin explicacion. Todo va a un
# registro, y los errores se atrapan para poder verlos escritos.
$log = Join-Path $env:LOCALAPPDATA "mover-buzon.log"
$sello = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
try {
    $salida = Mover-Todo
    "$sello`n$($salida -join "`n")" | Add-Content -LiteralPath $log -Encoding UTF8
    $salida
} catch {
    "$sello FALLO: $($_.Exception.Message)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Error $_.Exception.Message
    exit 1
}
