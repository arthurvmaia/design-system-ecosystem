$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$Host.UI.RawUI.WindowTitle = 'Orbis'

function Titulo($texto) {
    Write-Host ''
    Write-Host "  $texto" -ForegroundColor Cyan
    Write-Host ''
}
function Ok($texto)     { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Passo($texto)  { Write-Host "  ... $texto" -ForegroundColor Yellow }
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
Write-Host '     O R B I S' -ForegroundColor Cyan
Write-Host '     design system  .  lojas shopify  .  criativos' -ForegroundColor DarkGray
Write-Host '  ===========================================' -ForegroundColor Cyan

# --- 1. Node.js -------------------------------------------------------------
Titulo 'Verificando o ambiente'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Parar @'
Node.js nao esta instalado.

Baixe a versao LTS em https://nodejs.org
Instale, feche esta janela e clique no INICIAR de novo.
'@
}

$versaoNode = (node --version) -replace 'v', ''
$major = [int]($versaoNode -split '\.')[0]
if ($major -lt 20) {
    Parar "Node.js $versaoNode e antigo demais. Instale a versao LTS em https://nodejs.org"
}
Ok "Node.js $versaoNode"

# --- 2. pnpm ----------------------------------------------------------------
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Passo 'Instalando o pnpm (primeira vez, ~30s)'
    npm install -g pnpm@9.15.0 2>&1 | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Parar 'O pnpm foi instalado mas nao foi encontrado. Feche esta janela e clique no INICIAR de novo.'
    }
}
Ok "pnpm $(pnpm --version)"

# --- 3. Dependencias --------------------------------------------------------
# O pnpm liga cada dependencia com uma junction que guarda CAMINHO ABSOLUTO.
# Se a pasta do projeto for movida, copiada ou renomeada, todas as ligacoes
# continuam apontando para o lugar antigo e o app morre logo no inicio com
# "Cannot find module ...\node_modules\turbo\bin\turbo".
# Detectamos isso aqui e refazemos a instalacao sozinhos, entao o projeto roda
# de qualquer pasta do computador.

