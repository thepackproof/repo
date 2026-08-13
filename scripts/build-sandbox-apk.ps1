[CmdletBinding()]
param(
  [string]$KeystorePath = 'C:\Users\neric\.packproof\credentials\packproof-sandbox-device-test.jks',
  [string]$OutputPath = 'C:\src\PackProof\artifacts\release-readiness-2026-08-13\app-release-arm64-post-hardening.apk'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$resolvedKeystore = (Resolve-Path -LiteralPath $KeystorePath -ErrorAction Stop).Path
$outputDirectory = Split-Path -Parent $OutputPath
$alias = Read-Host 'Sandbox key alias'
$storePasswordSecure = Read-Host 'Sandbox keystore password' -AsSecureString
$keyPasswordSecure = Read-Host 'Sandbox key password' -AsSecureString
$storePasswordBstr = [IntPtr]::Zero
$keyPasswordBstr = [IntPtr]::Zero

if ([string]::IsNullOrWhiteSpace($alias)) {
  throw 'The sandbox key alias is required.'
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string]$Executable,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with exit code $LASTEXITCODE."
  }
}

try {
  $storePasswordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePasswordSecure)
  $keyPasswordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPasswordSecure)

  $env:PACKPROOF_ANDROID_SIGNING_PROFILE = 'sandbox'
  $env:PACKPROOF_ANDROID_KEYSTORE_PATH = $resolvedKeystore
  $env:PACKPROOF_ANDROID_KEY_ALIAS = $alias.Trim()
  $env:PACKPROOF_ANDROID_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storePasswordBstr)
  $env:PACKPROOF_ANDROID_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPasswordBstr)

  Push-Location $repositoryRoot
  try {
    Invoke-Checked 'npm.cmd' @('run', 'test:android-signing-plugin')
    Invoke-Checked 'npx.cmd' @('expo', 'prebuild', '--platform', 'android', '--clean', '--no-install')
    Invoke-Checked '.\android\gradlew.bat' @('-p', 'android', ':app:signingReport', '--no-daemon')
    Invoke-Checked '.\android\gradlew.bat' @('-p', 'android', ':app:assembleRelease', '--no-daemon', '-PreactNativeArchitectures=arm64-v8a')

    $builtApk = Join-Path $repositoryRoot 'android\app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path -LiteralPath $builtApk -PathType Leaf)) {
      throw "The release build completed without producing the expected APK: $builtApk"
    }

    New-Item -ItemType Directory -Force $outputDirectory | Out-Null
    Copy-Item -LiteralPath $builtApk -Destination $OutputPath -Force
    $artifact = Get-Item -LiteralPath $OutputPath
    $digest = Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256
    Write-Host "Built sandbox APK: $($artifact.FullName)"
    Write-Host "APK bytes: $($artifact.Length)"
    Write-Host "APK SHA-256: $($digest.Hash)"
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:PACKPROOF_ANDROID_SIGNING_PROFILE -ErrorAction SilentlyContinue
  Remove-Item Env:PACKPROOF_ANDROID_KEYSTORE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:PACKPROOF_ANDROID_KEY_ALIAS -ErrorAction SilentlyContinue
  Remove-Item Env:PACKPROOF_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PACKPROOF_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
  $alias = $null
  $storePasswordSecure = $null
  $keyPasswordSecure = $null
  if ($storePasswordBstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storePasswordBstr)
  }
  if ($keyPasswordBstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPasswordBstr)
  }
}
