# Intro do app

A abertura que aparece no INICIAR é gerada pelo próprio app (`src/components/Intro.tsx`):
uma animação original em canvas com o typemark da marca, na paleta obsidian/crimson/bone,
com trilha sintetizada. Ela pode ser pulada e, ao terminar, entra direto no app.

## Usar o SEU vídeo no lugar da animação

Se você tem um vídeo de abertura **do qual você possui os direitos** (arte própria,
export do seu editor, trilha licenciada), é só colocá-lo aqui:

```
apps/web/public/intro.mp4
```

A intro detecta o arquivo automaticamente e toca ele no lugar da animação — com som,
botão de pular e o mesmo auto-avanço para o app quando termina. Nada mais a configurar.

Formatos: `.mp4` (H.264/AAC) é o mais compatível. Deixe curto (5–15 s) e leve.

## Importante — direitos autorais

Não coloque aqui um vídeo de terceiros (por exemplo, baixado do YouTube) sem ter os
direitos de uso. O app não embute nem reproduz vídeos de terceiros de propósito.

## Trocou o vídeo? Remeça as batidas do som

O som da abertura não é trilha por cima: ele é uma ignição com marcas
(duas falhas, a pegada, o estouro, a voz do Orbis), e as marcas foram
sincronizadas com **este** vídeo. Um vídeo novo desencontra tudo, e o
sintoma é específico: o Orbis se apresenta antes de acender na tela.

As marcas ficam em `BATIDAS_VIDEO`, em `src/components/Intro.tsx`. Para
achar os números novos, meça o brilho médio do quadro ao longo do vídeo
(o pico é o instante em que ele liga):

```js
// rode de dentro de apps/server, que é quem tem o playwright
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const b = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
// aponte para um .html com <video id="v" src="intro.mp4" muted> ao lado do mp4
await p.goto(pathToFileURL(resolve('apps/web/public/_sonda.html')).href);
await p.waitForFunction(() => document.getElementById('v')?.readyState >= 1);
const dur = await p.evaluate(() => document.getElementById('v').duration);
for (let t = 0; t <= dur - 0.05; t += 0.25) {
  const br = await p.evaluate(async (tempo) => {
    const v = document.getElementById('v');
    v.currentTime = tempo;
    await new Promise((r) => { v.onseeked = r; });
    const c = document.createElement('canvas');
    c.width = 96; c.height = 54;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0, 96, 54);
    const d = g.getImageData(0, 0, 96, 54).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i+1] + d[i+2]) / 3;
    return s / (d.length / 4);
  }, t);
  console.log(t.toFixed(2) + 's', br.toFixed(1));
}
await b.close();
```

Leia a curva e preencha: `pega` é onde o brilho começa a subir de verdade,
`pega + subida` tem de cair no pico, e `vozApos` é o respiro depois dele.

A voz se defende sozinha: a hora de entrada dela sai da duração real do
arquivo, então se a frase não couber antes do fim ela entra mais cedo, e
se não couber de jeito nenhum não toca.
