# Levanta o link publico para os socios.
#
# Compila o app, sobe o servidor e abre o tunel da Cloudflare. Ao fim imprime o
# endereco que voce manda para eles.
#
# ENQUANTO ESTA JANELA ESTIVER ABERTA, o link responde. Fechar a janela ou
# apertar Ctrl+C derruba tudo — e o DERRUBAR.bat faz o mesmo de fora.
#
# O endereco e sorteado a cada vez. Levantar de novo depois de derrubar da um
# endereco NOVO, e o antigo nao volta: quem tinha o link velho nao entra mais
# nem sabendo a senha.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$Host.UI.RawUI.WindowTitle = 'Orbis - link publico'

function Titulo($texto) { Write-Host ''; Write-Host "  $texto" -ForegroundColor Cyan; Write-Host '' }
function Ok($texto)     { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Erro($texto)   { Write-Host "  [ERRO] $texto" -ForegroundColor Red }

function Parar($mensagem) {
    Write-Host ''
    Erro $mensagem
    Write-Host ''
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
    exit 1
}

Clear-Host
Write-Host ''
Write-Host '  ===========================================' -ForegroundColor Cyan
Write-Host '     O R B I S   ·   link publico' -ForegroundColor Cyan
Write-Host '  ===========================================' -ForegroundColor Cyan

# --- 1. O ambiente ----------------------------------------------------------
Titulo 'Conferindo o que preciso'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Parar @'
Node.js nao esta instalado.

Baixe a versao LTS em https://nodejs.org e rode este arquivo de novo.
'@
}
Ok 'Node.js'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Parar @'
O pnpm nao esta instalado.

Abra o PowerShell e rode:  npm install -g pnpm
'@
}
Ok 'pnpm'

# O winget instala o cloudflared em Program Files, e o PATH so passa a inclui-lo
# na PROXIMA janela. Sem isto, quem instalou e rodou na mesma sessao levava um
# "nao instalado" com ele instalado.
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    $candidatos = @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )
    $achado = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($achado) {
        $env:Path = "$env:Path;$(Split-Path -Parent $achado)"
    } else {
        Parar @'
Preciso do cloudflared, e ele nao esta instalado.

Abra o PowerShell COMO ADMINISTRADOR e rode:

    winget install --id Cloudflare.cloudflared

Depois rode este arquivo de novo. E um programa so, sem conta e sem cartao.
'@
    }
}
Ok 'cloudflared'

# --- 2. As credenciais ------------------------------------------------------
$arquivoEnv = Join-Path $raiz 'apps\server\.env'
if (-not (Test-Path $arquivoEnv)) {
    Parar @'
Nao achei apps/server/.env.

Copie apps/server/.env.example para apps/server/.env e preencha a ORBIS_SENHA
antes de abrir o app para alguem.
'@
}

$conteudo = Get-Content $arquivoEnv -Raw
if ($conteudo -notmatch '(?m)^\s*ORBIS_SENHA\s*=\s*\S') {
    Parar @'
O .env existe, mas a ORBIS_SENHA esta vazia.

Nao vou abrir este app sem credencial: qualquer pessoa que achasse o endereco
entraria no seu acervo. Preencha ORBIS_SENHA em apps/server/.env.
'@
}
Ok 'ORBIS_SENHA (a sua, faz tudo)'

if ($conteudo -match '(?m)^\s*ORBIS_SENHA_VISITA\s*=\s*\S') {
    Ok 'ORBIS_SENHA_VISITA (a dos socios: veem tudo, mudam nada)'
} else {
    Write-Host ''
    Write-Host '  [ATENCAO] Nao ha credencial de visita configurada.' -ForegroundColor Yellow
    Write-Host '  Quem entrar vai poder MUDAR o seu acervo: excluir captura,' -ForegroundColor Yellow
    Write-Host '  apagar kit, tudo. Para convidar alguem so para olhar, defina' -ForegroundColor Yellow
    Write-Host '  ORBIS_SENHA_VISITA em apps/server/.env e rode de novo.' -ForegroundColor Yellow
}

if ($conteudo -match '(?m)^\s*ORBIS_SENHA_ACAO\s*=\s*\S') {
    Ok 'ORBIS_SENHA_ACAO (pedida a cada Extrair e Gerar site)'
}

# --- 3. A porta ------------------------------------------------------------
#
# Antes de compilar, e nao depois. O `pnpm publicar` ja recusa publicar com a
# porta ocupada, mas so descobre isso no fim: a pessoa espera um minuto de
# compilacao para levar um erro que dava para dar no primeiro segundo.
#
# O caso comum e inocente: o INICIAR aberto noutra janela.
$porta = if ($env:PORT) { [int]$env:PORT } else { 8787 }
$ocupada = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($ocupada) {
    Write-Host ''
    Write-Host "  [ATENCAO] Ja tem algo escutando na porta $porta." -ForegroundColor Yellow
    Write-Host '  Provavelmente o INICIAR aberto noutra janela. Preciso dessa' -ForegroundColor Yellow
    Write-Host '  porta para o link publico.' -ForegroundColor Yellow
    Write-Host ''
    $resposta = Read-Host '  Fecho o que esta la para levantar o link? (S/N)'
    if ($resposta -match '^[Ss]') {
        $pids = $ocupada | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $pids) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        Ok "Porta $porta liberada"
    } else {
        Write-Host ''
        Write-Host '  Tudo bem. Feche a outra janela e rode este arquivo de novo.' -ForegroundColor DarkGray
        Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
        Read-Host | Out-Null
        exit 0
    }
}

# --- 4. Levantar ------------------------------------------------------------
Titulo 'Levantando. Isso leva cerca de um minuto.'
Write-Host '  O endereco aparece aqui embaixo quando estiver pronto.' -ForegroundColor DarkGray
Write-Host '  Deixe esta janela ABERTA: e ela que mantem o link no ar.' -ForegroundColor DarkGray
Write-Host ''

pnpm publicar

# So chega aqui se o `pnpm publicar` terminar (Ctrl+C, erro, ou o tunel caiu).
Write-Host ''
Write-Host '  O link saiu do ar.' -ForegroundColor DarkGray
Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
Read-Host | Out-Null
