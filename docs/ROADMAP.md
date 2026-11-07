# Roadmap técnico — Conecta ETEC

Este documento descreve o plano de evolução técnica da versão V3 do Conecta ETEC e o estado atual do protótipo. Ele consolida objetivo, escopo, fases, mudanças no modelo de dados, critérios de verificação, riscos e próximos passos, servindo como referência pública para avaliadores, desenvolvedores e demais interessados no projeto.

O roadmap é um documento vivo: a situação das fases reflete o código do repositório e pode ser atualizada à medida que novas entregas forem concluídas. Detalhes de contrato da API estão em [`app/docs/api-contract.md`](../app/docs/api-contract.md).

## 1. Visão

A evolução V3 busca aproximar o protótipo de um cenário real de ensino médio técnico, cobrindo lacunas identificadas na versão anterior:

- dados de demonstração limpos e coerentes com a grade curricular;
- grade composta pela Base Nacional Comum Curricular (BNCC) e por disciplinas técnicas do curso;
- entregas com tolerância a atraso e pontuação proporcional;
- reforço escolar criado pelos professores para as próprias turmas;
- isolamento de conteúdo por papel, evitando que professores e funcionários acessem atividades de terceiros;
- notificações transitórias e persistentes com semânticas distintas;
- avisos da coordenação para toda a escola ou para turmas específicas;
- relatórios consolidados com exportação em CSV;
- auditoria com data, hora e filtros.

O objetivo é manter o ciclo **atividade → entrega → validação → pontos → recompensa/acompanhamento** como eixo do produto, ampliando a rastreabilidade e reduzindo tarefas manuais da equipe escolar.

## 2. Escopo e decisões de produto

As decisões abaixo orientam a implementação e explicam o comportamento atual do protótipo.

| Tema | Decisão |
| --- | --- |
| Dados iniciais e demonstração | O banco nasce vazio; não há seed automático no boot. O seed de demonstração é uma fixture de teste, fora da subida normal. Quando não há usuários, o primeiro coordenador é criado via bootstrap pelas variáveis `BOOTSTRAP_ADMIN_*`. |
| Exclusão de atividade | Exclusão lógica: a atividade deixa de aparecer para professor e alunos, permanece visível para a coordenação e mantém os pontos já concedidos. |
| Janela de atraso | Padrão de 7 dias quando o professor não define outro valor; configurável por atividade, com 0 para nenhuma tolerância. |
| Envio fora da janela | Bloqueado, com indicação de prazo encerrado. |
| Meia pontuação | Aplicada automaticamente em aprovação de entrega atrasada, com arredondamento para cima: `ceil(pontuação / 2)`. |
| Grade curricular | Disciplinas da BNCC acrescidas das disciplinas técnicas do curso, centralizadas no seed de demonstração (fixture de teste) para edição posterior. |
| Reforço escolar | Conteúdo criado por professores para as próprias turmas, com lição, questões de verificação e anexos. |
| Pontuação do reforço | Crédito único de pontos por reforço concluído, por aluno, com valor configurável por reforço (padrão 5) e registro como transação do tipo `study_content`. |
| Notificações | Transitórias desaparecem após a exibição; persistentes permanecem até leitura ou resolução. |
| Avisos da coordenação | Entidade própria, com alcance para toda a escola ou para turmas específicas, gerando notificação persistente por destinatário. |
| Conquistas | Removidas do modelo, dos serviços, da interface e dos testes. |
| Turmas | 1º, 2º e 3º Ano A, com curso em campo separado e possibilidade de expansão futura. |
| Filtros de validação | Matéria, atividade, status, aluno e período de envio, em painel revelado pelo educador. |
| Isolamento por papel | Professores e funcionários acessam somente as próprias atividades; a coordenação acessa todas; o aluno acessa apenas as atividades das suas turmas. |
| Desempenho do professor | Métricas por atividade e ranking da turma, restritos ao escopo do professor. |
| Relatório da coordenação | Filtros por período, turma, matéria e professor, com indicadores de conclusão e atraso e exportação em CSV. |
| Auditoria | Consulta com data e hora, filtros por período, papel e busca textual, mantendo paginação no servidor. |
| Perfil | Somente leitura nesta versão: papel, data de cadastro e situação; para aluno, também saldo, nível e meta. A edição de perfil pelo próprio usuário permanece pendente. |

## 3. Fases

