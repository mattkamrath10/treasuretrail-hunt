@echo off
REM ===========================================================================
REM  TreasureTrail - Android prep script (Windows)
REM
REM  Run this from the project ROOT (the folder that contains package.json and
REM  the android\ folder) BEFORE opening the project in Android Studio.
REM
REM  It builds the web app and syncs it into the native Android project so the
REM  generated files (web assets + Capacitor plugin modules) exist locally.
REM ===========================================================================

setlocal enabledelayedexpansion
echo.
echo ============================================================
echo   TreasureTrail - Android build preparation
echo ============================================================
echo.

REM --- 0. Must run from the project root --------------------------------------
if not exist "package.json" (
    echo [ERROR] package.json not found in this folder.
    echo         Run this script from the project ROOT folder
    echo         ^(the folder that contains package.json and the android\ folder^).
    goto :fail
)
if not exist "android" (
    echo [ERROR] android\ folder not found in this folder.
    echo         Run this script from the project ROOT folder.
    goto :fail
)

REM --- 1. Verify Node.js is installed -----------------------------------------
echo [1/5] Checking for Node.js ...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on your PATH.
    echo         Install the LTS version from https://nodejs.org  ^(Node 22 or newer^),
    echo         close this window, open a new Command Prompt, and run this script again.
    goto :fail
)

for /f "tokens=1 delims=." %%a in ('node -v') do set "NODEMAJOR=%%a"
set "NODEMAJOR=!NODEMAJOR:v=!"
for /f "delims=" %%v in ('node -v') do set "NODEFULL=%%v"
echo        Found Node.js !NODEFULL!
if !NODEMAJOR! LSS 22 (
    echo [ERROR] Node.js !NODEFULL! is too old.
    echo         This project requires Node.js 22 or newer ^(Capacitor 8 + Vite 8^).
    echo         Install the latest LTS from https://nodejs.org and try again.
    goto :fail
)
echo        Node.js version OK.
echo.

REM --- 2a. npm install --------------------------------------------------------
echo [2/5] Installing dependencies ^(npm install^) ...
call npm install
if errorlevel 1 (
    echo [ERROR] "npm install" failed. See the messages above.
    goto :fail
)
echo        Dependencies installed.
echo.

REM --- 2b. npm run build ------------------------------------------------------
echo [3/5] Building the web app ^(npm run build^) ...
call npm run build
if errorlevel 1 (
    echo [ERROR] "npm run build" failed. See the messages above.
    goto :fail
)
echo        Web build complete.
echo.

REM --- 2c. cap sync android ---------------------------------------------------
echo [4/5] Syncing web build into the Android project ^(npx cap sync android^) ...
call npx cap sync android
if errorlevel 1 (
    echo [ERROR] "npx cap sync android" failed. See the messages above.
    goto :fail
)
echo        Capacitor sync complete.
echo.

REM --- 5. Verify the generated files exist ------------------------------------
echo [5/5] Verifying generated Android files ...
set "OK=1"

if exist "android\app\src\main\assets\public\index.html" (
    echo        [OK]   android\app\src\main\assets\public  was generated.
) else (
    echo        [FAIL] android\app\src\main\assets\public  is MISSING.
    set "OK=0"
)

if exist "android\capacitor-cordova-android-plugins\build.gradle" (
    echo        [OK]   capacitor-cordova-android-plugins  was generated.
) else (
    echo        [FAIL] capacitor-cordova-android-plugins  is MISSING.
    set "OK=0"
)

echo.
if "!OK!"=="0" (
    echo [ERROR] One or more generated files are missing. The Android build will
    echo         fail until these exist. Re-run this script after fixing the errors above.
    goto :fail
)

echo ============================================================
echo   SUCCESS - the Android project is ready to build.
echo ============================================================
echo.
echo   Open THIS folder in Android Studio:
echo.
echo       %CD%\android
echo.
echo   Then: Build  ^>  Generate Signed Bundle / APK  ^>  Android App Bundle,
echo   select your treasuretrail-upload.jks keystore, build variant "release".
echo   The signed bundle will be written to:
echo.
echo       %CD%\android\app\release\app-release.aab
echo.
goto :end

:fail
echo.
echo ============================================================
echo   STOPPED - a step failed. Nothing further was run.
echo ============================================================
echo.

:end
endlocal
echo Press any key to close this window...
pause >nul
