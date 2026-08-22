@echo off
echo ============================================
echo   Weave - Organisational Change Visualiser
echo ============================================
echo.

:: Try XAMPP PHP first, then system PHP
if exist "C:\xampp\php\php.exe" (
    set PHP_BIN=C:\xampp\php\php.exe
) else (
    where php >nul 2>nul
    if %errorlevel%==0 (
        set PHP_BIN=php
    ) else (
        echo ERROR: PHP not found!
        echo.
        echo Install XAMPP from https://www.apachefriends.org/
        echo or add PHP to your system PATH.
        echo.
        pause
        exit /b 1
    )
)

echo Starting server at http://localhost:8000
echo Press Ctrl+C to stop the server.
echo.
start http://localhost:8000
%PHP_BIN% -S localhost:8000 router.php
pause