function MotivoParaReinstalar {
    $nm = Join-Path $raiz 'node_modules'

    if (-not (Test-Path -LiteralPath $nm)) {
        return 'primeira vez nesta pasta'
    }

    # --- Instalacao vinda de outro computador (zip) -------------------------
    # Este e o caso que mais quebra na pratica: alguem compacta a pasta inteira
    # com node_modules dentro e manda para outra pessoa.
    #
    # Ao compactar, o Windows desfaz as junctions do pnpm - vira pasta comum ou
    # some. Do outro lado, as checagens abaixo passam (as pastas existem, os
    # arquivos-sonda existem) mas o conteudo esta incompleto ou apontando para
    # um caminho que nao existe naquela maquina, e o app morre com erro de
    # modulo nao encontrado.
    #
    # O .modules.yaml e a prova documental: o pnpm grava ali o caminho ABSOLUTO
    # do virtual store daquela instalacao. Se ele nao esta dentro desta pasta,
    # esta instalacao nasceu em outro lugar e nao serve aqui.
    $modulesYaml = Join-Path $nm '.modules.yaml'
    if (Test-Path -LiteralPath $modulesYaml) {
        $linha = Select-String -LiteralPath $modulesYaml -Pattern '^\s*virtualStoreDir:\s*(.+)$' |
                 Select-Object -First 1
        if ($linha) {
            $store = $linha.Matches[0].Groups[1].Value.Trim().Trim("'", '"')
            # Caminho relativo significa instalacao local a esta pasta: ok.
            if ([System.IO.Path]::IsPathRooted($store) -and
                -not $store.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)) {
                return 'estas dependencias vieram de outro computador'
            }
        }
    } else {
        # node_modules sem .modules.yaml nao foi produzido por um pnpm install
        # saudavel. Quase sempre e resto de zip.
        return 'a pasta node_modules esta corrompida'
    }

    # Cuidado: Test-Path numa junction quebrada devolve $true, porque o link em
    # si existe. Quem denuncia a mudanca de pasta e o alvo do link.
    foreach ($link in Get-ChildItem -LiteralPath $nm -Force -Directory -ErrorAction SilentlyContinue) {
        $alvo = @($link.Target)[0]
        if ($alvo -and -not $alvo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)) {
            return 'a pasta do projeto mudou de lugar'
        }
    }

    # Sondas: arquivos que o "pnpm dev" precisa alcancar de verdade.
    foreach ($sonda in @('turbo\bin\turbo', 'typescript\package.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $nm $sonda))) {
            return 'a instalacao anterior ficou incompleta'
        }
    }

    # O better-sqlite3 e binario nativo, compilado para um Node e uma
    # arquitetura especificos. Um zip carrega o .node de quem compactou, que
    # pode nao servir aqui. Carregar e a unica forma honesta de saber.
    #
    # A sonda aponta para dentro do packages\indexer porque e de la que a
    # dependencia e declarada. O pnpm nao ica nada para a raiz, entao procurar
    # em node_modules\better-sqlite3 nunca achava nada e o teste inteiro era
    # pulado - justamente no caso que este bloco existe para pegar.
    #
    # O caminho vai por argv em vez de embutido no -e: caminho do Windows tem
    # barra invertida, que dentro de uma string JS viraria escape.
    #
    # O try/catch fica dentro do node de proposito. Assim a falha vira codigo
    # de saida e nada e escrito no stderr - redirecionar stderr de um exe no
    # PowerShell 5.1, com ErrorActionPreference = Stop, derruba o script em vez
    # de deixar a mensagem amigavel daqui aparecer.
    $probe = Join-Path $raiz 'packages\indexer\node_modules\better-sqlite3'
    if (Test-Path -LiteralPath $probe) {
        node -e "try { require(process.argv[1]); process.exit(0) } catch (e) { process.exit(1) }" "$probe" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            return 'o modulo nativo do banco nao roda nesta maquina'
        }
    }

    return $null
}

function LimparInstalacao {
    $alvos = @(Join-Path $raiz 'node_modules')
    foreach ($grupo in @('apps', 'packages')) {
        $dir = Join-Path $raiz $grupo
        if (Test-Path -LiteralPath $dir) {
            foreach ($sub in Get-ChildItem -LiteralPath $dir -Directory) {
                $alvos += Join-Path $sub.FullName 'node_modules'
            }
        }
    }
    foreach ($alvo in $alvos) {
        # rmdir apaga a junction em si; nunca segue para o conteudo do alvo.
        if (Test-Path -LiteralPath $alvo) { cmd /c rmdir /s /q "$alvo" }
    }

    # Caches indexados por caminho absoluto ficam invalidos pelo mesmo motivo.
    # Roda depois do node_modules sumir, senao a varredura entra nele e demora.
    Get-ChildItem -LiteralPath $raiz -Recurse -Force -Directory -Filter '.turbo' -ErrorAction SilentlyContinue |
        ForEach-Object { cmd /c rmdir /s /q "$($_.FullName)" }
    Get-ChildItem -LiteralPath $raiz -Recurse -Force -File -Filter '*.tsbuildinfo' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
}

$motivo = MotivoParaReinstalar
if ($motivo) {
    Passo "Preparando as dependencias - $motivo (1-2 min)"
    LimparInstalacao
    pnpm install
    if ($LASTEXITCODE -ne 0) { Parar 'Falha ao instalar as dependencias. Me mande print do erro acima.' }

    $restou = MotivoParaReinstalar
    if ($restou) { Parar "A instalacao terminou, mas $restou. Me mande print desta janela." }
}
Ok 'Dependencias instaladas'

