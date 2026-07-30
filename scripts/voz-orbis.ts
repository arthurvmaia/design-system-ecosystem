/**
 * Gera a voz do Orbis para a abertura.
 *
 * Uso:
 *   pnpm voz            # grava apps/web/public/orbis-voz.wav
 *   pnpm voz --ouvir    # grava e toca, para conferir antes de commitar
 *
 * Por que um arquivo, e não `speechSynthesis` na hora:
 *
 * A API do navegador depende das vozes instaladas na máquina de quem abre o
 * app. Numa sem voz pt-BR, o Orbis falaria com sotaque de outro idioma ou não
 * falaria; e o timbre mudaria de computador para computador, o que é o oposto
 * de uma identidade. Um arquivo soa igual em todo lugar e não precisa de rede.
 *
 * Por que o sintetizador do Windows, e não um serviço:
 *
 * Ele já está instalado, é offline e é de graça. `Microsoft Maria Desktop` é
 * voz feminina pt-BR nativa do sistema. Nenhuma chave, nenhuma conta, nenhuma
 * dependência nova num repo que evita artefato binário de propósito.
 *
 * O caráter de ROBÔ não é feito aqui. A síntese sai limpa e o tratamento
 * acontece no navegador, em `Intro.tsx`: modulação em anel mais filtro de
 * banda estreita. Fazer o efeito aqui congelaria a decisão dentro do arquivo;
 * fazendo lá, dá para afinar sem regravar nada.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executadoDireto } from './executado-direto.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * O que o Orbis diz quando o núcleo pega.
 *
 * Curta por medida, não por gosto. A abertura dura 5,2 s no modo canvas e a voz
 * entra em 3,1 s, depois da pegada: sobram 2,1 s. A primeira versão era
 * "Bem-vindo, senhor. Orbis no ar." e media 4,27 s de fala — seria cortada no
 * meio da própria apresentação.
 *
 * O nome não se perde por ficar de fora daqui: ele está na primeira linha do
 * log (`> orbis … no ar`), na marca e no título da aba. A voz dá as boas-vindas,
 * a tela dá o status. Cada um diz uma coisa em vez de os dois disputarem.
 */
export const FALA = 'Bem-vindo, senhor.';

/**
 * Corta o silêncio das pontas.
 *
 * O sintetizador do Windows põe quase um segundo de nada no fim de tudo que
 * grava. Numa abertura em que cada décimo foi escolhido, um segundo morto é a
 * diferença entre a voz fechar a cena e a voz ser interrompida por ela.
 *
 * O limiar é de amplitude, não de energia: a fala começa num transiente e um
 * detector de energia média perderia a primeira consoante.
 */
export const cortarSilencio = (wav: Buffer, limiar = 350): Buffer => {
  const CABECALHO = 44;
  if (wav.length <= CABECALHO) return wav;
  const amostras = (wav.length - CABECALHO) >> 1;
  let primeira = -1;
  let ultima = -1;
  for (let i = 0; i < amostras; i++) {
    if (Math.abs(wav.readInt16LE(CABECALHO + i * 2)) > limiar) {
      if (primeira < 0) primeira = i;
      ultima = i;
    }
  }
  if (primeira < 0) return wav;

  // Uma folga curta dos dois lados: cortar rente ao primeiro pico produz um
  // estalo, porque a onda começa longe do zero.
  const folga = 900; // ~40 ms a 22050 Hz
  const de = Math.max(0, primeira - folga);
  const ate = Math.min(amostras, ultima + folga);
  const dados = wav.subarray(CABECALHO + de * 2, CABECALHO + ate * 2);

  const saida = Buffer.concat([wav.subarray(0, CABECALHO), dados]);
  // Os dois tamanhos do cabeçalho RIFF precisam acompanhar, senão o arquivo
  // declara mais dados do que tem e o decodificador do navegador recusa.
  saida.writeUInt32LE(saida.length - 8, 4);
  saida.writeUInt32LE(dados.length, 40);
  return saida;
};

/** Onde o arquivo é gravado. `public/` é servido pelo Vite na raiz. */
export const DESTINO = join(RAIZ, 'apps', 'web', 'public', 'orbis-voz.wav');

/**
 * Fala com a voz feminina pt-BR do sistema, gravando num arquivo.
 *
 * `Rate` levemente abaixo do normal (-1): a voz padrão fala rápido demais para
 * uma frase que a pessoa ouve UMA vez, no meio de uma animação. Devagar soa
 * deliberado, que é o registro do Orbis.
 */
export const gerarVoz = (texto: string, destino: string): void => {
  // A frase entra por variável de ambiente, e não interpolada no script: uma
  // aspa simples no texto quebraria o PowerShell, e um texto vindo de fora
  // viraria execução de comando.
  const ps = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    // A voz pedida por nome; se ela não existir nesta máquina, cai para a
    // primeira feminina e avisa em vez de gravar em silêncio com outra.
    '$alvo = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $env:ORBIS_VOZ }',
    'if (-not $alvo) {',
    '  $alvo = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq "Female" } | Select-Object -First 1',
    '  if (-not $alvo) { Write-Error "Nenhuma voz feminina instalada."; exit 1 }',
    '  Write-Output ("aviso: " + $env:ORBIS_VOZ + " nao existe; usando " + $alvo.VoiceInfo.Name)',
    '}',
    '$s.SelectVoice($alvo.VoiceInfo.Name)',
    '$s.Rate = -1',
    '$s.Volume = 100',
    '$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)',
    '$s.SetOutputToWaveFile($env:ORBIS_DESTINO, $fmt)',
    '$s.Speak($env:ORBIS_TEXTO)',
    '$s.Dispose()',
  ].join('; ');

  const saida = execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    {
      env: {
        ...process.env,
        ORBIS_TEXTO: texto,
        ORBIS_DESTINO: destino,
        ORBIS_VOZ: 'Microsoft Maria Desktop',
      },
      encoding: 'utf8',
    },
  );
  const aviso = saida.trim();
  if (aviso.length > 0) console.log(`  ${aviso}`);
};

const principal = (): void => {
  console.log('');
  console.log(`  Gravando a voz do Orbis: "${FALA}"`);
  gerarVoz(FALA, DESTINO);

  if (!existsSync(DESTINO)) {
    console.log('  Falhou: o arquivo não foi criado.\n');
    process.exit(1);
  }
  const cru = readFileSync(DESTINO);
  const limpo = cortarSilencio(cru);
  writeFileSync(DESTINO, limpo);

  const seg = (limpo.length - 44) / (22050 * 2);
  const kb = (statSync(DESTINO).size / 1024).toFixed(0);
  console.log(
    `  Pronto: ${DESTINO} (${kb} KB, ${seg.toFixed(2)}s` +
      `, cortei ${((cru.length - limpo.length) / (22050 * 2)).toFixed(2)}s de silêncio)`,
  );
  // A abertura no modo canvas dura 5,2 s e a voz entra em 3,1 s. Passar disso
  // não quebra nada, mas a frase é cortada pela cortina saindo.
  if (seg > 2.1) {
    console.log(`  Atenção: ${seg.toFixed(2)}s não cabe nos 2,1s da abertura. Encurte a FALA.`);
  }
  console.log('  O timbre de robô é aplicado no navegador, em Intro.tsx.\n');

  if (process.argv.includes('--ouvir')) {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `(New-Object Media.SoundPlayer "${DESTINO}").PlaySync()`,
    ]);
  }
};

if (executadoDireto(import.meta.url)) principal();
