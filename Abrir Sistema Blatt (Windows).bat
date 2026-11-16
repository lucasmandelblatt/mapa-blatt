@echo off
chcp 65001 >nul
title Sistema Blatt
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Precisa do Node.js instalado. Baixe a versao LTS em https://nodejs.org
  echo  Depois de instalar, de dois cliques neste arquivo de novo.
  echo.
  pause
  exit /b 1
)

curl -s -o nul http://localhost:4747/api/info >nul 2>nul
if not errorlevel 1 (
  start "" http://localhost:4747
  exit /b 0
)

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:4747"
echo.
echo  Sistema Blatt aberto no navegador.
echo  Deixe esta janela aberta enquanto usa. Fechar esta janela desliga o sistema.
echo.
node server.mjs
pause