# --- 4. Chave da Anthropic (so no modo api) ---------------------------------
# No modo `queue` (padrao do MVP) o trabalho roda no Claude Code pela SUA
# ASSINATURA e a chave da Anthropic NUNCA e lida pelo app. Pedir uma chave no
# primeiro inicio so travava quem so quer rodar o MVP - inclusive um amigo que
# recebeu o projeto e nao tem chave nenhuma. Entao a chave so e exigida quando o
# .env esta explicitamente em EXECUTION_MODE=api (producao, que consome creditos).
$envPath      = Join-Path $raiz 'apps\server\.env'
$exemploPath  = Join-Path $raiz 'apps\server\.env.example'

if (-not (Test-Path $envPath)) {
    Copy-Item $exemploPath $envPath
}

# Le e grava sempre em UTF-8 sem BOM. O padrao do PowerShell 5.1 e outro
# (ANSI na leitura, UTF-8 com BOM na escrita), e isso corrompe os acentos dos
# comentarios do .env um pouco mais a cada execucao.
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)
$conteudo = [System.IO.File]::ReadAllText($envPath, [System.Text.Encoding]::UTF8)
$modoApi = $conteudo -match '(?m)^\s*EXECUTION_MODE\s*=\s*api\b'

if ($modoApi) {
    $temChave = $conteudo -match '(?m)^ANTHROPIC_API_KEY=\s*sk-'
    if (-not $temChave) {
        Titulo 'Configurando a chave da Anthropic'
        Write-Host '  Cole abaixo a chave da API da Anthropic (comeca com sk-ant-).' -ForegroundColor Gray
        Write-Host '  Voce pega em: https://console.anthropic.com/settings/keys' -ForegroundColor Gray
        Write-Host ''
        $chave = (Read-Host '  Chave').Trim()

        if ($chave -notmatch '^sk-ant-') {
            Parar 'Essa chave nao parece valida (precisa comecar com sk-ant-). Clique no INICIAR de novo.'
        }

        $conteudo = $conteudo -replace '(?m)^ANTHROPIC_API_KEY=.*$', "ANTHROPIC_API_KEY=$chave"
        [System.IO.File]::WriteAllText($envPath, $conteudo, $utf8SemBom)
        Ok 'Chave salva'
    }
    Ok 'Chave da Anthropic configurada'
} else {
    Ok 'Modo assinatura (queue) - nao precisa de chave da Anthropic'
}

# --- 5. Banco de dados ------------------------------------------------------
$dbPath = Join-Path $env:USERPROFILE 'design-system-ecosystem\ecosystem.db'
if (-not (Test-Path $dbPath)) {
    Passo 'Criando o banco de dados (so na primeira vez)'
    pnpm db:migrate
    if ($LASTEXITCODE -ne 0) { Parar 'Falha ao criar o banco. Me mande print do erro acima.' }
}
Ok 'Banco de dados pronto'

# --- Abre o app numa janela propria, com o som liberado ---------------------
#
# O 'Start-Process http://...' entrega a URL ao navegador padrao e pronto. O
# problema aparece na abertura: o navegador cria o AudioContext SUSPENSO ate
# haver um gesto do usuario, entao a voz do Orbis e a ignicao so tocavam depois
# que a pessoa clicava na aba. Quem acabou de dar dois cliques no INICIAR nao
# entende por que precisa de um terceiro para ouvir.
#
# Como e o nosso .bat que abre o navegador, da para pedir a liberacao na
# origem: '--autoplay-policy=no-user-gesture-required'.
#
# Duas decisoes que fazem isso funcionar de verdade:
#
# 1. PERFIL PROPRIO ('--user-data-dir'). Sem ele, se o Chrome ja estiver aberto
#    a nova invocacao so repassa a URL para o processo existente e IGNORA todas
#    as flags. Com perfil proprio sobe um processo separado, que obedece.
# 2. MODO APP ('--app='). Janela sem barra de endereco nem abas. O app local
#    passa a parecer um programa, nao um site aberto por acaso.
#
# Sem Chrome nem Edge, cai para o navegador padrao: o app funciona igual, so
# que o som espera o primeiro clique, como antes.
function Abrir-App {
    param([string]$Url)

    $candidatos = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
    $exe = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

    if (-not $exe) {
        Start-Process $Url
        return
    }

    $perfil = Join-Path $env:LOCALAPPDATA 'Orbis\navegador'
    if (-not (Test-Path $perfil)) { New-Item -ItemType Directory -Force -Path $perfil | Out-Null }

    # Nao chamar de $args: e variavel automatica do PowerShell (os argumentos
    # nao ligados da propria funcao), e sobrescreve-la e caminho para bug mudo.
    $flags = @(
        "--app=$Url",
        "--user-data-dir=$perfil",
        '--autoplay-policy=no-user-gesture-required',
        '--no-first-run',
        '--no-default-browser-check'
    )
    try {
        Start-Process -FilePath $exe -ArgumentList $flags
    } catch {
        Start-Process $Url
    }
}

