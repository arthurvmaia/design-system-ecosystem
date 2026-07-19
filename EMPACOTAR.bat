@echo off
title Empacotar para compartilhar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\empacotar.ps1"
if errorlevel 1 (
  echo.
  echo Algo deu errado ao empacotar. Tire um print desta janela.
  pause
)
