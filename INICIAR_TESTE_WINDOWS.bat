@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ nao encontrado. Instale Node.js para executar a versao web local.
  pause
  exit /b 1
)
echo Conexao Talentos - MODO DE TESTE LOCAL
start "" "http://127.0.0.1:3000"
node server.js
pause
