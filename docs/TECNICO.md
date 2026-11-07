# Referência técnica — Conecta ETEC

Este documento reúne a referência técnica do protótipo do Conecta ETEC. Ele complementa o [README raiz](../README.md), que apresenta o projeto, o público e as instruções básicas de execução. O contrato detalhado da API está em [api-contract.md](../app/docs/api-contract.md) e o plano de evolução está em [ROADMAP.md](ROADMAP.md).

## 1. Stack e arquitetura

### Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js 24+ |
| Frontend | React 19 e React DOM 19 |
| Linguagem | TypeScript 5.7 em modo estrito |
| Build e desenvolvimento | Vite 8 |
| Estilo | Tailwind CSS 4, com `@tailwindcss/vite` |
| Backend | Express 4 |
| Banco de dados | SQLite por meio do módulo nativo `node:sqlite` |
| Validação de payload | Zod 3 |
| Autenticação | Sessão em cookie `httpOnly` e hash de senha com `bcryptjs` |
| Upload | `multer`, com validação de tipo e tamanho |
| Testes | Vitest, Testing Library, MSW e Supertest |
| Organização | Monorepo npm com workspaces `client` e `server` |

### Arquitetura

O projeto é um monorepo npm. O cliente é uma SPA React que consome a API REST e envia o cookie de sessão em todas as requisições. O servidor Express concentra autenticação, autorização, regras de negócio, persistência, uploads autorizados, notificações e auditoria.

```text
Navegador
  └── React SPA (Vite, porta 5173)
        └── fetch /api e /uploads (credenciais incluídas)
              └── Express API (porta 4000)
                    ├── sessão e middleware de permissões
                    ├── rotas REST por domínio
                    ├── serviços de domínio
                    └── SQLite (node:sqlite, WAL, chaves estrangeiras)
```

O contrato de tipos fica em `app/shared/types.ts`: entidades, enums, mapas de rótulos e helpers de gamificação. O cliente o importa pelo alias `@shared`; o servidor o reexporta por `app/server/src/shared/types.ts`, que funciona como ponto de ligação com o contrato compartilhado. Alterações nesse contrato devem ser feitas de forma coordenada entre cliente e servidor.

O banco é criado automaticamente na primeira subida. O servidor executa migrações versionadas, usa transações para operações sensíveis e mantém chaves estrangeiras e `PRAGMA foreign_key_check` como proteção de integridade.

## 2. Estrutura de pastas

```text
ConectaETEC/
  app/
    client/
      src/
        components/      # Layout e componentes de interface
        context/         # Sessão, preferências, notificações e toasts
        features/        # Atividades, validações, calendário e reforço
        hooks/           # Hooks reutilizáveis
        lib/             # Cliente da API, formatação e rótulos
        pages/           # Painéis student, teacher, staff e coordinator
        test/            # Configuração de testes e MSW
    server/
      src/
        auth/            # Sessão, hash de senha, rate limit e middleware
        db/              # Conexão, schema, seed, queries e migrações
        lib/             # HTTP, erros, datas, uploads e UUID
        routes/          # Rotas REST por domínio
        services/        # Pontos, sequência, notificações, avisos, relatórios e auditoria
        shared/          # Ponto de ligação com o contrato compartilhado
        tests/           # Testes de backend com Vitest
    shared/
      types.ts           # Contrato compartilhado do monorepo
    docs/
      api-contract.md    # Contrato da API REST
  docs/
    TECNICO.md           # Referência técnica
    ROADMAP.md           # Roadmap técnico e plano de evolução
    README.md            # Índice da documentação publicada
  README.md
```

## 3. Requisitos funcionais

| ID | Requisito | Como aparece no protótipo |
| --- | --- | --- |
| RF01 | Autenticação por e-mail e senha, com redirecionamento ao painel do perfil | Login, logout e sessão restaurada por `GET /api/auth/me`; cookie de sessão `sid`. |
| RF02 | Cadastro de contas, com aluno vinculado a turma | Cadastro e edição de usuários pela coordenação; vínculo de aluno e professor mantido nas turmas. |
| RF03 | Perfis de acesso separados | Papéis `student`, `teacher`, `staff` e `coordinator`, com painéis e permissões específicas no servidor. |
| RF04 | Atividades: criar, editar, publicar e acompanhar | CRUD de atividades, transição `draft → active → closed`, calendário e exclusão lógica. |
| RF05 | Entrega com evidência e comentário | Envio e reenvio de entrega com comentário, evidência textual e anexos autorizados. |
| RF06 | Validação: aprovar, reprovar ou solicitar correção | Ações de validação com feedback obrigatório em reprovação ou correção e opcional na aprovação, notificação ao aluno e registro de auditoria. |
| RF07 | Pontuação: créditos, bônus, sequências, ajustes e débitos | Carteira baseada em transações, bônus, ajuste manual, sequência de participação e níveis Bronze, Prata, Ouro e Diamante. |
| RF08 | Recompensas: consultar e resgatar | Loja com saldo e estoque; resgate com transação negativa e processamento pela coordenação. |
| RF09 | Reforço escolar por disciplina | Reforço com lição, questões, anexos, turmas destinatárias e conclusão única por aluno. |
| RF10 | Notificações de atividade, aprovação, correção, recompensa e sistema | Notificações transitórias e persistentes, com leitura individual ou em lote. |
| RF11 | Indicadores de participação, atividades, validações e desempenho | Painéis por perfil, desempenho do professor, detalhe de turma e relatórios consolidados. |
| RF12 | Auditoria para rastreabilidade | Registro de ações relevantes, incluindo acessos negados, com consulta pela coordenação. |
| RF13 | Gestão de turmas e disciplinas | CRUD de turmas e disciplinas, com vínculos de alunos e professores. |
| RF14 | Perfil com dados e estatísticas do usuário | Perfil com papel, data de cadastro e, para alunos, saldo, nível e meta; a edição de perfil não faz parte desta versão. |