| Fase | Situação | Escopo |
| --- | --- | --- |
| 1 — Dados e seed | Concluída | Seed de demonstração limpo, usado como fixture de teste; turmas, grade BNCC e técnica, remoção de conquistas e reset da auditoria. |
| 2 — Gamificação e atividades | Concluída | Janela de atraso, meia pontuação, exclusão lógica e isolamento por papel. |
| 3 — Reforço e notificações | Concluída | Reforço escolar, conclusão única, notificações transitórias e persistentes e avisos da coordenação. |
| 4 — Validação, painéis, relatórios, auditoria e perfil | Parcialmente concluída | Filtros, painéis, relatórios e auditoria; a edição de perfil pelo próprio usuário permanece pendente. |
| 5 — Limpeza técnica | Planejada | Consolidação de dívidas técnicas acumuladas nas fases anteriores e ajuste do acesso a anexos de atividades excluídas. |
| 6 — Revisão final | Planejada | Revisão integrada do escopo, atualização da documentação e fechamento do resumo da V3. |

### Fase 1 — Dados e seed

- Seed de demonstração idempotente, usado como fixture de teste, com banco limpo: usuários de demonstração mantidos; sem atividades, entregas, transações, notificações ou auditoria; recompensas com estoque cheio.
- Turmas 1º Ano A, 2º Ano A e 3º Ano A, com curso, turno, alunos distribuídos e professor responsável.
- Grade curricular com 12 disciplinas da BNCC — Português, Matemática, Inglês, Artes, Educação Física, Filosofia, Sociologia, Biologia, Física, Química, História e Geografia — e disciplinas técnicas do curso, centralizadas no seed de demonstração usado como fixture de teste.
- Remoção completa de conquistas: tipos, serviços, rotas, interface, tabela, seed de demonstração, testes, auditoria e notificações relacionadas.
- Reset da tabela de auditoria no seed de demonstração (fixture de teste), sem quebrar migrações anteriores.

### Fase 2 — Gamificação e atividades

- Migração 004 com `Activity.lateWindowDays` (inteiro, padrão 7; 0 indica ausência de tolerância).
- Envio dentro do prazo tratado como normal; envio após o prazo e dentro da janela marcado como atrasado; envio após a janela bloqueado.
- Aprovação de entrega atrasada com pontuação `ceil(pontuação / 2)`, registro de auditoria e notificação ao aluno.
- Campo de tolerância de entrega no formulário de atividade.
- Exclusão lógica de atividade com `deletedAt` e `deletedBy`; listas de professor e aluno filtram atividades excluídas.
- Endpoint para o professor excluir a própria atividade, preservando os pontos concedidos.
- Aba de atividades excluídas na coordenação, com autor e data da exclusão.
- Auditoria da ação de exclusão.
- Listagens de atividades e entregas restritas ao proprietário para professores e funcionários; coordenação com visão global.

### Fase 3 — Reforço escolar e notificações

- Evolução de `StudyContent` para reforço real, com descrição, lição, anexos, questões de verificação, professor responsável, turmas destinatárias e pontuação.
- Tabela `study_content_completions` com conclusão única por aluno e reforço.
- Crédito único de pontos por reforço concluído, com valor configurável por reforço (padrão 5) e registro como transação do tipo `study_content`.
- Criação e edição de reforço restritas às disciplinas e turmas do professor; coordenação com visão global.
- Tela do aluno com reforços das matérias dos seus professores, verificação e crédito único.
- Notificações transitórias para envio de tarefa, nível, pontos, bônus e resultado de validação.
- Notificações persistentes para nova atividade, correção solicitada e aviso da coordenação.
- Entidade `notices` com título, mensagem, alcance e autor, gerando notificação persistente por destinatário.
- Ajuste da tela de notificações e do estado de leitura para distinguir os dois tipos.

### Fase 4 — Validação, painéis, relatórios, auditoria e perfil

- Painel de filtros de validação com matéria, atividade, status, aluno e período de envio, disponível para professor, funcionário e coordenação.
- Tela "Minhas Turmas" para o professor, com alunos, nível, saldo, sequência, pontuação por matéria e exportação em CSV.
- Tela de desempenho com métricas das próprias atividades, taxa de aprovação, atrasos e ranking da turma.
- Relatório da coordenação com filtros por período, turma, matéria e professor, indicadores de conclusão e atraso, rankings e exportação em CSV.
- Auditoria com data e hora, filtros por período, papel e busca textual, preservando a paginação no servidor.
- Perfil somente leitura com papel, data de cadastro e situação; para aluno, também saldo, nível e meta.
- Edição de perfil pelo próprio usuário, com alteração de nome, foto e senha. **Pendente.**

### Fase 5 — Limpeza técnica

- Consolidação de pequenas dívidas técnicas acumuladas nas fases anteriores, como helpers duplicados, comentários desatualizados e regras de posse repetidas.
- Ajuste do acesso a anexos: com exclusão lógica, o download de evidência de atividade excluída deve deixar de ser permitido, filtrando `deletedAt IS NULL`.
- Revisão das asserções de teste consideradas frágeis.

### Fase 6 — Revisão final

