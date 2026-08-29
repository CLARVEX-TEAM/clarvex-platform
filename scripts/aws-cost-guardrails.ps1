param(
  [string]$Profile = "clarvex",
  [string]$Region = "us-east-1",
  [decimal]$MonthlyBudgetUsd = 120,
  [decimal]$AnomalyThresholdUsd = 5,
  [string[]]$AlertEmails = @("contacto@clarvex.adrianluna.mx")
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$env:AWS_PAGER = ""

function Write-JsonFile {
  param([string]$Path, [object]$Value)
  $json = $Value | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Aws {
  param([string[]]$ArgsList)
  & aws @ArgsList
  if ($LASTEXITCODE -ne 0) {
    throw "aws $($ArgsList -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Test-AwsSuccess {
  param([string[]]$ArgsList)
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & aws @ArgsList *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorAction
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
$budgetExists = Test-AwsSuccess -ArgsList @("budgets", "describe-budget", "--profile", $Profile, "--account-id", $accountId, "--budget-name", $budgetName, "--output", "json")

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

  $createdNotification = Test-AwsSuccess -ArgsList @(
    "budgets", "create-notification",
    "--profile", $Profile,
    "--account-id", $accountId,
    "--budget-name", $budgetName,
    "--notification", "file://$notificationPath",
    "--subscribers", "file://$subscribersPath"
  )
  if ($createdNotification) {
    Write-Host "Notificacion creada: $($notification.NotificationType) $($notification.Threshold)%."
  } else {
    Write-Host "Notificacion ya existia o no se pudo duplicar: $($notification.NotificationType) $($notification.Threshold)%."
  }
}

$monitorName = "clarvex-cost-service-monitor"
$monitorsRaw = Invoke-Aws -ArgsList @("ce", "get-anomaly-monitors", "--profile", $Profile, "--region", $Region, "--output", "json")
$monitors = ($monitorsRaw | ConvertFrom-Json).AnomalyMonitors
$selectedMonitor = @($monitors | Where-Object { $_.MonitorName -eq $monitorName } | Select-Object -First 1)
if (-not $selectedMonitor) {
  $selectedMonitor = @($monitors | Where-Object { $_.MonitorType -eq "DIMENSIONAL" -and $_.MonitorDimension -eq "SERVICE" } | Select-Object -First 1)
}

if ($selectedMonitor) {
  $monitorArn = [string]$selectedMonitor.MonitorArn
  Write-Host "Monitor de anomalias reutilizado: $($selectedMonitor.MonitorName)."
} else {
  $monitorPath = Join-Path $tmp "anomaly-monitor.json"
  Write-JsonFile $monitorPath @{
    MonitorName = $monitorName
    MonitorType = "DIMENSIONAL"
    MonitorDimension = "SERVICE"
  }
  $createdMonitor = Invoke-Aws -ArgsList @("ce", "create-anomaly-monitor", "--profile", $Profile, "--region", $Region, "--anomaly-monitor", "file://$monitorPath", "--output", "json") | ConvertFrom-Json
  $monitorArn = [string]$createdMonitor.MonitorArn
  Write-Host "Monitor de anomalias creado: $monitorName."
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

$createdSubscription = Test-AwsSuccess -ArgsList @(
  "ce", "create-anomaly-subscription",
  "--profile", $Profile,
  "--region", $Region,
  "--anomaly-subscription", "file://$subscriptionPath"
)
if ($createdSubscription) {
  Write-Host "Suscripcion de anomalias creada: $subscriptionName ($AnomalyThresholdUsd USD)."
} else {
  Write-Host "Suscripcion de anomalias ya existia o no se pudo duplicar: $subscriptionName."
}

Write-Host "Guardrails listos para la cuenta $accountId."