## 4. Regras de negócio

| ID | Regra |
| --- | --- |
| RN01 | Somente usuários ativos podem autenticar. |
| RN02 | Cada atividade possui turma, disciplina, responsável, prazo, tipo, pontuação e status. |
| RN03 | A entrega pode estar pendente, enviada, em análise, aprovada, reprovada ou com correção solicitada. |
| RN04 | Pontos positivos aumentam o saldo; resgates geram transações negativas. |
| RN05 | A aprovação de uma entrega gera transação de pontos e notificação ao aluno. |
| RN06 | Alterações relevantes são registradas em auditoria. |

### Regras adicionais implementadas

- **Entrega atrasada:** cada atividade tem uma janela de tolerância, com padrão de 7 dias e possibilidade de configurar 0 para não tolerar atraso. O envio após o prazo, mas dentro da janela, é marcado como atrasado; fora da janela, é bloqueado. A aprovação de entrega atrasada concede `ceil(pontuação / 2)`.
- **Exclusão lógica de atividade:** a atividade deixa de aparecer para professor e alunos, permanece visível para a coordenação e mantém os pontos já concedidos.
- **Isolamento por papel:** professor e funcionário enxergam apenas as próprias atividades; a coordenação enxerga todas; o aluno enxerga apenas as atividades das suas turmas.
- **Reforço escolar:** a conclusão é única por aluno e reforço, e o crédito de pontos correspondente é concedido uma única vez.
- **Notificações:** a classificação entre transitória e persistente é derivada do tipo da notificação, no contrato compartilhado. A listagem não apaga nem marca nada; o acuse de leitura é uma ação explícita.
- **Avisos da coordenação:** o aviso é uma entidade própria e gera uma notificação persistente por destinatário; funcionários e coordenação não são público do próprio aviso.
- **Auditoria no servidor:** notificações, avisos e registros de auditoria são criados no servidor, nunca decididos pelo cliente.

## 5. Configuração e execução

### Pré-requisitos

- Node.js **24 ou superior**. O servidor usa o módulo nativo `node:sqlite`, portanto não é necessária compilação nativa de banco.
- npm.

### Variáveis de ambiente

O servidor carrega automaticamente o primeiro arquivo `.env` encontrado, nesta ordem de precedência: `app/server/.env`, `app/.env` e `.env` na raiz do repositório. Variáveis já definidas no ambiente do processo têm precedência sobre o arquivo, e a ausência do `.env` não impede a subida — nesse caso valem os valores padrão da tabela abaixo.

O `.env` é opcional e ignorado pelo Git. Nenhum segredo real deve ser versionado.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `4000` | Porta HTTP da API. |
| `DB_PATH` | `server/data/conectaetec.db` | Caminho do banco SQLite. Use `:memory:` nos testes. |
| `DATA_DIR` | `server/data` | Diretório de persistência do servidor. |
| `UPLOAD_DIR` | `server/data/uploads` | Diretório dos anexos enviados. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem permitida para requisições com credenciais. |
| `NODE_ENV` | desenvolvimento | Em `production`, ativa o cookie de sessão com `secure`. |
| `BOOTSTRAP_ADMIN_NAME` | vazio | Nome do coordenador inicial. Usado apenas quando o banco não tem nenhum usuário. |
| `BOOTSTRAP_ADMIN_EMAIL` | vazio | E-mail do coordenador inicial. Usado apenas em banco vazio. |
| `BOOTSTRAP_ADMIN_PASSWORD` | vazio | Senha inicial do coordenador, com mínimo de 6 caracteres e hash no armazenamento. Usada apenas em banco vazio. |

Os caminhos padrão são relativos ao diretório de execução do workspace do servidor (`app/server`).

As variáveis `BOOTSTRAP_ADMIN_*` são usadas apenas quando o banco ainda não possui usuários. As três devem ser definidas em conjunto: se apenas parte delas estiver definida, o boot falha em vez de criar um coordenador incompleto. Depois do primeiro boot, elas passam a ser ignoradas e novos usuários são cadastrados pela coordenação.

### Como o boot funciona

1. O servidor cria o diretório de uploads.
2. Abre o banco SQLite, criando o arquivo na primeira execução.
3. Aplica as migrações pendentes. As migrações rodam sempre, em qualquer ambiente.
4. Se o banco não tiver usuários e as três variáveis `BOOTSTRAP_ADMIN_*` estiverem definidas, cria o primeiro coordenador.
5. Remove sessões expiradas.
6. Inicia a API.

