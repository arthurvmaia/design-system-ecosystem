# Levanta o endereco publico que a Shopify precisa para falar com este app.
#
# Duas coisas dependem dele, e nenhuma funciona com localhost: o OAuth (a
# Shopify REDIRECIONA o cliente de volta) e a instalacao do tema (ela BAIXA o
# ZIP de uma URL). Rodando nesta maquina, o tunel e o que da esse endereco.
#
# O endereco de um quick tunnel e SORTEADO a cada vez. Isso obriga a leva-lo a
# dois lugares, e esquecer um deles da um erro que parece defeito de codigo:
#
#   1. ORBIS_PUBLIC_URL no .dev.vars   -> este script faz sozinho
#   2. as URLs do app no Dev Dashboard -> so voce pode fazer; ele imprime prontas
#
# E o servidor sobe DEPOIS de o arquivo ser escrito, de proposito: variavel de
# ambiente nao recarrega sozinha, e um servidor que ja estava de pe continuaria
# usando o endereco velho.
#
# ENQUANTO ESTA JANELA ESTIVER ABERTA, o endereco responde. Fechar derruba tudo.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$Host.UI.RawUI.WindowTitle = 'Orbis - lojas Shopify - endereco publico'

function Titulo($t) { Write-Host ''; Write-Host "  $t" -ForegroundColor Cyan; Write-Host '' }
function Ok($t)     { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "  [ATENCAO] $t" -ForegroundColor Yellow }

function Parar($mensagem) {
    Write-Host ''
    Write-Host "  [ERRO] $mensagem" -ForegroundColor Red
    Write-Host ''
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
    exit 1
}

Clear-Host
Write-Host ''
Write-Host '  ===========================================' -ForegroundColor Cyan
Write-Host '     O R B I S   .   lojas Shopify' -ForegroundColor Cyan
Write-Host '  ===========================================' -ForegroundColor Cyan

# --- 1. O que preciso ---------------------------------------------------------
Titulo 'Conferindo o que preciso'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Parar 'Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org.'
}
Ok 'Node.js'

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
        Parar 'Preciso do cloudflared e ele nao esta instalado. Abra o PowerShell COMO ADMINISTRADOR e rode:  winget install --id Cloudflare.cloudflared'
    }
}
Ok 'cloudflared'

$arquivoVars = Join-Path $raiz '.dev.vars'
if (-not (Test-Path $arquivoVars)) {
    Parar 'Nao achei o .dev.vars. Ele guarda as credenciais do app Shopify.'
}
Ok '.dev.vars'

# --- 2. A porta ---------------------------------------------------------------
$porta = 3000
$ocupada = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($ocupada) {
    Write-Host ''
    Aviso "Ja tem algo escutando na porta $porta (provavelmente o iniciar.bat noutra janela)."
    $resposta = Read-Host '  Fecho o que esta la? (S/N)'
    if ($resposta -match '^[Ss]') {
        $pids = $ocupada | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $pids) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
        Ok "Porta $porta liberada"
    } else {
        Write-Host ''
        Write-Host '  Tudo bem. Feche a outra janela e rode este arquivo de novo.' -ForegroundColor DarkGray
        Read-Host | Out-Null
        exit 0
    }
}

# --- 3. O tunel ---------------------------------------------------------------
Titulo 'Levantando o endereco publico'

$log = Join-Path $env:TEMP ('orbis-tunel-' + [guid]::NewGuid().ToString('N') + '.log')
$saida = "$log.out"
$tunel = Start-Process -FilePath 'cloudflared' -ArgumentList 'tunnel', '--url', "http://localhost:$porta", '--no-autoupdate' -RedirectStandardError $log -RedirectStandardOutput $saida -NoNewWindow -PassThru

try {
    $endereco = ''
    foreach ($tentativa in 1..40) {
        Start-Sleep -Milliseconds 1500
        if (Test-Path $log) {
            $texto = Get-Content $log -Raw -ErrorAction SilentlyContinue
            if ($texto -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                $endereco = $Matches[0]
                break
            }
        }
        if ($tunel.HasExited) { break }
    }
    if (-not $endereco) {
        Parar 'O tunel nao subiu. Confira sua conexao e tente de novo.'
    }
    Ok "Endereco: $endereco"

    # --- 4. Lugar 1: o arquivo ------------------------------------------------
    #
    # A troca e so do VALOR: as credenciais e os comentarios ficam byte a byte
    # como estavam, e o CRLF do arquivo tambem. Reescrever o arquivo inteiro
    # arriscaria a chave secreta, que e o que ele tem de mais sensivel.
    $conteudo = [System.IO.File]::ReadAllText($arquivoVars)
    if ($conteudo -match '(?m)^ORBIS_PUBLIC_URL=') {
        $novo = [regex]::Replace($conteudo, '(?m)^ORBIS_PUBLIC_URL=[^\r\n]*', "ORBIS_PUBLIC_URL=$endereco")
    } else {
        $novo = $conteudo.TrimEnd() + "`r`n" + "ORBIS_PUBLIC_URL=$endereco" + "`r`n"
    }
    [System.IO.File]::WriteAllText($arquivoVars, $novo, (New-Object System.Text.UTF8Encoding($false)))
    Ok 'ORBIS_PUBLIC_URL gravado no .dev.vars'

    # --- 5. Lugar 2: o Dev Dashboard -----------------------------------------
    Titulo 'AGORA E COM VOCE: dois campos no Dev Dashboard da Shopify'
    Write-Host '  Sem isto o cliente nao consegue conectar a loja dele: a Shopify' -ForegroundColor DarkGray
    Write-Host '  recusa devolver a autorizacao num endereco que nao esta' -ForegroundColor DarkGray
    Write-Host '  registrado, e o erro nao diz que e isso.' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  URL do app' -ForegroundColor Cyan
    Write-Host "      $endereco"
    Write-Host ''
    Write-Host '  URL(s) de redirecionamento permitida(s)' -ForegroundColor Cyan
    Write-Host "      $endereco/api/shopify/retorno"
    Write-Host ''
    Write-Host '  Os dois precisam do MESMO host. Se o painel pedir para criar ou' -ForegroundColor DarkGray
    Write-Host '  publicar uma versao depois de salvar, publique: configuracao de' -ForegroundColor DarkGray
    Write-Host '  app e versionada, e salvar sem publicar nao vale.' -ForegroundColor DarkGray

    # --- 6. O servidor, por ultimo -------------------------------------------
    Titulo 'Subindo o app (deixe esta janela ABERTA)'
    Write-Host '  Ele sobe agora, e nao antes, porque variavel de ambiente nao' -ForegroundColor DarkGray
    Write-Host '  recarrega sozinha: um servidor ja de pe usaria o endereco velho.' -ForegroundColor DarkGray
    Write-Host ''

    npm run dev
} finally {
    if ($tunel -and -not $tunel.HasExited) {
        Stop-Process -Id $tunel.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $log, $saida -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '  O endereco publico saiu do ar.' -ForegroundColor DarkGray
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
}
