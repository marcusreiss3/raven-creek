@echo off
title Raven Creek
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instalando via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js instalado. Feche esta janela e de dois cliques em INICIAR.bat novamente.
  pause
  exit /b
)
node iniciar-local.mjs
pause
