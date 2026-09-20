@echo off
title Jev OS Voice and Browser Remote Controller
cd /d "C:\Users\andre\Desktop\Jev-project"
cls
echo ============================================================
echo   JEV UNIVERSAL OS AND BROWSER REMOTE CONTROLLER
echo ============================================================
echo.
echo Dashboard attiva su: http://localhost:3000
echo Lascia aperta questa finestra mentre usi il controller.
echo.
"C:\Program Files\nodejs\node.exe" "C:\Users\andre\Desktop\Jev-project\dist\server.js"
pause
