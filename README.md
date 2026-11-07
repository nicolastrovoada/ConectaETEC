# Conecta ETEC

**Plataforma de engajamento escolar — ETEC Cravinhos, Centro Paula Souza — TCC 2026**

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)

> **Status:** protótipo funcional full-stack em evolução. O projeto não é um sistema institucional pronto para produção e ainda não possui URL pública de demonstração.

## Visão do produto

O Conecta ETEC reúne, em uma única plataforma, atividades escolares, entregas, validação por responsáveis, pontuação, recompensas, reforço de conteúdo, notificações, indicadores e auditoria. A proposta é tornar a participação do estudante mais visível e significativa, ao mesmo tempo que oferece à equipe escolar uma visão centralizada da rotina acadêmica.

O projeto parte de um problema recorrente no ensino médio técnico: parte dos estudantes apresenta baixa motivação para participar das atividades, dificuldade de manter uma rotina constante de estudo e esquecimento de prazos. Ao mesmo tempo, professores e funcionários acumulam tarefas manuais de cobrança, conferência e registro. A hipótese de solução é integrar o ciclo **atividade → entrega → validação → pontos → recompensa/acompanhamento**, reduzindo a fragmentação do processo sem transferir ainda mais carga operacional à equipe.

O repositório reúne o protótipo que servirá de base para o site oficial do Conecta ETEC. O público-alvo inclui avaliadores do TCC, professores, estudantes e futuros desenvolvedores do projeto.

## Contexto acadêmico

Trabalho de Conclusão de Curso desenvolvido na ETEC Cravinhos, Centro Paula Souza, em 2026.

- **Autores:** Caio Silva Mota Cardim, Daniel Cardoso Ramalho, Guilherme Guedes Leandro, João Silvério Neto e Nicolas Magalhães Santos.
- **Orientador:** Prof. Lucas Juliano Reche.

