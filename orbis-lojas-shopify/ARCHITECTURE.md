# Arquitetura do Orbis — Criação de lojas Shopify

## Visão geral

O Orbis usa vinext/React no frontend e rotas de servidor compatíveis com Cloudflare Workers. A persistência fica em D1, e uploads ficam em R2. A interface é uma aplicação única com cinco superfícies principais: Início, Temas, Projetos, Carteira e Editor; administradores recebem uma sexta superfície enxuta.

## Limites de responsabilidade

- `app/AppShell.tsx`: navegação e experiência do produto.
- `app/api/*`: entrada HTTP autenticada e validação de payload.
- `lib/business-rules.mjs`: regras puras e testáveis.
- `lib/data.ts`: queries, seeds e operações transacionais.
- `db/schema.ts`: modelo completo e índices.
- `themes/*/manifest.json`: contrato entre um tema de origem e o editor controlado.

## Identidade e autorização

A autenticação é fornecida pela plataforma. A API converte o usuário autenticado em um registro local e atribui o primeiro usuário como administrador. Toda leitura ou escrita de projeto inclui `user_id`; ações administrativas validam `role` no servidor.

## Tokens e atomicidade

O saldo tem uma projeção materializada em `token_wallets`, sempre reconciliável por `token_transactions`. Pagamentos e desbloqueios possuem chaves únicas de idempotência.

Dois gatilhos protegem o desbloqueio:

1. validam preço corrente e saldo suficiente;
2. descontam a carteira, gravam o livro-razão e criam o projeto na mesma transação SQLite.

Assim, não existe estado em que tokens sejam consumidos sem que o projeto seja criado.

## Editor

O editor não é um canvas livre. Cada tema declara campos permitidos, e a personalização passa por normalização e sanitização no servidor. O preview é isolado por variáveis de design (`primaryColor`, `backgroundColor`, `textColor`, fonte, espaçamento e raio), mantendo responsividade previsível.

## ShrinePro

O ShrinePro foi tratado como origem Shopify/Liquid e não como código da aplicação. A camada de adaptação preserva seu propósito comercial e mapeia seções relevantes para o schema do Orbis. Dados de licença existentes no arquivo original foram deliberadamente excluídos.

## Preparado para evoluir

- provedor de pagamento real e webhooks idempotentes;
- publicação em domínio próprio;
- marketplace e comissão de criadores;
- traduções por projeto;
- editor colaborativo;
- assinatura e tokens recorrentes;
- importadores adicionais para novos formatos de tema.

Essas áreas têm entidades reservadas no schema, sem acrescentar complexidade visual ao MVP.
