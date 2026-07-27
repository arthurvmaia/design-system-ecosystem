# Manual de uso — Design System Ecosystem

Este é o manual para quem **usa** o app. Não precisa saber programar: os dois
arquivos que importam ficam na raiz da pasta do projeto e funcionam com duplo
clique.

---

## Os dois arquivos que você clica

| Arquivo | O que faz | Quando usar |
|---|---|---|
| **`INICIAR.bat`** | Abre o app no navegador | Sempre que for usar |
| **`PROCESSAR.bat`** | Abre o Claude Code para processar a fila | Depois de pedir extrações ou sites |

Duplo clique. Não precisa de terminal, comando, nem digitar nada.

> 💡 **Atalho:** botão direito em cada um → **Enviar para** → **Área de trabalho (criar atalho)**.

---

## Como o app funciona hoje

O app **não gasta créditos da API**. Ele registra seus pedidos numa fila em
disco, e quem faz o trabalho é o Claude Code — rodando na sua assinatura.

```
Você clica "Extrair" no navegador
        ↓
o pedido entra na fila  (nada acontece ainda)
        ↓
você abre o PROCESSAR.bat e manda rodar
        ↓
o Claude Code trabalha e grava o resultado
        ↓
o app mostra na galeria, normal
```

A pausa no meio é de propósito. Nada processa sozinho — é você quem decide
quando. É isso que mantém o uso honesto: você usando a ferramenta, não um
programa disparando-a por você.

---

## Uso normal

### 1. Abra o app

Duplo clique em **`INICIAR.bat`**. O navegador abre sozinho em
`http://localhost:5173`.

Deixe a janela preta aberta enquanto usar o app.

### 2. Peça o que quiser

| Ação | Vai para a fila? |
|---|---|
| Navegar, ver galeria, biblioteca | Não — é instantâneo |
| Curar (coração), renomear | Não — é instantâneo |
| **Extrair** (colar URL) | Sim |
| **Classificar via LLM** | Sim |
| **Gerar site** | Sim |

O painel **Fila** na tela de Projetos mostra o que está aguardando.

### 3. Processe

Duplo clique em **`PROCESSAR.bat`**. O Claude Code abre e mostra:

```
Fila: 3 pendentes
  1. Extrair — stripe.com
  2. Extrair — linear.app
  3. Gerar site — Landing Cliente X

Processar todos? (ou diga quais)
```

Responda como quiser — "manda ver", "só o primeiro", "pula o 2". Ele entende
linguagem natural, não precisa de palavra exata.

### 4. Volte ao app

O resultado aparece na galeria e nos projetos, normalmente.

---

## Gerando um site

No wizard de **Novo projeto**, além de nome, conteúdo e cores, você escolhe
**como o site é montado**:

### "Eu defino a estrutura"

Você escolhe o esqueleto e o gerador só decide qual componente ocupa cada
posição.

| Estrutura | Para que serve |
|---|---|
| SaaS / Produto | Software, apps, ferramentas, assinaturas |
| Portfólio | Estúdios, freelancers, designers, fotógrafos |
| Loja | Lojas, catálogos, marcas de produto |
| Captura | Lançamentos, iscas digitais, inscrições |
| Página única | Institucional simples, cartão de visita |

Depois de escolher, dá para **ligar e desligar seções** clicando nelas. As
marcadas com `*` são obrigatórias daquela estrutura.

**Resultado previsível.** Gerar duas vezes produz páginas equivalentes.

### "Use sua criatividade"

O gerador monta a página do jeito que achar melhor — mas **só com os componentes
que você curou**.

A cada geração ele sorteia uma direção e se compromete com ela: editorial,
assimétrica, densa, cinematográfica, minimalista ou narrativa.

**Resultado diferente a cada vez.** Regerar o mesmo projeto dá outra página.

> Nos dois modos vale a mesma regra: só entram componentes da sua biblioteca.
> O que muda é quem decide a arquitetura da página.