# --- 6. As dependencias do app de lojas Shopify -----------------------------
#
# Ele nao esta no workspace do pnpm de proposito: usa npm, lockfile proprio e
# uma pilha inteiramente diferente (vinext + Cloudflare Workers). E o preco da
# independencia que os dois apps tem entre si, e o preco e este bloco.
$lojas = Join-Path $raiz 'orbis-lojas-shopify'
if (Test-Path -LiteralPath $lojas) {
    if (-not (Test-Path -LiteralPath (Join-Path $lojas 'node_modules\vinext'))) {
        Passo 'Preparando o app de lojas Shopify (primeira vez, 1-2 min)'
        Push-Location $lojas
        npm install --no-audit --no-fund
        $falhou = $LASTEXITCODE -ne 0
        Pop-Location
        if ($falhou) { Parar 'Falha ao instalar as dependencias do app de lojas. Me mande print do erro acima.' }
    }
    Ok 'App de lojas Shopify pronto'
}

# --- 7. As portas estao livres? ---------------------------------------------
#
# A suite sao QUATRO processos: o portal na 4000, a tela do design system na
# 5173, o servidor na 8787 e o app de lojas na 3000. Conferir todas antes de
# subir qualquer coisa evita o pior sintoma possivel: metade da suite no ar e a
# outra metade morrendo com `EADDRINUSE` no meio da janela, sem que a pessoa
# tenha como saber que o problema e "ja tem um pedaco rodando".
function PortaOcupada($porta) {
    $null -ne (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue)
}
function DonoDaPorta($porta) {
    (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
     Select-Object -First 1).OwningProcess
}

$portas = @{ 4000 = 'o portal'; 5173 = 'a tela do design system'; 8787 = 'o servidor'; 3000 = 'o app de lojas' }
$ocupadas = @($portas.Keys | Where-Object { PortaOcupada $_ })

if ($ocupadas.Count -eq $portas.Count) {
    # A suite inteira ja esta no ar: e so trazer a janela.
    Write-Host ''
    Write-Host '  A suite ja esta rodando em outra janela.' -ForegroundColor Yellow
    Abrir-App 'http://localhost:4000'
    Write-Host '  Abri no navegador. Pode fechar esta janela.' -ForegroundColor Gray
    Write-Host ''
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
    exit 0
}

