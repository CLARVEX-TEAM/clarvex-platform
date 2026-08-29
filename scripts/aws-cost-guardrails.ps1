param(
  [string]$Profile = "clarvex",
  [string]$Region = "us-east-1",
  [decimal]$MonthlyBudgetUsd = 120,
  [decimal]$AnomalyThresholdUsd = 5,
  [string[]]$AlertEmails = @("contacto@clarvex.adrianluna.mx")
)

$ErrorActionPreference = "Stop"
$env:AWS_PAGER = ""

function Write-JsonFile {
  param([string]$Path, [object]$Value)
  $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-Aws {
  param([string[]]$ArgsList)
  & aws @ArgsList
  if ($LASTEXITCODE -ne 0) {
    throw "aws $($ArgsList -join ' ') failed with exit code $LASTEXITCODE"
  }
}

$identity = Invoke-Aws -ArgsList @("sts", "get-caller-identity", "--profile", $Profile, "--region", $Region, "--output", "json") | ConvertFrom-Json
$accountId = [string]$identity.Account

$tmp = Join-Path $env:TEMP "clarvex-aws-cost-guardrails"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$budgetName = "clarvex-aws-activate-guardrail"
$budgetPath = Join-Path $tmp "budget.json"
$budget = @{
  BudgetName = $budgetName
  BudgetLimit = @{ Amount = [string]$MonthlyBudgetUsd; Unit = "USD" }
  TimeUnit = "MONTHLY"
  BudgetType = "COST"
  CostTypes = @{
    IncludeTax = $true
    IncludeSubscription = $true
    UseBlended = $false
    IncludeRefund = $true
    IncludeCredit = $false
    IncludeUpfront = $true
    IncludeRecurring = $true
    IncludeOtherSubscription = $true
    IncludeSupport = $true
    IncludeDiscount = $true
    UseAmortized = $false
  }
}
Write-JsonFile $budgetPath $budget

$budgetExists = $true
& aws budgets describe-budget --profile $Profile --account-id $accountId --budget-name $budgetName --output json *> $null
if ($LASTEXITCODE -ne 0) { $budgetExists = $false }

if ($budgetExists) {
  Invoke-Aws -ArgsList @("budgets", "update-budget", "--profile", $Profile, "--account-id", $accountId, "--new-budget", "file://$budgetPath")
  Write-Host "Budget actualizado: $budgetName ($MonthlyBudgetUsd USD/mes, bruto antes de creditos)."
} else {
  Invoke-Aws -ArgsList @("budgets", "create-budget", "--profile", $Profile, "--account-id", $accountId, "--budget", "file://$budgetPath")
  Write-Host "Budget creado: $budgetName ($MonthlyBudgetUsd USD/mes, bruto antes de creditos)."
}

$notifications = @(
  @{ NotificationType = "ACTUAL"; ComparisonOperator = "GREATER_THAN"; Threshold = 50; ThresholdType = "PERCENTAGE" },
  @{ NotificationType = "FORECASTED"; ComparisonOperator = "GREATER_THAN"; Threshold = 80; ThresholdType = "PERCENTAGE" },
  @{ NotificationType = "ACTUAL"; ComparisonOperator = "GREATER_THAN"; Threshold = 100; ThresholdType = "PERCENTAGE" }
)
$subscribers = @($AlertEmails | Where-Object { $_ -and $_.Trim() } | ForEach-Object {
  @{ SubscriptionType = "EMAIL"; Address = $_.Trim() }
})

foreach ($notification in $notifications) {
  $notificationPath = Join-Path $tmp "notification-$($notification.NotificationType)-$($notification.Threshold).json"
  $subscribersPath = Join-Path $tmp "subscribers-$($notification.NotificationType)-$($notification.Threshold).json"
  Write-JsonFile $notificationPath $notification
  Write-JsonFile $subscribersPath $subscribers

  & aws budgets create-notification `
    --profile $Profile `
    --account-id $accountId `
    --budget-name $budgetName `
    --notification "file://$notificationPath" `
    --subscribers "file://$subscribersPath" *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Notificacion creada: $($notification.NotificationType) $($notification.Threshold)%."
  } else {
    Write-Host "Notificacion ya existia o no se pudo duplicar: $($notification.NotificationType) $($notification.Threshold)%."
  }
}

$monitorName = "clarvex-cost-service-monitor"
$monitorArn = (& aws ce get-anomaly-monitors `
  --profile $Profile `
  --region $Region `
  --query "AnomalyMonitors[?MonitorName=='$monitorName'].MonitorArn | [0]" `
  --output text)

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($monitorArn) -or $monitorArn -eq "None") {
  $monitorPath = Join-Path $tmp "anomaly-monitor.json"
  Write-JsonFile $monitorPath @{
    MonitorName = $monitorName
    MonitorType = "DIMENSIONAL"
    MonitorDimension = "SERVICE"
  }
  $createdMonitor = Invoke-Aws -ArgsList @("ce", "create-anomaly-monitor", "--profile", $Profile, "--region", $Region, "--anomaly-monitor", "file://$monitorPath", "--output", "json") | ConvertFrom-Json
  $monitorArn = [string]$createdMonitor.MonitorArn
  Write-Host "Monitor de anomalias creado: $monitorName."
} else {
  Write-Host "Monitor de anomalias ya existe: $monitorName."
}

$subscriptionName = "clarvex-cost-anomaly-daily"
$subscriptionPath = Join-Path $tmp "anomaly-subscription.json"
Write-JsonFile $subscriptionPath @{
  SubscriptionName = $subscriptionName
  MonitorArnList = @($monitorArn)
  Subscribers = @($AlertEmails | Where-Object { $_ -and $_.Trim() } | ForEach-Object {
    @{ Type = "EMAIL"; Address = $_.Trim() }
  })
  Threshold = [double]$AnomalyThresholdUsd
  Frequency = "DAILY"
}

& aws ce create-anomaly-subscription `
  --profile $Profile `
  --region $Region `
  --anomaly-subscription "file://$subscriptionPath" *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Suscripcion de anomalias creada: $subscriptionName ($AnomalyThresholdUsd USD)."
} else {
  Write-Host "Suscripcion de anomalias ya existia o no se pudo duplicar: $subscriptionName."
}

Write-Host "Guardrails listos para la cuenta $accountId."
