@echo off
:: Everything in this file stays ASCII on purpose. A Windows console renders it
:: through whatever codepage it happens to be on, so non-ASCII text turns into
:: mojibake on a machine other than the one it was written on. Staying ASCII
:: also means no chcp call is needed.
::
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
echo   -- Local --
echo   2. Local dev server    (npm run dev)
echo   3. Type-check + build  (tsc + next build)
echo.
echo   -- Deploy --
echo   1. GAS push + deploy   (LINE relay)
echo   4. Push to GitHub      (Vercel auto-deploys)
echo.
echo   -- Check --
echo   5. Verify GAS webhook url is unchanged
echo.
echo   6. Exit
echo.
set /p CHOICE=Select [1-6]:

if "%CHOICE%"=="1" goto GAS_DEPLOY
if "%CHOICE%"=="2" goto LOCAL_DEV
if "%CHOICE%"=="3" goto BUILD
if "%CHOICE%"=="4" goto GIT_PUSH
if "%CHOICE%"=="5" goto GAS_URL_CHECK
if "%CHOICE%"=="6" goto END
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

:: The format of %date% follows the system locale (a Chinese Windows install
:: even prefixes the weekday), so parsing it produces a malformed timestamp.
:: Asking PowerShell for a fixed format sidesteps the whole problem.
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
echo The webhook URL only stays the same if a deployment id was reused.
echo Not sure? Run option 5 to verify it.
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
:GAS_URL_CHECK
cls
echo =========================================
echo   Verify GAS webhook url is unchanged
echo =========================================
echo.
:: The web app url is derived from the deployment id:
::   https://script.google.com/macros/s/<deployment id>/exec
:: So "did the url change?" is the same question as "does the id pinned in
:: gas\deployment-id.txt still exist on the server?".
::
:: This option only reads. It never pushes and never deploys.

:: The redirection has to sit inside a parenthesised block. On a single line
:: (`if exist x set /p V=<file`) cmd parses the `<` before the if and dies with
:: "The syntax of the command is incorrect."
set "PINNED_ID="
if exist "gas\deployment-id.txt" (
    set /p PINNED_ID=<gas\deployment-id.txt
)

if defined PINNED_ID (
    echo Pinned id ^(gas\deployment-id.txt^):
    echo   !PINNED_ID!
    echo.
    echo Expected webhook URL:
    echo   https://script.google.com/macros/s/!PINNED_ID!/exec
) else (
    echo [WARN] gas\deployment-id.txt is missing or empty, so nothing is pinned
    echo        and every deploy creates a brand new url.
)
echo.

echo Reading deployments from the server...
set "TMPLIST=%TEMP%\gas-deployments-%RANDOM%.txt"
call clasp list-deployments > "!TMPLIST!" 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [FAILED] Could not list deployments.
    type "!TMPLIST!"
    del "!TMPLIST!" > nul 2>&1
    echo.
    echo Check: clasp logged in? ^(clasp login^)  scriptId correct?
    pause
    goto MENU
)

echo.
type "!TMPLIST!"
echo.

:: Matching with findstr rather than parsing tokens: clasp's line format has
:: changed between versions, but "does this id appear at all" stays reliable.
:: @HEAD is always present -- it tracks the latest saved code and is not the
:: deployment LINE points at, so it is ignored here.
if not defined PINNED_ID goto URL_NOPIN
findstr /C:"!PINNED_ID!" "!TMPLIST!" > nul
if %errorlevel% equ 0 (
    del "!TMPLIST!" > nul 2>&1
    echo [OK] The pinned deployment still exists.
    echo      The webhook URL has NOT changed -- nothing to do in LINE.
    goto URL_DONE
)

del "!TMPLIST!" > nul 2>&1
echo [ALERT] The pinned deployment id was NOT found on the server.
echo         The LINE bot is pointing at a url that no longer exists, or at
echo         stale code. Fix it one of two ways:
echo.
echo           a^) copy the correct id from the list above into
echo              gas\deployment-id.txt, then run this check again, or
echo           b^) paste the new /exec url into LINE Developers -^>
echo              Messaging API -^> Webhook URL
goto URL_DONE

:URL_NOPIN
del "!TMPLIST!" > nul 2>&1
echo [ACTION] Pick the deployment that LINE points at from the list above and
echo          save its id into gas\deployment-id.txt ^(one line, no quotes^).
echo          After that, option 1 keeps the url stable.

:URL_DONE
echo.
echo Compare against: LINE Developers Console -^> your channel -^>
echo   Messaging API -^> Webhook URL
pause
goto MENU

:: -----------------------------------------
:END
exit
