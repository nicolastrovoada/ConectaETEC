# Conecta ETEC — V3

Plataforma de engajamento escolar (TCC — ETEC Cravinhos, Centro Paula Souza, 2026).

Aplicação full-stack com banco SQLite persistente, autenticação real e permissões aplicadas no servidor.

Monorepo npm com:

- `client/` — aplicação React 19 + TypeScript 5.7 + Vite + Tailwind CSS 4 (painéis Aluno, Professor, Funcionário e Coordenação; modo escuro, ajuste de fonte e acessibilidade).
- `server/` — API REST Node 24 + Express + SQLite (via `node:sqlite`), sessão `httpOnly` + hash de senha, permissões por papel no servidor, upload de evidências (imagens + PDF), auditoria e gamificação.
- `shared/types.ts` — contrato de tipos compartilhado (entidades, enums, helpers de gamificação e mapas de UI). Não alterar sem atualizar cliente e servidor juntos.
- `docs/api-contract.md` — documentação do contrato da API.

## Pré-requisitos

- Node.js **24 ou superior** (usa o módulo nativo `node:sqlite`; não é necessária compilação nativa de banco).
- npm.

## Como rodar

```bash
npm install        # instala as workspaces (client + server)
npm run dev        # sobe a API (http://localhost:4000) e o client (http://localhost:5173) juntos
```

Abra **http://localhost:5173** no navegador.

Outros comandos:

| Comando | Função |
| --- | --- |
| `npm run dev` | Sobe API e cliente juntos. |
| `npm run dev:server` | Sobe apenas a API na porta 4000. |
| `npm run dev:client` | Sobe apenas o cliente na porta 5173 (o Vite encaminha `/api` e `/uploads`). |
| `npm run build` | Compila servidor e cliente. |
| `npm run typecheck` | Executa a verificação de tipos de servidor e cliente. |
| `npm run test` | Executa as suítes de testes de servidor e cliente. |

A suíte cobre servidor e cliente em dezenas de arquivos de teste, incluindo autenticação, permissões por papel, migrações, gamificação, uploads e o bootstrap do primeiro coordenador.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `4000` | Porta HTTP da API. |
| `DB_PATH` | `server/data/conectaetec.db` | Caminho do banco SQLite. Use `:memory:` nos testes. |
| `DATA_DIR` | `server/data` | Diretório de persistência do servidor. |
| `UPLOAD_DIR` | `server/data/uploads` | Diretório dos anexos enviados. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem permitida para requisições com credenciais. |
| `NODE_ENV` | desenvolvimento | Em `production`, ativa o cookie de sessão com `secure`. |
| `BOOTSTRAP_ADMIN_NAME` | vazio | Nome do coordenador inicial. Só é usado quando o banco não tem **nenhum** usuário. |
| `BOOTSTRAP_ADMIN_EMAIL` | vazio | E-mail do coordenador inicial (normalizado para minúsculas). Só é usado em banco vazio. |
| `BOOTSTRAP_ADMIN_PASSWORD` | vazio | Senha do coordenador inicial (mínimo de 6 caracteres, gravada com hash). Só é usada em banco vazio. |

Os caminhos padrão são relativos ao diretório de execução do workspace do servidor (`app/server`).

O schema e as migrações rodam automaticamente na subida (`server/src/index.ts`), de forma idempotente. O **seed de demonstração NÃO roda no boot**: `runSeed` é uma fixture exclusiva de teste. Em um banco vazio, a coordenação inicial é criada via `BOOTSTRAP_ADMIN_*` (as três juntas); sem essas variáveis, o banco sobe vazio e o cadastro é feito depois pela própria coordenação. Se apenas parte das variáveis for definida, o boot falha em vez de criar um administrador incompleto. Após o primeiro boot, as variáveis passam a ser ignoradas porque o banco já tem usuário.

## Migrações versionadas

O schema do banco vive em `server/src/db/migrations/` e é aplicado por um runner versionado (`runMigrations`), que roda na subida (antes do bootstrap do coordenador) e nos testes (`helpers.ts`). A tabela `schema_migrations` registra as versões já aplicadas; cada migração pendente roda dentro de uma transação própria e só é marcada ao concluir com sucesso (falha gera ROLLBACK). O seed de demonstração, quando usado, é chamado explicitamente pelos testes/fixtures — nunca pelo boot.