- Revisão integrada dos requisitos funcionais e das regras de negócio.
- Atualização da documentação técnica e do contrato da API.
- Consolidação do resumo das ações da V3 e das pendências deixadas aos responsáveis, como a revisão manual da lista de disciplinas.

## 4. Modelo de dados

| Entidade | Mudança |
| --- | --- |
| `Activity` | `lateWindowDays` inteiro com padrão 7; `deletedAt` e `deletedBy` para exclusão lógica. |
| `Submission` | Indicador `delayed` definido no envio, com identificação de atraso nas listagens. |
| `Notification` | Indicador `transient` para distinguir notificações transitórias de persistentes. |
| `StudyContent` | Descrição, lição, anexos, questões de verificação em JSON, `teacherId`, turmas destinatárias e pontuação. |
| `StudyContentCompletion` | Nova tabela com aluno, reforço, data de conclusão e restrição de unicidade por aluno e reforço. |
| `Notice` | Nova entidade com título, mensagem, alcance (`all` ou turmas), autor e data de criação. |
| Conquistas | Removidas do modelo, dos serviços, da interface e dos testes. |
| `AuditLog` | Sem mudança estrutural; exibição com data e hora, filtros e reset no seed de demonstração (fixture de teste). |

As migrações 004 a 007 concentram as alterações estruturais da V3: a 004 adiciona a janela de atraso, a exclusão lógica, o indicador de atraso, as notificações transitórias, as colunas do reforço, os avisos e as conclusões de reforço; a 005 remove a tabela de conquistas; a 006 cria os anexos do reforço e amplia o tipo de transação para `study_content`; a 007 adiciona `notifications.relatedActivityId`.

## 5. Verificação

A verificação da V3 combina testes automatizados e revisão funcional dos fluxos principais.

- **Backend:** testes com Vitest para janela de atraso, envio no prazo, envio atrasado e bloqueio; arredondamento da meia pontuação; exclusão lógica com preservação de pontos; isolamento por papel; notificações transitórias e persistentes; avisos da coordenação; conclusão única de reforço; auditoria.
- **Frontend:** testes dos filtros de validação, formulários de atividade, reforço e aviso, painel "Minhas Turmas" e estados de notificação.
- **Integração:** execução de `npm run build`, `npm run typecheck` e `npm run test` no diretório `app` (não há script de lint no projeto).
- **Revisão funcional:** percurso dos fluxos por perfil, conferindo permissões, notificações, pontos e auditoria.
- **Regressão:** os requisitos funcionais RF01 a RF14 e as regras de negócio RN01 a RN06 devem permanecer atendidos.

## 6. Riscos e limitações

- **Edição de perfil pendente:** o perfil permanece somente leitura nesta versão; não há edição de nome, foto ou senha pelo próprio usuário.
- **Anexos de atividades excluídas:** o ajuste para bloquear o download de evidências de atividades excluídas está previsto na fase de limpeza técnica.
- **Dívidas técnicas:** existem pequenos ajustes de código e de testes planejados para a revisão final.
- **Lista de disciplinas:** a grade curricular é mantida nos dados do seed de demonstração (fixture de teste) e ainda não possui interface de manutenção.
- **Persistência local:** o banco SQLite é um arquivo local, sem replicação, backup automatizado ou operação multi-instância.
- **Infraestrutura:** não há URL pública de demonstração nem configuração de deploy com HTTPS neste repositório.
- **Integração institucional:** não há integração com sistemas acadêmicos, como o SIGA, nem login único institucional.
- **Pesquisa com usuários:** não há campanha formal de pesquisa com estudantes e equipe escolar; a validação atual é feita por testes automatizados e testes funcionais propostos.
- **Cobertura de testes:** a suíte de frontend existe e pode ser ampliada; ainda não há testes ponta a ponta.

## 7. Próximos passos

1. Concluir a edição de perfil pelo próprio usuário, com foto, nome e senha, incluindo revogação de sessões ao trocar a senha.
2. Concluir a fase de limpeza técnica, incluindo o bloqueio de anexos de atividades excluídas e a revisão de helpers e asserções de teste.
3. Revisar a grade curricular e definir o processo de manutenção das disciplinas.
4. Ampliar a cobertura de testes de frontend e adicionar testes ponta a ponta dos fluxos principais.
5. Realizar pesquisa com usuários reais para validar a hipótese de engajamento e medir impacto.
6. Evoluir a autenticação para login único institucional e recuperação de senha.
7. Publicar o sistema em infraestrutura oficial, com HTTPS, backups, monitoramento e política de retenção de dados.
8. Integrar turmas, matrículas e responsáveis com sistemas acadêmicos institucionais.
9. Endurecer a segurança, com token CSRF dedicado, revisão de permissões e formalização de políticas de privacidade.
10. Atualizar este roadmap e o contrato da API ao final de cada fase concluída.