if ($ocupadas.Count -gt 0) {
    # Meio no ar: subir por cima faria a metade que falta morrer com stack trace.
    Write-Host ''
    Erro "Sobrou um pedaco da suite rodando."
    foreach ($porta in $ocupadas) {
        Write-Host "     porta $porta - $($portas[$porta])" -ForegroundColor Gray
    }
    Write-Host ''
    Write-Host '  Isso acontece quando a janela anterior foi fechada pela metade,' -ForegroundColor Gray
    Write-Host '  ou quando alguem subiu um dos apps pelo terminal e esqueceu.' -ForegroundColor Gray
    Write-Host ''
    Write-Host '  Posso encerrar esses processos e continuar.' -ForegroundColor White
    $resposta = Read-Host '  Encerrar e continuar? (S/n)'
    if ($resposta -eq '' -or $resposta -match '^[sSyY]') {
        foreach ($porta in $ocupadas) {
            $alvo = DonoDaPorta $porta
            if ($alvo) { Stop-Process -Id $alvo -Force -ErrorAction SilentlyContinue }
        }
        Start-Sleep -Seconds 2
        $teimosas = @($portas.Keys | Where-Object { PortaOcupada $_ })
        if ($teimosas.Count -gt 0) {
            Parar "Nao consegui liberar a porta $($teimosas -join ', '). Reinicie o computador ou feche o terminal que esta rodando o app."
        }
        Ok 'Portas liberadas'
    } else {
        Parar 'Feche a janela que esta usando a porta e clique no INICIAR de novo.'
    }
}

# --- 8. Abre o navegador assim que o portal subir ---------------------------
# A funcao viaja como texto de propriedade: Start-Job roda noutro processo e
# NAO herda funcoes da sessao. Sem isto, o job falharia calado e o navegador
# nunca abriria sozinho.
#
# Quem manda abrir e a porta 4000, e nao a 5173: o vestibulo e a primeira tela
# da suite, e e dele que saem as tres portas.
$abrir = ${function:Abrir-App}.ToString()
Start-Job -ArgumentList $abrir -ScriptBlock {
    param($corpoDaFuncao)
    Set-Item -Path function:Abrir-App -Value $corpoDaFuncao
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 1
        $pronto = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
        if ($pronto) {
            Start-Sleep -Seconds 2
            Abrir-App 'http://localhost:4000'
            return
        }
    }
} | Out-Null

# --- 9. Sobe a suite --------------------------------------------------------
#
# O app de lojas sobe em processo proprio porque a pilha dele e outra (npm,
# vinext, workerd) e ele nao pertence ao workspace do pnpm. O `finally` derruba
# esse processo junto: sem isso, fechar esta janela deixaria a porta 3000
# ocupada por um orfao, e o proximo INICIAR reclamaria de uma sobra que a pessoa
# nao consegue ver.
Titulo 'Iniciando a suite'
Write-Host '  O navegador abre sozinho em alguns segundos, no portal.' -ForegroundColor Gray
Write-Host '  Endereco: http://localhost:4000' -ForegroundColor White
Write-Host ''
Write-Host '     portal ............. 4000' -ForegroundColor DarkGray
Write-Host '     design system ...... 5173' -ForegroundColor DarkGray
Write-Host '     servidor ........... 8787' -ForegroundColor DarkGray
Write-Host '     lojas shopify ...... 3000' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  NAO FECHE ESTA JANELA enquanto estiver usando a suite.' -ForegroundColor Yellow
Write-Host '  Para parar: aperte Ctrl+C ou feche a janela.' -ForegroundColor Gray
Write-Host ''
Write-Host '  -------------------------------------------' -ForegroundColor DarkGray

$processoDasLojas = $null
try {
    if (Test-Path -LiteralPath $lojas) {
        $processoDasLojas = Start-Process -FilePath 'cmd.exe' `
            -ArgumentList '/c', 'npm run dev' -WorkingDirectory $lojas `
            -WindowStyle Minimized -PassThru
    }
    pnpm dev
} finally {
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
    if ($null -ne $processoDasLojas) {
        # `taskkill /T` porque o `npm run dev` e um cmd que gera netos (node,
        # workerd): matar so o pai deixaria a porta 3000 presa.
        cmd /c "taskkill /PID $($processoDasLojas.Id) /T /F" 2>&1 | Out-Null
    }
    $sobrou = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($sobrou) { Stop-Process -Id $sobrou.OwningProcess -Force -ErrorAction SilentlyContinue }
    Write-Host ''
    Write-Host '  Suite encerrada.' -ForegroundColor Gray
    Write-Host '  Pressione ENTER para fechar.' -ForegroundColor DarkGray
    Read-Host | Out-Null
}