Para adicionar uma migração nova:

1. Crie `server/src/db/migrations/00X.ts` exportando um objeto `Migration` (`{ version, name, run(db) }`), com `version` igual ao próximo número.
2. Importe-a e adicione-a a `MIGRATIONS` em `server/src/db/migrations/index.ts`.
3. Escreva-a de forma **idempotente e tolerante a reexecução** (`CREATE ... IF NOT EXISTS`, checagem com `PRAGMA foreign_key_list` ou `PRAGMA table_info` antes de recriar tabela etc.), para que um banco local existente aplique apenas as versões pendentes sem perder dados.

Versões atuais:

- `001` — schema inicial idempotente (`CREATE TABLE IF NOT EXISTS` e índices base).
- `002` — FKs nativas (`ON DELETE RESTRICT/CASCADE/SET NULL`) e índices de consulta (activities, auditLogs, redemptions, transactions, notifications, users). A auditoria também ganhou paginação server-side (`page`/`pageSize`).
- `003` — tabela de conquistas/badges por aluno (removida na `005`).
- `004` — base da V3: janela de atraso (`activities.lateWindowDays`), exclusão lógica (`activities.deletedAt`/`deletedBy`), indicador de atraso da entrega (`submissions.delayed`), notificação transitória (`notifications.transient`), colunas do reforço escolar em `studyContents` e as tabelas `notices` (avisos da coordenação) e `study_content_completions` (conclusão do reforço, única por aluno/reforço).
- `005` — `DROP TABLE IF EXISTS achievements`: a funcionalidade de conquistas foi removida da V3 (serviço, rota, tipos, seed e código de auditoria saíram primeiro), então a tabela da `003` não tem mais consumidor.
- `006` — anexos do reforço escolar (`study_content_attachments`) e ampliação do tipo de transação para `study_content`, com recriação da tabela `transactions` para atualizar o `CHECK`.
- `007` — `notifications.relatedActivityId`, referência opcional à atividade que originou a notificação, com `ON DELETE SET NULL`.

Depois de **cada** migração aplicada, o runner executa `PRAGMA foreign_key_check` e falha (com ROLLBACK, sem gravar a versão) se houver referência órfã.

## Recursos implementados

- Backend e banco de dados persistente (SQLite, schema/migrações idempotentes, seed de demonstração como fixture de teste, WAL e transações).
- Autenticação com senhas protegidas por hash e sessão server-side (RN01), com token de sessão `httpOnly` e limitação de tentativas de login.
- Controle de permissões no servidor e proteção das APIs (`requireAuth`/`requireRoles`, guardas de posse e auditoria de acesso negado).
- Upload de evidências e anexos (imagens + PDF, até três arquivos de 5 MB) com limpeza de arquivos órfãos.
- Acessibilidade, modo escuro e ajuste de fonte (skip link, foco visível, live regions e abas no padrão APG).
- Filtros e calendário de atividades.
- Relatórios exportáveis em CSV e indicadores por perfil.
- Gamificação com carteira de pontos e sequência (RF07), loja de recompensas com resgate sujeito a saldo e estoque (RF08), notificações (RF10), auditoria (RF12) e reforço escolar (RF09).

## Estrutura

```text
app/
  client/src/          # React: lib (api/format/labels), context, componentes de UI, features e páginas por papel
  server/src/          # Express: app, auth, config, db (schema/bootstrap/seed/queries/migrações), lib, routes, services e tests
  shared/types.ts      # contrato compartilhado
  docs/api-contract.md # documentação da API
```

## Itens adiados (roadmap futuro)

- Edição de perfil pelo próprio usuário, com alteração de nome, foto e senha.
- Recuperação de senha por e-mail e cadastro público.
- Token CSRF dedicado (mitigado atualmente por cookie com `SameSite=Lax`).
- Testes ponta a ponta dos fluxos principais.
- Login único institucional (por exemplo, SIGA), integração com sistemas acadêmicos e deploy com HTTPS.
- Campanha formal de pesquisa com usuários reais.
