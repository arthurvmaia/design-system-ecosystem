@echo off
title Orbis - derrubar o link publico
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\derrubar.ps1"
if errorlevel 1 (
  echo.
  echo Algo deu errado. Tire um print desta janela.
  pause
)
