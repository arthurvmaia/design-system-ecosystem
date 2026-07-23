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