---

## Fluxo completo

1. **Extrair** — cole a URL de um site que você gosta → vai pra fila
2. **Processar** — `PROCESSAR.bat`, manda rodar
3. **Galeria** — clique em "Classificar via LLM" → vai pra fila → processe
4. **Curar** — clique no coração dos componentes que quer guardar
5. **Biblioteca** — veja o que curou, renomeie se quiser
6. **Projetos** — "Novo projeto" → preencha → escolha como montar → vai pra fila → processe

---

## Se der problema

### A janela preta abre e fecha na hora
Falta o Node.js. Instale a versão LTS em https://nodejs.org, reinicie o PC e
clique de novo.

### O `PROCESSAR.bat` diz que não achou o Claude Code
Instale em https://claude.com/product/claude-code e clique de novo.

### "Porta 5173 já está em uso"
Já tem outra instância rodando. Feche as outras janelas pretas, ou force:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Página em branco no navegador
Aperte **F12** → aba **Console** → mande um print do erro em vermelho.

### Quero ver a fila pelo terminal

```powershell
pnpm fila
```

### Firewall do Windows pediu permissão
Autorize o Node. Só acontece na primeira vez.

---

## Instalando na máquina de um amigo

1. Instale o **Node.js LTS** → https://nodejs.org
2. Instale o **Claude Code** → https://claude.com/product/claude-code
   (ele precisa da assinatura Claude dele — assinatura é individual)
3. Baixe o projeto do GitHub:
   - **com git:** `git clone https://github.com/arthurvmaia/design-system-ecosystem.git`
   - **sem git:** na página do repositório, **Code → Download ZIP**, e extraia
     em qualquer pasta
4. Duplo clique em **`INICIAR.bat`** — ele instala as dependências e cria o
   `.env` sozinho

> **Não copie a pasta pelo Explorer nem envie o seu `.env`** — cada máquina cria
> o próprio na primeira execução. Se não der para usar o GitHub, use o
> `EMPACOTAR.bat`, que gera um zip limpo e seguro para enviar.

---

## Comandos úteis

```powershell
pnpm fila             # lista a fila
pnpm dev              # sobe o app pelo terminal (o INICIAR.bat faz isso)
pnpm typecheck        # confere o código
pnpm lint             # confere formatação

# ver se o servidor responde
curl.exe http://localhost:8787/health

# abrir a pasta de dados
explorer $env:USERPROFILE\design-system-ecosystem
```

> Use `curl.exe` com o `.exe`. No PowerShell, `curl` sozinho é outro comando.

---

## Onde fica cada coisa

**Código:** a pasta do projeto — onde você clonou ou extraiu o repositório.

**Dados** (não mexa manualmente) — `C:\Users\<seu-usuário>\design-system-ecosystem\`:

```
vault\          design systems extraídos
library\        componentes que você curou (SEU ATIVO)
projects\       sites gerados
queue\          fila de trabalho
  pendente\       aguardando você processar
  concluido\      histórico
cache\          thumbnails e cache (pode apagar)
ecosystem.db    índice SQLite
```

---

## Reset total

> ⚠️ Apaga **todos** os design systems, componentes curados e projetos.

```powershell
# Feche o app antes
Remove-Item -Recurse -Force $env:USERPROFILE\design-system-ecosystem
pnpm db:migrate
```

A chave e as configurações do `.env` são preservadas.

---

## Configuração atual

| Item | Valor |
|---|---|
| Modo | `queue` — fila em disco, sem consumo de API |
| Frontend | http://localhost:5173 |
| Servidor | http://localhost:8787 |
| Node.js | 24.x (mínimo 20.11) |

Para migrar para a API quando o MVP estiver validado, use o guia
**[MIGRAR-PARA-API.md](MIGRAR-PARA-API.md)** nesta mesma pasta.

---

Última atualização: julho de 2026 — validado end-to-end no Windows 11 / Node 24.
