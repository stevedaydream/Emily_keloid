@echo off
chcp 65001 > nul
:: Delayed expansion is required: variables set inside an if/for block are not
:: visible with %VAR% until the block finishes, so the deployment id read from
:: the file has to be referenced as !DEPLOY_ID!.
setlocal enabledelayedexpansion
cd /d "%~dp0"

:MENU
cls
echo =========================================
echo   Keloid Research Platform -- Dev Tools
echo =========================================
echo.
echo   1. GAS push + deploy   (LINE relay)
echo   2. Local dev server    (npm run dev)
echo   3. Type-check + build  (tsc + next build)
echo   4. Push to GitHub      (Vercel auto-deploys)
echo   5. Exit
echo.
set /p CHOICE=Select [1-5]:

if "%CHOICE%"=="1" goto GAS_DEPLOY
if "%CHOICE%"=="2" goto LOCAL_DEV
if "%CHOICE%"=="3" goto BUILD
if "%CHOICE%"=="4" goto GIT_PUSH
if "%CHOICE%"=="5" goto END
echo Invalid option. Try again.
timeout /t 1 > nul
goto MENU

:: -----------------------------------------
:GAS_DEPLOY
cls
echo =========================================
echo   GAS push + deploy
echo =========================================
echo.

:: scriptId must be filled in before anything can be pushed.
:: Get it from the Apps Script editor: Project Settings -> IDs -> Script ID
findstr /C:"\"scriptId\": \"\"" .clasp.json > nul
if %errorlevel% equ 0 (
    echo [SETUP NEEDED] .clasp.json has an empty scriptId.
    echo.
    echo   1. Open your Apps Script project
    echo   2. Project Settings -^> IDs -^> copy the Script ID
    echo   3. Paste it into .clasp.json
    echo.
    echo   First time only: npm i -g @google/clasp ^&^& clasp login
    echo.
    pause
    goto MENU
)

:: %date% 的格式隨系統地區設定而異（中文 Windows 還會帶星期），
:: 直接叫 PowerShell 取一個固定格式最省事。
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"') do set DESC=%%i

echo [clasp push]
call clasp push --force
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] clasp push failed.
    echo Check: clasp logged in? scriptId correct? ^(clasp login^)
    pause
    goto MENU
)

echo.
echo [clasp deploy]
:: Reusing the same deployment id keeps the /exec URL stable -- that URL is
:: registered as the LINE webhook, so creating a new deployment every time
:: would silently break the bot.
if exist "gas\deployment-id.txt" (
    set /p DEPLOY_ID=<gas\deployment-id.txt
    echo Updating deployment !DEPLOY_ID!
    call clasp deploy -i !DEPLOY_ID! -d "!DESC!"
) else (
    echo No gas\deployment-id.txt found -- creating a NEW deployment.
    echo After it finishes, copy the deployment id into gas\deployment-id.txt
    echo so future deploys update this same URL instead of making new ones.
    echo.
    call clasp deploy -d "!DESC!"
)
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] clasp deploy failed.
    pause
    goto MENU
)

echo.
echo [DONE] Push and deploy completed. (!DESC!)
echo Reminder: the webhook URL only stays the same if you reused a deployment id.
pause
goto MENU

:: -----------------------------------------
:LOCAL_DEV
cls
echo =========================================
echo   Local dev server
echo =========================================
echo.
echo Dev server will open in a new window (http://localhost:3000).
echo Close that window to stop the server.
echo.
start "Next Dev Server" cmd /k "cd /d "%~dp0" && npm run dev"
pause
goto MENU

:: -----------------------------------------
:BUILD
cls
echo =========================================
echo   Type-check + build
echo =========================================
echo.

echo [1/2] tsc --noEmit
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] Type errors found.
    pause
    goto MENU
)

echo.
echo [2/2] next build
call npx next build
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] Build failed.
    pause
    goto MENU
)

echo.
echo [DONE] Type-check and build passed.
pause
goto MENU

:: -----------------------------------------
:GIT_PUSH
cls
echo =========================================
echo   Push to GitHub  (Vercel auto-deploys)
echo =========================================
echo.
call git status --short
echo.
echo Uncommitted changes above will NOT be pushed.
echo Commit them first if they should go out.
echo.
pause
call git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] git push failed.
    pause
    goto MENU
)
echo.
echo [DONE] Pushed. Vercel will build automatically.
pause
goto MENU

:: -----------------------------------------
:END
exit
