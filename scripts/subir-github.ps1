$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$Host.UI.RawUI.WindowTitle = 'Subir para o GitHub'

function Ok($t)    { Write-Host "  [OK] $t"   -ForegroundColor Green }
function Passo($t) { Write-Host "  ... $t"    -ForegroundColor Yellow }
function Erro($t)  { Write-Host "  [ERRO] $t" -ForegroundColor Red }
function Info($t)  { Write-Host "  $t"        -ForegroundColor Gray }

function Parar($mensagem) {
    Write-Host ''
    Erro $mensagem
    Write-Host ''
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
    exit 1
}

# O git usa o stderr para coisas que nao sao falha - "No such remote 'origin'"
# e uma resposta legitima a uma pergunta, nao um erro. Mas com
# ErrorActionPreference = 'Stop' o PowerShell promove qualquer stderr de comando
# nativo a erro fatal, e o script morre no meio de uma simples consulta.
#
# Este wrapper isola isso: baixa a guarda so durante a chamada, devolve $null
# quando o git sai com codigo diferente de zero, e restaura a guarda depois.
function GitConsulta {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $saida = & git @args 2>$null
    } finally {
        $ErrorActionPreference = $antes
    }
    if ($LASTEXITCODE -ne 0) { return $null }
    if ($null -eq $saida) { return $null }
    $texto = ($saida | Out-String).Trim()
    if ($texto -eq '') { return $null }
    return $texto
}

# Nome de pessoa nao e URL nem email. Quando a URL do repositorio e colada por
# engano no campo errado, ela fica gravada no config global e assina todos os
# commits - inclusive de outros projetos.
function NomeSuspeito($n) {
    if (-not $n) { return $true }
    return ($n -match '^https?://') -or ($n -match '\.git$') -or ($n -match '^git@')
}

Clear-Host
Write-Host ''
Write-Host '  ===========================================' -ForegroundColor Cyan
Write-Host '     SUBIR PARA O GITHUB' -ForegroundColor Cyan
Write-Host '  ===========================================' -ForegroundColor Cyan
Write-Host ''

# --- 1. Git instalado? ------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Parar @'
Git nao encontrado.

Instale em https://git-scm.com/download/win (next, next, finish),
FECHE esta janela e clique neste arquivo de novo.
'@
}
Ok "Git $((git --version) -replace 'git version ','')"

# --- 2. Identidade ----------------------------------------------------------
# Sem isso o commit falha com uma mensagem longa e pouco clara.
$nomeGit  = GitConsulta config --global user.name
$emailGit = GitConsulta config --global user.email

if (NomeSuspeito $nomeGit) {
    Write-Host ''
    if ($nomeGit) {
        Info "O nome gravado no Git esta errado: $nomeGit"
        Info 'Isso e uma URL, nao um nome. Provavelmente foi colada no campo'
        Info 'errado numa execucao anterior. Vamos corrigir.'
    } else {
        Info 'O Git ainda nao sabe quem e voce. Isso aparece nos commits.'
    }
    Write-Host ''
    $nomeGit = (Read-Host '  Seu nome (ex: Arthur Maia)').Trim()
    if (NomeSuspeito $nomeGit) { Parar 'Precisa ser um nome, nao uma URL.' }
    git config --global user.name $nomeGit
}

