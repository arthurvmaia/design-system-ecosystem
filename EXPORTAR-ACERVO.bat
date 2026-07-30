@echo off
setlocal
chcp 65001 >nul
cls
title Orbis - Exportar acervo
cd /d "%~dp0"

REM Junta vault, biblioteca, sites e o banco num zip na Area de Trabalho,
REM para levar o acervo a outra maquina. Cache, fila e chave de API ficam
REM de fora. Quem recebe usa o IMPORTAR-ACERVO.bat.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   pnpm nao encontrado. Rode o INICIAR.bat uma vez primeiro.
  echo.
  pause
  exit /b 1
)

call pnpm exec tsx scripts/acervo-exportar.ts
echo.
pause
