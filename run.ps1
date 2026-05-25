# Claude Counter launcher. Fetches its own Electron runtime. No Node or npm needed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$root     = $PSScriptRoot
$runtime  = Join-Path $root 'runtime'
$electron = Join-Path $runtime 'electron.exe'
$snap1    = Join-Path $runtime 'snapshot_blob.bin'
$snap2    = Join-Path $runtime 'v8_context_snapshot.bin'
$version  = 'v33.0.0'

Write-Host ''
Write-Host '  ===  Claude Counter  ==='
Write-Host '  Starting up. Once the counter appears you can minimise this window.'
Write-Host '  Closing this window closes the app.'
Write-Host ''

# True OS architecture - reliable even when this script runs under emulation.
$tag = 'x64'
try {
  $osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($osArch -match 'Arm64') { $tag = 'arm64' }
} catch {
  if (($env:PROCESSOR_ARCHITECTURE -match 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -match 'ARM64')) { $tag = 'arm64' }
}
Write-Host "  Processor: $tag"

$haveRuntime = (Test-Path $electron) -and (Test-Path $snap1) -and (Test-Path $snap2)

if (-not $haveRuntime) {
  $url = "https://github.com/electron/electron/releases/download/$version/electron-$version-win32-$tag.zip"
  Write-Host "  First run: downloading the $tag runtime, about 100 MB. This happens once."
  Write-Host '  Leave this window open. A few minutes is normal.'
  Write-Host ''
  if (Test-Path $runtime) { Remove-Item $runtime -Recurse -Force }
  New-Item -ItemType Directory -Path $runtime | Out-Null
  $zip = Join-Path $env:TEMP ('electron-cc-' + $tag + '.zip')
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip
    Write-Host '  Download complete. Unpacking...'
    Expand-Archive -Path $zip -DestinationPath $runtime -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host ''
    Write-Host '  The runtime download did not finish.'
    Write-Host '  Check your internet connection and run this again.'
    Write-Host '  If it keeps failing, download this file by hand:'
    Write-Host "    $url"
    Write-Host "  then extract everything inside it into a folder named 'runtime'"
    Write-Host '  next to this launcher, and run this again.'
    Write-Host ''
    exit 1
  }
  $haveRuntime = (Test-Path $electron) -and (Test-Path $snap1) -and (Test-Path $snap2)
  if (-not $haveRuntime) {
    Write-Host ''
    Write-Host '  The runtime did not unpack cleanly.'
    Write-Host "  Delete the 'runtime' folder next to this launcher and run this again."
    Write-Host ''
    exit 1
  }
  Write-Host '  Runtime ready.'
  Write-Host ''
}

# Remove a stale npm-based install from earlier versions, if one is present.
$oldModules = Join-Path $root 'node_modules'
if (Test-Path $oldModules) { Remove-Item $oldModules -Recurse -Force -ErrorAction SilentlyContinue }

Set-Location $root
& $electron $root
