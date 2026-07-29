@echo off
setlocal
chcp 65001 >nul
cls
title Processar fila - Design System Ecosystem
cd /d "%~dp0"

REM Processa SOMENTE os jobs que a pessoa escolher, DEPOIS que ela escolher.
REM Nao e watcher, nao e cron, nao e daemon: roda uma vez, so no que foi
REM selecionado, e termina. A fila e acumulativa, entao processar tudo por
REM padrao arrastaria jobs antigos junto - por isso a escolha e obrigatoria.
REM
REM O trabalho roda no Claude Code, ou seja, na SUA ASSINATURA. E esse o ponto
REM do modo queue: o app nao chama a API e nao gasta credito nenhum.
REM
REM Se ANTHROPIC_API_KEY estiver definida no ambiente do Windows, o Claude Code
REM autentica por API key e passa a cobrar por token em vez de usar a
REM assinatura. A chave deste projeto vive em apps/server/.env e so e lida pelo
REM servidor, mas limpamos a variavel aqui por garantia. O setlocal la em cima
REM faz isso valer so nesta janela.
set "ANTHROPIC_API_KEY="

where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Claude Code nao encontrado.
  echo   Instale em: https://claude.com/product/claude-code
  echo.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   pnpm nao encontrado.
  echo   Instale com: npm install -g pnpm
  echo.
  pause
  exit /b 1
)

REM A selecao acontece no scripts/selecionar.ts, que le a fila pelo codigo do
REM projeto (respeitando DS_ECOSYSTEM_ROOT), mostra numerado e devolve os ids
REM escolhidos neste arquivo temporario. Arquivo vazio = cancelado.
set "TMPSEL=%TEMP%\ds-sel-%RANDOM%.txt"
call pnpm exec tsx scripts/selecionar.ts "%TMPSEL%"
if errorlevel 1 (
  del "%TMPSEL%" >nul 2>&1
  echo.
  echo   Nao consegui ler a fila. As dependencias estao instaladas ^(pnpm install^)?
  echo.
  pause
  exit /b 1
)

set "JOBS="
if exist "%TMPSEL%" set /p JOBS=<"%TMPSEL%"
del "%TMPSEL%" >nul 2>&1

if not defined JOBS (
  echo.
  pause
  exit /b 0
)

echo   Processando. Nao feche esta janela.
echo.
echo   Um site ou uma extracao leva minutos. Esta janela pode ficar
echo   quieta durante boa parte do tempo - isso e normal. Acompanhe o
echo   avanco na tela do aplicativo, na barra da fila.
echo.

REM O Claude Code roda por dentro do PowerShell porque precisamos da saida em
REM dois lugares ao mesmo tempo: na tela, para voce acompanhar, e numa variavel,
REM para saber POR QUE ele parou. O Claude Code nao tem exit code proprio para
REM "limite do plano atingido" - isso so aparece no texto da mensagem. Sem ler
REM esse texto, acabar o limite fica identico a qualquer outro erro, e a janela
REM some sem explicar nada.
REM
REM 90 = limite de uso atingido    91 = nao esta logado
powershell -NoProfile -ExecutionPolicy Bypass -Command "& claude -p 'Processe somente os jobs da fila com estes ids: %JOBS%. Ignore qualquer outro job pendente, inclusive os mais antigos: eles ficam na fila de proposito e nao devem ser tocados agora. Siga as instrucoes do CLAUDE.md. Para cada job selecionado: reporte o avanco com pnpm fila:progresso ao terminar cada etapa (a pessoa esta olhando a barra no aplicativo e sem isso acha que travou), execute o trabalho descrito no payload e depois finalize rodando pnpm fila:concluir com o id do job. Nao peca confirmacao e nao pare no meio: va ate o ultimo job selecionado. Se um job falhar, registre o erro e siga para o proximo. Ao terminar, imprima um resumo com os jobs concluidos, os que falharam e o motivo.' --permission-mode bypassPermissions --verbose 2>&1 | Tee-Object -Variable saida; $t = $saida | Out-String; if ($t -match 'hit your .* limit') { exit 90 }; if ($t -match 'Not logged in' -or $t -match 'resolve authentication method') { exit 91 }; exit $LASTEXITCODE"

set "SAIDA=%errorlevel%"

if "%SAIDA%"=="90" goto :semtokens
if "%SAIDA%"=="91" goto :semlogin

if not "%SAIDA%"=="0" (
  echo.
  echo   O Claude Code terminou com erro. A fila foi preservada.
  echo   Tire um print desta janela.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------

REM Zera a fila inteira: o que sobrou de pendente e o historico de processados.
REM A proxima abertura comeca limpa, sem resto da anterior. Isso apaga PEDIDOS,
REM nao trabalho: o que foi extraido fica em vault/ e library/, intocado.
REM
REM So roda depois de um processamento de verdade. Se voce cancelou na tela de
REM escolha, o script saiu la em cima e nada foi apagado - cancelar tem que ser
REM seguro, senao a palavra perde o sentido.
call pnpm exec tsx scripts/fila-limpar.ts tudo

echo.
echo   Pronto. Pode fechar esta janela.
echo.
pause
exit /b 0

REM ---------------------------------------------------------------------------
REM Saidas em que NADA foi processado. Nos dois casos a fila fica intacta: o
REM fila-limpar nao chega a rodar, porque o script termina aqui.
REM ---------------------------------------------------------------------------

:semtokens
echo.
echo   ============================================================
echo.
echo     VOCE NAO POSSUI TOKENS AGORA. VOLTE MAIS TARDE.
echo.
echo     O limite de uso do seu plano acabou, entao nada foi
echo     processado. O horario em que ele volta aparece na
echo     mensagem do Claude Code logo acima.
echo.
echo     Sua fila continua intacta. E so abrir este arquivo de
echo     novo depois que o limite renovar.
echo.
echo   ============================================================
echo.
pause
exit /b 1

:semlogin
echo.
echo   ============================================================
echo.
echo     O CLAUDE CODE NAO ESTA CONECTADO A NENHUMA CONTA.
echo.
echo     Abra um terminal, rode o comando: claude
echo     Faca /login e depois tente por aqui de novo.
echo.
echo     Sua fila continua intacta.
echo.
echo   ============================================================
echo.
pause
exit /b 1