O texto do TCC, o briefing interno e os arquivos-fonte originais não fazem parte do repositório público. A documentação técnica publicada está indicada na seção [Documentação](#documentação).

## Funcionalidades por perfil

A aplicação possui quatro perfis de acesso, com painéis e permissões distintas. As regras de autorização são aplicadas no servidor, não apenas na interface.

### Aluno

- Painel com saldo, nível, atividades pendentes, entregas e retornos de validação.
- Lista de atividades da própria turma, com visão em lista ou calendário.
- Envio e reenvio de entregas com comentário e evidência textual, quando a correção é solicitada.
- Anexos de evidência em imagem (JPEG, PNG, WebP ou GIF) ou PDF, com limite de três arquivos de 5 MB cada.
- Reforço escolar das turmas em que está matriculado, com lição, questões de verificação, anexos e crédito único de pontos ao concluir.
- Loja de recompensas com resgate sujeito a saldo e estoque.
- Extrato de pontos, notificações e perfil com dados e estatísticas de participação.

### Professor

- Visão geral das próprias atividades, turmas, entregas pendentes e validações.
- Criação, edição, publicação, encerramento e exclusão lógica de atividades das próprias turmas.
- Configuração da janela de tolerância de entrega, em dias, por atividade.
- Validação de entregas com aprovação, reprovação ou solicitação de correção, com feedback obrigatório em reprovação e solicitação de correção e opcional na aprovação.
- Filtros de validação por matéria, atividade, status, aluno e período de envio.
- Criação e gestão de reforço escolar das próprias turmas, com questões e anexos.
- Tela "Minhas Turmas", com lista de alunos, saldo, nível, sequência, pontuação por matéria e exportação em CSV.
- Tela de desempenho com métricas das próprias atividades e ranking da turma, restrita ao escopo do professor.
- Notificações e perfil.

### Funcionário

- Visão geral das ações escolares e validações.
- Criação e gestão de atividades de tipo operacional: ação escolar, evento, biblioteca e suporte.
- Validação das entregas relacionadas às próprias atividades.
- Histórico de entregas e validações.
- Notificações e perfil.

### Coordenação

- Visão global da escola, com indicadores de usuários, turmas, atividades, entregas e pontos.
- Cadastro, edição, ativação e desativação de usuários; o cadastro é restrito à coordenação.
- Gestão de turmas e disciplinas.
- Acompanhamento de todas as atividades, incluindo a lista de atividades excluídas por exclusão lógica.
- Avisos para toda a escola ou para turmas específicas, com notificação persistente por destinatário.
- Validação de entregas de qualquer atividade.
- Gestão de pontos, bônus, ajustes, recompensas e resgates.
- Relatórios consolidados com exportação em CSV.
- Auditoria com data e hora, filtros por papel e paginação no servidor.
- Notificações e perfil.

## Requisitos funcionais confirmados

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

## Regras de negócio confirmadas

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

## Stack e arquitetura

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
| Testes | Vitest 5, Testing Library, MSW e Supertest |
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

O banco é criado automaticamente na primeira subida. O servidor executa migrações versionadas antes do seed, usa transações para operações sensíveis e mantém chaves estrangeiras e `PRAGMA foreign_key_check` como proteção de integridade. O seed é idempotente e só popula o banco quando ainda não há usuários.

## Estrutura de pastas

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
    ROADMAP.md           # Roadmap técnico e plano de evolução
    README.md            # Índice da documentação técnica
  .env.example           # Referência das variáveis de ambiente
  README.md
```

## Como rodar localmente

### Pré-requisitos

- Node.js **24 ou superior**. O servidor usa o módulo nativo `node:sqlite`, portanto não é necessária compilação nativa de banco.
- npm.

### Instalação e execução

Com o repositório clonado, entre no diretório do monorepo e instale as dependências:

```bash
git clone https://github.com/nicolastrovoada/ConectaETEC.git
cd ConectaETEC/app
npm install
npm run dev
```

O comando `npm run dev` sobe a API e o cliente em conjunto:

- API: `http://localhost:4000`
- Cliente: `http://localhost:5173`

Abra `http://localhost:5173` no navegador. Em desenvolvimento, o Vite encaminha `/api` e `/uploads` para a API na porta 4000.

Na primeira subida, o banco SQLite é criado em `app/server/data/`, as migrações pendentes são aplicadas e o seed de demonstração é executado se o banco estiver vazio. Os anexos ficam em `app/server/data/uploads/`.

### Outros comandos

| Comando | Função |
| --- | --- |
| `npm run dev` | Sobe API e cliente juntos. |
| `npm run dev:server` | Sobe apenas a API na porta 4000. |
| `npm run dev:client` | Sobe apenas o cliente na porta 5173. |
| `npm run build` | Compila servidor e cliente. |
| `npm run typecheck` | Executa a verificação de tipos de servidor e cliente. |
| `npm run test` | Executa as suítes de testes de servidor e cliente. |

## Variáveis de ambiente

O repositório inclui o [.env.example](.env.example) com as variáveis e os valores de exemplo. O servidor carrega automaticamente o primeiro arquivo `.env` encontrado, nesta ordem de precedência: `app/server/.env`, `app/.env` e `.env` na raiz do repositório. Variáveis já definidas no ambiente do processo têm precedência sobre o arquivo, e a ausência do `.env` não impede a subida — nesse caso valem os valores padrão da tabela abaixo.

O `.env` é opcional e ignorado pelo Git; apenas o `.env.example` é versionado. Para personalizar a configuração local, copie o exemplo para um dos caminhos aceitos e ajuste os valores. Em produção, prefira definir as variáveis diretamente no ambiente da plataforma.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `4000` | Porta HTTP da API. |
| `DB_PATH` | `server/data/conectaetec.db` | Caminho do banco SQLite. Use `:memory:` nos testes. |
| `DATA_DIR` | `server/data` | Diretório de persistência do servidor. |
| `UPLOAD_DIR` | `server/data/uploads` | Diretório dos anexos enviados. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem permitida para requisições com credenciais. |
| `NODE_ENV` | desenvolvimento | Em `production`, ativa o cookie de sessão com `secure` e desativa o seed de demonstração por padrão. |
| `SEED_DEMO` | não definido (`0` no exemplo) | Com `1`, força a execução do seed de demonstração, inclusive fora do ambiente de desenvolvimento. O seed só popula um banco sem usuários. |

Os caminhos padrão são relativos ao diretório de execução do workspace do servidor (`app/server`).

## Credenciais de demonstração

As contas abaixo são criadas pelo seed local. A senha de todas é `123456`.

| Perfil | E-mail |
| --- | --- |
| Aluno | `ana@etec.sp.gov.br` |
| Professor | `marcelo@etec.sp.gov.br` |
| Funcionário | `carlos@etec.sp.gov.br` |
| Coordenação | `juliana@etec.sp.gov.br` |

> **Aviso:** essas credenciais servem exclusivamente para teste local. Não use em ambiente público. As senhas são armazenadas com hash `bcryptjs`; o seed de demonstração é desativado em `NODE_ENV=production` por padrão. O cadastro de novos usuários é restrito à coordenação.

## Segurança e privacidade

- Senhas são armazenadas com hash `bcryptjs`; a senha nunca é retornada pela API.
- A sessão é mantida em cookie `httpOnly`, com `SameSite=Lax` e `secure` em produção. O token fica registrado no servidor.
- O login possui limitação de tentativas por IP e e-mail.
- As permissões por papel e por posse do recurso são verificadas no servidor. Tentativas de acesso negado são auditadas.
- O download de anexos é autorizado por vínculo com a entrega, o reforço ou o papel do usuário.
- O upload aceita imagens e PDF, com limite de tamanho e validação de tipo.
- Os dados de demonstração são fictícios. Não insira dados reais de estudantes em ambientes de teste.

## Limitações atuais

- O projeto é um protótipo acadêmico, não um sistema institucional em produção.
- Não há integração com sistemas acadêmicos institucionais, como o SIGA, nem login único institucional.
- Não há URL pública de demonstração nem configuração de deploy com HTTPS neste repositório.
- O perfil é somente leitura nesta versão; não há edição de nome, foto ou senha pelo próprio usuário.
- Não há recuperação de senha por e-mail nem cadastro público.
- Não há campanha formal de pesquisa com usuários reais; a validação atual é feita por testes automatizados e testes funcionais propostos.
- Não há token CSRF dedicado; a mitigação atual é o cookie com `SameSite=Lax`.
- O banco é um arquivo SQLite local, sem replicação, backup automatizado ou operação multi-instância.
- A cobertura de testes de frontend existe e pode ser ampliada; ainda não há suíte de testes ponta a ponta.

## Documentação

- [Contrato da API](app/docs/api-contract.md) — convenções, autenticação, rotas por domínio, códigos de erro e códigos de auditoria.
- [Roadmap técnico](docs/ROADMAP.md) — visão, escopo, fases, mudanças no modelo de dados, critérios de verificação, riscos e limitações e próximos passos da evolução.
- [Índice da documentação técnica](docs/README.md) — visão geral dos documentos publicados e ordem de leitura sugerida.

## Roadmap e próximos passos

O protótipo já cobre o ciclo principal e a base técnica necessária para evoluir ao site oficial. Os próximos passos previstos são:

| Próximo passo | Objetivo |
| --- | --- |
| Autenticação institucional | Integrar login único institucional (por exemplo, SIGA) e recuperação de senha, reduzindo o cadastro manual. |
| Deploy com HTTPS | Publicar em infraestrutura oficial, com HTTPS, backups, monitoramento e política de retenção de dados. |
| Integrações acadêmicas | Sincronizar turmas, matrículas e responsáveis com sistemas institucionais. |
| Pesquisa com usuários reais | Validar a hipótese de engajamento com estudantes e equipe escolar e medir impacto. |
| Testes de frontend e E2E | Ampliar a cobertura com Vitest, Testing Library, MSW e testes ponta a ponta dos fluxos principais. |
| Endurecimento de segurança | Adicionar token CSRF dedicado, revisar permissões e formalizar políticas de privacidade e retenção. |
| Conclusão de pendências da V3 | Finalizar os itens ainda planejados no documento de evolução, conforme prioridade dos autores. |

## Como contribuir

1. Abra uma issue descrevendo o problema ou a melhoria, quando possível.
2. Crie uma branch a partir da branch principal, com nome descritivo: `feat/...`, `fix/...` ou `docs/...`.
3. Mantenha o escopo da alteração pequeno e use mensagens de commit descritivas, preferencialmente no padrão de commits convencionais.
4. Antes de abrir o pull request, execute `npm run typecheck` e `npm run test` no diretório `app/`. Quando a alteração afetar build ou produção, execute também `npm run build`.
5. Ao alterar rotas, atualize o [contrato da API](app/docs/api-contract.md). Ao alterar entidades ou regras compartilhadas, atualize o contrato em `app/shared/types.ts` e verifique cliente e servidor juntos. Ao adicionar uma migração, mantenha-a idempotente e tolerante a reexecução.
6. Não envie arquivos de banco, anexos, `.env`, `node_modules`, credenciais reais ou dados pessoais de estudantes.

O texto do TCC, o briefing interno, os arquivos-fonte originais e os relatórios de planejamento não fazem parte do repositório público e não devem ser incluídos em pull requests.

## Licença

A licença de uso do projeto ainda não foi definida pelos autores. Enquanto não houver uma licença formal, o código é disponibilizado para avaliação acadêmica e consulta técnica, sem autorização implícita de reutilização ou redistribuição.