O seed de demonstração **não** é executado no boot: ele é uma fixture de teste, usada apenas pelos testes automatizados. Por isso, o banco de uma instalação nova nasce vazio. Sem as variáveis de bootstrap e sem usuários cadastrados, não há conta para autenticar.

### Comandos de desenvolvimento

| Comando | Função |
| --- | --- |
| `npm run dev` | Sobe API e cliente juntos. |
| `npm run dev:server` | Sobe apenas a API na porta 4000. |
| `npm run dev:client` | Sobe apenas o cliente na porta 5173. |
| `npm run build` | Compila servidor e cliente. |
| `npm run typecheck` | Executa a verificação de tipos de servidor e cliente. |
| `npm run test` | Executa as suítes de testes de servidor e cliente. |

## 6. Segurança

- Senhas são armazenadas com hash `bcryptjs`; a senha nunca é retornada pela API.
- A sessão é mantida em cookie `httpOnly`, com `SameSite=Lax` e `secure` em produção. O token fica registrado no servidor.
- O login possui limitação de tentativas por IP e e-mail.
- As permissões por papel e por posse do recurso são verificadas no servidor. Tentativas de acesso negado são auditadas.
- O download de anexos é autorizado por vínculo com a entrega, o reforço ou o papel do usuário.
- O upload aceita imagens e PDF, com limite de tamanho e validação de tipo.
- Não insira dados reais de estudantes em ambientes de teste.

## 7. Migrações

O schema do banco vive em `app/server/src/db/migrations/` e é aplicado por um runner versionado (`runMigrations`), que roda na subida e nos testes. A tabela `schema_migrations` registra as versões já aplicadas; cada migração pendente roda dentro de uma transação própria e só é marcada ao concluir com sucesso. Depois de cada migração, o runner executa `PRAGMA foreign_key_check` e falha, com `ROLLBACK`, se houver referência órfã.

As versões atuais vão da `001` à `007` e cobrem schema inicial, chaves estrangeiras e índices, base da V3, remoção de conquistas, anexos do reforço e vínculo de notificação com atividade. O passo a passo para adicionar migrações está no [README da aplicação](../app/README.md).

## 8. Limitações atuais

- O projeto é um protótipo acadêmico, não um sistema institucional em produção.
- O banco nasce vazio e não há seed automático no boot; o seed de demonstração é uma fixture de teste. O primeiro coordenador depende das variáveis `BOOTSTRAP_ADMIN_*`.
- Não há integração com sistemas acadêmicos institucionais, como o SIGA, nem login único institucional.
- Não há URL pública de demonstração nem configuração de deploy com HTTPS neste repositório.
- O perfil é somente leitura nesta versão; não há edição de nome, foto ou senha pelo próprio usuário.
- Não há recuperação de senha por e-mail nem cadastro público.
- Não há campanha formal de pesquisa com usuários reais; a validação atual é feita por testes automatizados e testes funcionais propostos.
- Não há token CSRF dedicado; a mitigação atual é o cookie com `SameSite=Lax`.
- O banco é um arquivo SQLite local, sem replicação, backup automatizado ou operação multi-instância.
- A cobertura de testes de frontend existe e pode ser ampliada; ainda não há suíte de testes ponta a ponta.
- A grade curricular ainda não possui interface de manutenção.

## 9. Contribuição e manutenção

1. Abra uma issue descrevendo o problema ou a melhoria, quando possível.
2. Crie uma branch a partir da branch principal, com nome descritivo: `feat/...`, `fix/...` ou `docs/...`.
3. Mantenha o escopo da alteração pequeno e use mensagens de commit descritivas, preferencialmente no padrão de commits convencionais.
4. Antes de abrir o pull request, execute `npm run typecheck` e `npm run test` no diretório `app/`. Quando a alteração afetar build ou produção, execute também `npm run build`.
5. Ao alterar rotas, atualize o [contrato da API](../app/docs/api-contract.md). Ao alterar entidades ou regras compartilhadas, atualize `app/shared/types.ts` e verifique cliente e servidor juntos. Ao adicionar uma migração, mantenha-a idempotente e tolerante a reexecução.
6. Não envie arquivos de banco, anexos, `.env`, `node_modules`, credenciais reais ou dados pessoais de estudantes.

O texto do TCC e os documentos internos de planejamento não fazem parte do repositório público e não devem ser incluídos em pull requests.

## 10. Documentação relacionada

- [README raiz](../README.md) — apresentação do projeto, público e instruções básicas.
- [README da aplicação](../app/README.md) — execução, comandos, migrações e recursos implementados.
- [Contrato da API](../app/docs/api-contract.md) — convenções, autenticação, rotas, permissões, códigos de erro e códigos de auditoria.
- [Roadmap técnico](ROADMAP.md) — fases, decisões de produto, modelo de dados, riscos e próximos passos.
- [Índice da documentação](README.md) — documentos publicados e ordem de leitura sugerida.
