# Orbis — Criação de lojas Shopify

Aplicativo local para personalizar e publicar o tema Shopify ShrinePro sem editar código. A interface usa um shell verde-escuro inspirado na referência visual fornecida.

## O que funciona

- acesso local automático, sem login ou bloqueio de tema;
- galeria exclusiva com o ShrinePro e prévia completa;
- extração local de temas Shopify OS 2.0 por ZIP, com páginas, seções, blocos e schemas editáveis;
- criação livre de projetos no computador;
- exclusão de projetos com confirmação;
- editor organizado por página e seção, com conteúdo, cores, fonte, idioma, espaçamento, botões e imagens;
- prévia desktop, tablet e celular;
- autosave, desfazer/refazer, versões, duplicação e publicação;
- isolamento de projetos por proprietário;
- D1 para dados relacionais, R2 para mídia e migrations Drizzle.

## Requisitos

- Node.js `>=22.13.0`
- npm

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Um perfil local é criado automaticamente; não é necessário entrar, comprar tokens ou desbloquear o ShrinePro.

## Validação

```bash
npm run lint
npm test
npm run db:generate
```

`npm test` executa o build de produção e os testes das regras de dados, autorização, upload, sanitização e responsividade.

## Dados e bindings

`.openai/hosting.json` declara:

- `DB`: banco D1;
- `MEDIA`: bucket R2 para PNG, JPG e WebP de até 5 MB.

O banco possui migrations em `drizzle/`. A inicialização de runtime é idempotente e garante seeds de demonstração, índices e gatilhos financeiros.

## Uso local

No modo de desenvolvimento, o aplicativo cria automaticamente um perfil local e mantém todos os projetos separados por esse perfil. Nenhuma senha é armazenada. Para executar uma build local fora do modo de desenvolvimento, copie `.env.example` para `.env.local` e ative `APP_DEMO_MODE=true`.

## ShrinePro

O pacote fornecido é um tema Shopify/Liquid. O MVP não executa Liquid dentro do painel: ele usa uma camada de adaptação que traduz seus principais recursos — vitrine, bundles, prova social, comparação, FAQ e tokens visuais — para o schema controlado do editor. O manifesto de importação está em `themes/shrinepro/manifest.json`.

O importador também lê diretamente `settings_schema.json`, `settings_data.json`, templates JSON e schemas das seções Liquid. Dados de autenticação, licença, tokens e chaves privadas são descartados durante a extração.

O arquivo original permanece fora do repositório porque continha dados de licença. Nenhuma credencial do tema foi copiada para o código.

## Pagamentos

O provedor atual é `mock`, exclusivo para desenvolvimento. A confirmação cria um pagamento concluído, e um gatilho atômico credita a carteira e grava a movimentação. O modelo separa pacote, pagamento e evento para permitir um provedor real com webhook idempotente futuramente.

## Estrutura principal

- `app/`: interface e rotas de API;
- `lib/`: regras, validação, identidade e acesso ao D1;
- `db/`: schema relacional;
- `drizzle/`: migrations;
- `themes/`: manifestos dos temas;
- `tests/`: testes de regras críticas;
- `ARCHITECTURE.md`: decisões e expansão futura.
