$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$Host.UI.RawUI.WindowTitle = 'Empacotar para compartilhar'

function Ok($t)    { Write-Host "  [OK] $t"   -ForegroundColor Green }
function Passo($t) { Write-Host "  ... $t"    -ForegroundColor Yellow }
function Erro($t)  { Write-Host "  [ERRO] $t" -ForegroundColor Red }

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
Write-Host '     EMPACOTAR PARA COMPARTILHAR' -ForegroundColor Cyan
Write-Host '  ===========================================' -ForegroundColor Cyan
Write-Host ''

# Compactar a pasta pelo Explorer nao funciona, e o motivo nao e obvio:
#
#   1. node_modules. O pnpm monta as dependencias com junctions que guardam
#      caminho absoluto. O zip desfaz as junctions, e do outro lado sobra uma
#      arvore incompleta que aponta para pastas que nao existem naquela maquina.
#      O app morre com "Cannot find module".
#
#   2. better-sqlite3. E binario nativo, compilado para a versao de Node e a
#      arquitetura de quem instalou. Levar o .node junto quase sempre da errado.
#
#   3. apps/server/.env. Tem a SUA chave da Anthropic. Mandar a pasta inteira
#      por zip e entregar a chave junto, e quem receber gasta no seu nome.
#
#   4. orbis-lojas-shopify/.wrangler. E o estado do miniflare do app de lojas:
#      o banco D1 e o R2 com os ZIPs dos temas que VOCE importou. Ali dentro ha
#      tema comprado, com licenca, e mandar isso junto e redistribuir o tema de
#      outra pessoa sem querer. Quem receber importa os proprios temas.
#
# Este script resolve os quatro: copia o projeto sem essas coisas e zipa o resto.
# Quem receber roda o INICIAR, que instala as dependencias na maquina dele e
# pede a chave dele.

$nome    = Split-Path -Leaf $raiz
$area    = [Environment]::GetFolderPath('Desktop')
$destino = Join-Path $area "$nome.zip"
$temp    = Join-Path $env:TEMP "ds-pack-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"

Passo 'Copiando o projeto sem as partes que nao viajam'

# robocopy devolve 0-7 para sucesso (8+ e falha de verdade). O /NJH /NJS tira
# o cabecalho e o resumo, que so poluem.
$saida = robocopy $raiz $temp /E /NFL /NDL /NJH /NJS /NP `
    /XD node_modules .turbo .git dist coverage .wrangler .vinext .next `
    /XF .env .env.local *.tsbuildinfo *.log

if ($LASTEXITCODE -ge 8) {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    Parar "Falha ao copiar os arquivos (robocopy $LASTEXITCODE)."
}

# Conferencia explicita: se a chave escapou, o zip nao sai. Vale a paranoia,
# porque o custo do erro e a chave de outra pessoa vazando.
$vazou = Get-ChildItem -LiteralPath $temp -Recurse -Force -File -Filter '.env' -ErrorAction SilentlyContinue
if ($vazou) {
    foreach ($arq in $vazou) { Remove-Item -LiteralPath $arq.FullName -Force }
    Ok 'Removi um .env que escapou da copia'
}

Ok 'Projeto copiado'

if (Test-Path -LiteralPath $destino) {
    Remove-Item -LiteralPath $destino -Force
}

Passo 'Compactando'
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $destino -CompressionLevel Optimal
Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue

$mb = [math]::Round((Get-Item -LiteralPath $destino).Length / 1MB, 1)
Ok "Pronto: $mb MB"

Write-Host ''
Write-Host '  -------------------------------------------' -ForegroundColor DarkGray
Write-Host ''
Write-Host "  Arquivo: $destino" -ForegroundColor White
Write-Host ''
Write-Host '  Nao vai junto: node_modules, .env (sua chave), dist, .turbo, .git' -ForegroundColor Gray
Write-Host '                 e .wrangler (os temas Shopify que voce importou)' -ForegroundColor Gray
Write-Host ''
Write-Host '  Diga para quem receber:' -ForegroundColor Cyan
Write-Host '    1. Extrair o zip em qualquer pasta' -ForegroundColor Gray
Write-Host '    2. Instalar o Node.js LTS se ainda nao tiver (nodejs.org)' -ForegroundColor Gray
Write-Host '    3. Duplo clique no INICIAR.bat' -ForegroundColor Gray
Write-Host ''
Write-Host '  O INICIAR instala o resto sozinho e pede a chave da Anthropic.' -ForegroundColor Gray
Write-Host ''
Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
Read-Host | Out-Null
