# Derruba o link publico.
#
# Fecha o tunel e o servidor que o alimentava. A partir daqui o endereco que os
# socios tinham para de responder na hora, e o app volta a existir so nesta
# maquina, pelo INICIAR.
#
# O endereco NAO volta. Cada `pnpm publicar` cria um endereco novo e sorteado,
# entao derrubar e definitivo para aquele link: quem tinha o antigo nao entra
# mais nem sabendo a senha. E de proposito — um link que volta sozinho depois de
# ter sido derrubado nao esta derrubado.
#
# O acervo nao e tocado. Nada de captura, peca, kit ou site sai do disco.

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  Derrubando o link publico...' -ForegroundColor Cyan
Write-Host ''

$fechou = $false

# 1. O tunel. E ele que expoe; morre primeiro, para nao existir uma janela em
#    que o servidor ainda responde para fora.
$tuneis = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($tuneis) {
  $tuneis | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "  Tunel fechado ($($tuneis.Count) processo(s))." -ForegroundColor Green
  $fechou = $true
} else {
  Write-Host '  Nenhum tunel estava aberto.' -ForegroundColor DarkGray
}

# 2. O servidor que o `pnpm publicar` subiu. Fica na mesma porta do INICIAR, e
#    derrubar os dois e o certo: quem clicou aqui quer o app fora do ar, e o
#    INICIAR o traz de volta em segundos.
$porta = if ($env:PORT) { [int]$env:PORT } else { 8787 }
$conexoes = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($conexoes) {
  $pids = $conexoes | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Write-Host "  Servidor da porta $porta encerrado." -ForegroundColor Green
  $fechou = $true
} else {
  Write-Host "  Nada escutando na porta $porta." -ForegroundColor DarkGray
}

Write-Host ''
if ($fechou) {
  Write-Host '  Pronto. O endereco publico parou de responder.' -ForegroundColor Green
  Write-Host '  Ninguem de fora acessa mais, nem com a senha certa.'
  Write-Host ''
  Write-Host '  Para trabalhar aqui, abra o INICIAR.'
  Write-Host '  Para abrir de novo para os socios, rode `pnpm publicar`'
  Write-Host '  (o endereco vai ser outro).'
} else {
  Write-Host '  Nao havia nada no ar. Voce ja estava so.' -ForegroundColor DarkGray
}
Write-Host ''
Start-Sleep -Seconds 3
