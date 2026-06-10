# BackTrack 2.0 Installer
$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\BackTrack"
$sourceDir = $PSScriptRoot
$exe = Join-Path $installDir "BackTrack.exe"

Write-Host "Installing BackTrack 2.0 to:" $installDir -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $installDir -Recurse -Force

$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\BackTrack"
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

$lnkDesktop = Join-Path $desktop "BackTrack.lnk"
$lnkStart = Join-Path $startMenu "BackTrack.lnk"
foreach ($lnk in @($lnkDesktop, $lnkStart)) {
    $s = $wsh.CreateShortcut($lnk)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $installDir
    $s.Description = "BackTrack - restore closed items"
    $s.Save()
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $runKey -Name "BackTrack" -Value "`"$exe`""

Write-Host "Installation complete." -ForegroundColor Green
Start-Process $exe
