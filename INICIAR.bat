@echo off
title Design System Ecosystem
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1"
if errorlevel 1 (
  echo.
  echo Algo deu errado ao iniciar. Tire um print desta janela.
  pause
)