if (-not $emailGit) {
    $emailGit = (Read-Host '  Seu email do GitHub').Trim()
    if ($emailGit -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { Parar "Email invalido: $emailGit" }
    git config --global user.email $emailGit
}
Ok "Identidade: $nomeGit <$emailGit>"

# --- 3. Repositorio ---------------------------------------------------------
if (-not (Test-Path -LiteralPath (Join-Path $raiz '.git'))) {
    Passo 'Criando o repositorio local'
    git init | Out-Null
    git branch -M main
}
Ok 'Repositorio local pronto'

# --- 4. TRAVA DE SEGURANCA --------------------------------------------------
# O .env tem a chave da Anthropic. Se ela entrar num commit, fica no historico
# para sempre: apagar o arquivo depois nao resolve, porque o commit anterior
# continua la e continua acessivel. Por isso a checagem vem ANTES do add, e ela
# aborta em vez de avisar.
Passo 'Conferindo se a chave da Anthropic esta protegida'

$envReal = Join-Path $raiz 'apps\server\.env'
if (Test-Path -LiteralPath $envReal) {
    # check-ignore imprime o caminho quando o arquivo esta ignorado, e sai com
    # codigo 1 sem imprimir nada quando NAO esta. O GitConsulta traduz isso em
    # $null, entao resposta vazia aqui significa arquivo desprotegido.
    $ignorado = GitConsulta check-ignore 'apps/server/.env'
    if (-not $ignorado) {
        Parar @'
O arquivo apps\server\.env NAO esta sendo ignorado pelo Git.

Ele contem sua chave da Anthropic. Subir isso publica a chave, e apagar
depois nao adianta: ela fica no historico do repositorio.

Confira se o .gitignore da pasta tem a linha ".env" e tente de novo.
'@
    }
}

# O 2>$null cala os avisos de "LF will be replaced by CRLF". Eles sao o
# .gitattributes funcionando como deveria nos .bat e .ps1, mas assustam sem
# motivo e escondem o que importa nesta tela.
$antes = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
git add -A 2>$null
$ErrorActionPreference = $antes

# Segunda checagem, agora sobre o que realmente foi preparado para o commit.
# Cinto e suspensorio: o custo do erro aqui e alto demais para confiar em uma
# verificacao so.
$staged = GitConsulta diff --cached --name-only
$staged = if ($staged) { $staged -split "`r?`n" } else { @() }
$suspeitos = $staged | Where-Object { $_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '\.env\.example$' }

if ($suspeitos) {
    Write-Host ''
    foreach ($s in $suspeitos) { Erro "seria commitado: $s" }
    git reset | Out-Null
    Parar 'Abortei antes de commitar. Nenhum arquivo foi enviado.'
}
Ok 'Nenhum .env sera enviado'

# --- 5. O que vai subir -----------------------------------------------------
$total = ($staged | Measure-Object).Count
if ($total -eq 0) {
    Write-Host ''
    Info 'Nada mudou desde o ultimo envio. Ja esta tudo no GitHub.'
    Write-Host ''
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
    exit 0
}
Ok "$total arquivo(s) prontos para enviar"

# --- 6. Remoto ---------------------------------------------------------------
$remoto = GitConsulta remote get-url origin

if (-not $remoto) {
    Write-Host ''
    Write-Host '  Falta dizer para qual repositorio enviar.' -ForegroundColor Cyan
    Write-Host ''
    Info 'Se ainda nao criou: abra https://github.com/new'
    Info 'De um nome, escolha Public ou Private e NAO marque nenhuma das'
    Info 'opcoes de adicionar README, .gitignore ou license.'
    Write-Host ''
    Info 'Depois copie a URL da pagina, algo como:'
    Info '  https://github.com/seu-usuario/seu-repo.git'
    Write-Host ''
    $remoto = (Read-Host '  URL').Trim()

    if ($remoto -notmatch '^https://github\.com/.+/.+' -and $remoto -notmatch '^git@github\.com:.+/.+') {
        Parar "Isso nao parece uma URL de repositorio do GitHub: $remoto"
    }
    git remote add origin $remoto
}
Ok "Destino: $remoto"

# --- 7. Commit e envio ------------------------------------------------------
$mensagem = (Read-Host '  Mensagem do commit (ENTER para "Atualizacao")').Trim()
if (-not $mensagem) { $mensagem = 'Atualizacao' }

# Daqui para baixo a guarda fica desligada de proposito.
#
# O git usa o stderr para narrar o que esta fazendo: o push escreve "Enumerating
# objects", "Writing objects" e a barra de progresso ali, mesmo quando tudo da
# certo. Com ErrorActionPreference = 'Stop', um envio bem-sucedido derrubaria o
# script. Quem decide sucesso ou falha aqui e o codigo de saida, nao o stderr.
$ErrorActionPreference = 'Continue'

Passo 'Commitando'
git commit -m $mensagem 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Parar 'Falha ao commitar. Me mande print do erro acima.' }

Write-Host ''
Passo 'Enviando para o GitHub'
Info 'Na primeira vez, o navegador abre para voce autorizar. E normal.'
Write-Host ''

git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Parar @'
O envio falhou.

Causas comuns:
  - a autorizacao no navegador foi cancelada
  - a URL do repositorio esta errada
  - o repositorio no GitHub nao esta vazio (tem README criado junto)

Me mande print desta janela.
'@
}

Write-Host ''
Ok 'Enviado'
Write-Host ''
Info "Seu codigo esta em: $($remoto -replace '\.git$','')"
Write-Host ''
Info 'Da proxima vez, e so clicar neste arquivo de novo: ele commita e'
Info 'envia o que mudou, sem perguntar a URL.'
Write-Host ''
Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
Read-Host | Out-Null
