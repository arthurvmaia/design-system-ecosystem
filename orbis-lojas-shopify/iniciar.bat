@echo off
title Orbis - Criacao de Lojas Shopify
cd /d "%~dp0"

echo ============================================
echo  Iniciando o Orbis - Criacao de Lojas Shopify...
echo  Aguarde, o navegador abrira sozinho.
echo ============================================

rem Abre o navegador apos alguns segundos, em paralelo ao servidor
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

rem Sobe o servidor de desenvolvimento (deixe esta janela aberta)
npm run dev
pause
