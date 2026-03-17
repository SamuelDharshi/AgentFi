param(
  [switch]$SkipContractsCompile,
  [switch]$SkipBackendBuild,
  [switch]$SkipFrontendBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Invoke-NpmScript {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$ScriptName
  )

  Write-Step ("Running npm script '" + $ScriptName + "' in " + $WorkingDirectory)
  Push-Location $WorkingDirectory
  try {
    npm run $ScriptName
    if ($LASTEXITCODE -ne 0) {
      throw ("npm run " + $ScriptName + " failed with exit code " + $LASTEXITCODE)
    }
  }
  finally {
    Pop-Location
  }
}

function Import-EnvFile {
  param([Parameter(Mandatory = $true)][string]$EnvFilePath)

  Get-Content $EnvFilePath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      return
    }

    $idx = $line.IndexOf("=")
    if ($idx -lt 1) {
      return
    }

    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
      return
    }
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}

function Get-EnvValueFromFile {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFilePath,
    [Parameter(Mandatory = $true)][string]$KeyName
  )

  if (-not (Test-Path $EnvFilePath)) {
    return $null
  }

  foreach ($rawLine in Get-Content $EnvFilePath) {
    $line = $rawLine.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      continue
    }

    $idx = $line.IndexOf("=")
    if ($idx -lt 1) {
      continue
    }

    $name = $line.Substring(0, $idx).Trim()
    if ($name -ne $KeyName) {
      continue
    }

    $value = $line.Substring($idx + 1).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $null
    }

    return $value
  }

  return $null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path

$contractsDir = Join-Path $repoRoot "contracts"
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

$backendEnvFile = Join-Path $backendDir ".env"
$contractsEnvFile = Join-Path $contractsDir ".env"
$deployedFile = Join-Path $contractsDir "deployed.json"

if (-not (Test-Path $contractsEnvFile)) {
  throw ("Missing contracts env file: " + $contractsEnvFile)
}

if (-not (Test-Path $deployedFile)) {
  throw ("Missing deployed contracts file: " + $deployedFile)
}

Write-Step "Loading live environment from contracts/.env and contracts/deployed.json"
Import-EnvFile -EnvFilePath $contractsEnvFile

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  $fallbackOpenAiKey = Get-EnvValueFromFile -EnvFilePath $backendEnvFile -KeyName "OPENAI_API_KEY"
  if (-not [string]::IsNullOrWhiteSpace($fallbackOpenAiKey)) {
    $env:OPENAI_API_KEY = $fallbackOpenAiKey
    Write-Step "Using OPENAI_API_KEY fallback from backend/.env"
  }
}

if (-not $env:USER_EVM_KEY -and $env:USER_KEY) {
  $env:USER_EVM_KEY = $env:USER_KEY
}

if (-not $env:MARKET_AGENT_EVM_KEY -and $env:MARKET_AGENT_KEY) {
  $env:MARKET_AGENT_EVM_KEY = $env:MARKET_AGENT_KEY
}

$deployed = Get-Content $deployedFile -Raw | ConvertFrom-Json

if (-not $deployed.erc8004RegistryAddress -or -not $deployed.atomicSwapAddress) {
  throw "deployed.json must include erc8004RegistryAddress and atomicSwapAddress"
}

$env:ERC8004_REGISTRY_ADDRESS = [string]$deployed.erc8004RegistryAddress
$env:ATOMIC_SWAP_ADDRESS = [string]$deployed.atomicSwapAddress
$env:PHASE5_ENV_FILE = (Resolve-Path $contractsEnvFile).Path
$env:MOCK_HEDERA = "false"
$env:HEDERA_NETWORK = "testnet"

$requiredEnv = @(
  "HEDERA_OPERATOR_ID",
  "HEDERA_OPERATOR_KEY",
  "HEDERA_OPERATOR_EVM_KEY",
  "HEDERA_JSON_RPC_URL",
  "MARKET_AGENT_ACCOUNT_ID",
  "MARKET_AGENT_EVM_ADDRESS",
  "USER_ACCOUNT_ID",
  "USER_EVM_ADDRESS",
  "USER_EVM_KEY",
  "HTS_TOKEN_ID",
  "OPENAI_API_KEY",
  "ATOMIC_SWAP_ADDRESS",
  "ERC8004_REGISTRY_ADDRESS"
)

$missing = @()
foreach ($key in $requiredEnv) {
  $value = [Environment]::GetEnvironmentVariable($key)
  if ([string]::IsNullOrWhiteSpace($value)) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  throw ("Missing required env vars for live e2e: " + ($missing -join ", "))
}

if (-not $SkipContractsCompile) {
  Invoke-NpmScript -WorkingDirectory $contractsDir -ScriptName "compile"
}

if (-not $SkipBackendBuild) {
  Invoke-NpmScript -WorkingDirectory $backendDir -ScriptName "build"
}

if (-not $SkipFrontendBuild) {
  Invoke-NpmScript -WorkingDirectory $frontendDir -ScriptName "build"
}

Invoke-NpmScript -WorkingDirectory $backendDir -ScriptName "test:e2e-live:verbose"

Write-Host "SUCCESS: compile/build/live-e2e flow completed." -ForegroundColor Green