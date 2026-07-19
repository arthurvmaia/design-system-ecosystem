@echo off
title Subir para o GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\subir-github.ps1"
if errorlevel 1 (
  echo.
  echo Algo deu errado. Tire um print desta janela.
  pause
)
