@echo off
setlocal
chcp 65001 >nul
cls
title Importar acervo - Design System Ecosystem
cd /d "%~dp0"

REM Importa um acervo exportado noutra maquina (EXPORTAR-ACERVO.bat).
REM Pode arrastar o zip para cima deste arquivo, ou so dar duplo clique:
REM ele procura o zip na Area de Trabalho e em Downloads.
REM Se ja existir acervo aqui, ele vira backup - nada e apagado.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   pnpm nao encontrado. Rode o INICIAR.bat uma vez primeiro.
  echo.
  pause
  exit /b 1
)

call pnpm exec tsx scripts/acervo-importar.ts "%~1"
echo.
pause
