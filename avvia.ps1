# avvia.ps1 — Compila, installa e avvia "Gestione Vita" su un telefono/emulatore Android collegato.
# Uso: npm run android   (oppure: powershell -ExecutionPolicy Bypass -File avvia.ps1)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Ferma($messaggio) {
    Write-Host ""
    Write-Host "ERRORE: $messaggio" -ForegroundColor Red
    exit 1
}

# JAVA_HOME: usa quella di sistema se già impostata, altrimenti il Java incluso in Android Studio
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    $jbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
    else { Ferma "JAVA_HOME non e' impostato e non trovo Java di Android Studio in '$jbr'. Apri Android Studio almeno una volta per installarlo, poi riprova." }
}

# ANDROID_HOME: usa quella di sistema se già impostata, altrimenti il percorso standard dell'SDK
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
    else { Ferma "ANDROID_HOME non e' impostato e non trovo l'SDK Android in '$sdk'. Apri Android Studio, installa l'SDK, poi riprova." }
}

$platformTools = Join-Path $env:ANDROID_HOME "platform-tools"
if ($env:Path -notlike "*$platformTools*") { $env:Path = "$platformTools;$env:Path" }

$adb = Join-Path $platformTools "adb.exe"
if (-not (Test-Path $adb)) { Ferma "Non trovo adb.exe in '$platformTools'. Controlla che l'SDK Android sia installato correttamente." }

Write-Host "1/5 Controllo dispositivi collegati..." -ForegroundColor Cyan
$devicesOut = & $adb devices
$deviceLines = $devicesOut | Select-Object -Skip 1 | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "offline" }
if (-not $deviceLines) {
    Ferma "Nessun dispositivo Android collegato. Collega il telefono via USB con il debug USB attivo (Impostazioni > Opzioni sviluppatore), oppure avvia un emulatore da Android Studio, poi riprova."
}
Write-Host ($devicesOut -join "`n")

Write-Host "`n2/5 Sincronizzo il progetto Capacitor (npx cap sync android)..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Ferma "La sincronizzazione Capacitor non e' riuscita. Guarda l'errore qui sopra." }

Write-Host "`n3/5 Compilo l'app (gradlew assembleDebug)... (puo' richiedere qualche minuto la prima volta)" -ForegroundColor Cyan
Set-Location (Join-Path $root "android")
& .\gradlew.bat assembleDebug
$gradleExit = $LASTEXITCODE
Set-Location $root
if ($gradleExit -ne 0) { Ferma "La compilazione non e' riuscita. Guarda l'errore di Gradle qui sopra." }

$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { Ferma "Compilazione terminata ma non trovo l'APK in '$apk'." }

Write-Host "`n4/5 Installo l'app sul dispositivo..." -ForegroundColor Cyan
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { Ferma "L'installazione dell'APK non e' riuscita." }

Write-Host "`n5/5 Avvio l'app..." -ForegroundColor Cyan
& $adb shell am start -n it.samuele.gestionevita/.MainActivity
if ($LASTEXITCODE -ne 0) { Ferma "L'avvio dell'app non e' riuscito." }

Write-Host "`nFatto: Gestione Vita e' stata compilata, installata e avviata sul dispositivo." -ForegroundColor Green
