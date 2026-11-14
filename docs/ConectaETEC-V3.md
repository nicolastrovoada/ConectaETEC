# Conecta ETEC — V3 (Plano Vivo de Evolução)

- **Data de início:** 24/09/2026
- **Status geral:** `EM VERIFICAÇÃO FINAL` — fases 1–4 concluídas; F.1 (este resumo) concluída; F.2 (regressão final) pendente. Plano de implementação: `docs/superpowers/plans/2026-09-24-conectaetec-v3.md`
- **Propósito:** este documento é o **registro vivo** da evolução V3 do app. Ele será atualizado a cada fase cumprida e, ao término, transformado no **relatório-resumo das ações realizadas na V3**.

> ⚠️ **Continuidade:** se o processo for interrompido, este arquivo contém todo o escopo, decisões, fases e o progresso. Para retomar, leia a seção [Progresso](#progresso-e-status) e continue a partir da fase pendente.

---

## 1. Objetivo da V3

Evoluir o Conecta ETEC (app em `D:\ConectaETEC\app`) para um cenário mais fiel ao ensino médio técnico: dados de demonstração limpos, grade BNCC, entregas com tolerância a atraso (meia pontuação), reforço escolar real criado pelos professores, isolamento de conteúdo por papel (professor/funcionário), notificações persistentes vs. transitórias, relatórios completos na coordenação, auditoria corrigida e perfil editável.

**Regra de execução:** o orquestrador **não implementa diretamente** — delega cada unidade de trabalho a subagentes especialistas (`tcc-backend-dev`, `tcc-gamification`, `tcc-frontend-dev`, `tcc-reviewer`, `web-qa`) e o humano apenas revisa.

---

## 2. Decisões confirmadas (20 perguntas respondidas)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Reset da demo | **Reset total do banco**: apaga entregas, transações/pontos, resgates, notificações, conquistas e auditoria; mantém usuários demo e recria seed limpo. |
| 2 | Excluir atividade | **Soft delete + lista na coordenação**: atividade some de professor/alunos, fica arquivada e visível só à coordenação. |
| 3 | Pontos pós-exclusão | **Mantêm os pontos** já concedidos. |
| 4 | Janela de atraso | **Padrão de 7 dias** quando o professor não definir; configurável por atividade. |
| 5 | Fora da janela | **Bloqueia o envio** ("prazo encerrado"). |
| 6 | Meia pontuação | **Automática, com arredondamento p/ cima** (`ceil(points/2)`, ex. 15 → 8). |
| 7 | Grade BNCC | **BNCC (12) + técnicas do curso**. Lista será editada manualmente depois pelo responsável. |
| 8 | Reforço escolar | **Evoluir StudyContent** para lições reais criadas pelos professores nas próprias matérias. |
| 9 | Pontos no reforço | **+5 pontos únicos** por reforço concluído. |
| 10 | Notificações | Somem sozinhas: tarefa enviada, nível, pontos. Ficam até ler/resolver: nova atividade, correção solicitada, aviso da coordenação. |
| 11 | Aviso da coordenação | **Recurso novo**: coordenação envia avisos (todos ou por turma) como notificação persistente até ler. |
| 12 | Conquistas | **Remover por completo** (tabela, serviço, UI, notificações, testes). |
| 13 | Turmas | **1º/2º/3º Ano A** (`course` em campo separado), editáveis e expansíveis para novos cursos/turmas no futuro. |
| 14 | Filtros de validação | **Matéria + Atividade + Status + Aluno + Período**, em aba oculta revelada pelo educador. |
| 15 | Isolamento por papel | Professor/funcionário veem **só atividades próprias**; coordenação vê todas. |
| 16 | Desempenho professor | **Métricas por atividade + ranking** da turma, isolado por dono. |
| 17 | Relatório coordenação | Filtros período/turma/matéria/professor + conclusão/atraso por atividade + rankings + **CSV em tudo**. |
| 18 | Auditoria | Período + papel + busca; exibir **data e hora**; **reset** da tabela. |
| 19 | Edição de perfil | **Foto, nome e senha** (revoga sessões ao trocar a senha) + mais informações exibidas. |
| 20 | Documento vivo | Este arquivo, atualizado ao longo do processo e convertido em resumo final. |

**Ajustes/manuais do responsável:**
- Grade de matérias: será **editada manualmente** depois (adicionar/remover conforme necessidade).
- Turmas: **3 turmas** iniciais; novos cursos e turmas poderão ser criados pela coordenação via CRUD já existente.

---

## 3. Fases de trabalho (ordem de execução)

> Cada fase marca seu status em [Progresso](#progresso-e-status). Backend/testes primeiro; frontend depois; revisão e QA por fim.

### Fase 1 — Dados e seed (base da V3)
**Subagentes:** `tcc-backend-dev` → depois `tcc-reviewer`.
- [x] Reset: migrações + seed idempotente com banco **limpo** (usuários demo mantidos; sem atividades/entregas/transações/notificações/auditoria/conquistas; recompensas com estoque cheio).
- [x] Turmas: `1º Ano A`, `2º Ano A`, `3º Ano A`; `course = "Técnico em Administração"`; turnos; alunos distribuídos; professor por turma.
- [x] Matérias: 12 da BNCC (Português, Matemática, Inglês, Artes, Ed. Física, Filosofia, Sociologia, Biologia, Física, Química, História, Geografia) + técnicas (Administração Geral, Contabilidade Básica, Matemática Financeira, Direito Empresarial). Remover "Ação Escolar". **Centralizar a lista no seed para edição manual futura.**
- [x] Remover conquistas **por completo**:
  - `ACHIEVEMENT_DEFS`/`earnedAchievementCodes` e tipos em `app/shared/types.ts`;
  - `server/src/services/achievements.ts` e chamadas em `services/points.ts`;
  - endpoints relacionados em `routes/users.ts` (`/achievements`);
  - bloco de conquistas em `pages/shared/ProfileView.tsx`;
  - migração/tabela `achievements`, seed e `tests/achievements.test.ts`;
  - ação de auditoria `ACHIEVEMENT_EARNED` e notificação de conquista.
- [x] Auditoria: limpar a tabela no seed (reset) — sem quebrar migrações anteriores.

### Fase 2 — Gamificação e atividades (core de regras)
**Subagentes:** `tcc-gamification` (regras) + `tcc-backend-dev` (rotas) → `tcc-reviewer`.
- **Entrega atrasada:**
  - [x] Migração 004: `Activity.lateWindowDays` (INTEGER, default 7; 0 = sem tolerância).
  - [x] Envio: dentro do prazo = normal; até o fim da janela = `delayed`; após a janela = **bloqueado** (`isDeadlineExpired` deve considerar janela).
  - [x] Aprovação de entrega atrasada: pontos = `ceil(points/2)`, automático, marca entrega como atrasada, auditado e notificado.
  - [x] UI do formulário de atividade: campo "Tolerância de entrega (dias)".

- **Soft delete de atividade:**
  - [x] `Activity.deletedAt` + `deletedBy` (migração 004). Listas do professor/aluno filtram excluídas.
  - [x] Endpoint para professor excluir atividade própria (pontos já dados **mantidos**).
  - [x] Coordenação: aba **"Atividades excluídas"** (excluída por, quando; permite ver detalhes).
  - [x] Auditoria `ACTIVITY_DELETED`.

- **Isolamento por papel:**
  - [x] Listagens (`activities`, `submissions`): teacher/staff veem **somente atividades onde são `teacherId`**; coordenação vê todas. Sem quadro compartilhado entre professores.
  - [x] Ajustar telas prof (`TeacherActivitiesView`, `TeacherValidateView`, `TeacherPerformanceView`) e staff para o escopo próprio.

### Fase 3 — Reforço escolar e notificações
**Subagentes:** `tcc-backend-dev` + `tcc-frontend-dev` → `tcc-reviewer`.
- **StudyContent → reforço real:**
  - [x] Migração 004: novos campos (descrição, conteúdo/lição, anexos, questões de verificação JSON, `teacherId`, `classIds[]`, `points` default 5).
  - [x] Conclusão: tabela `study_content_completions`; **+5 pontos únicos** por reforço/aluno (transação `bonus` tipo novo `study_content`), 1 vez só.
  - [x] CRUD: professor cria/edita **suas** matérias; coordenação vê/tudo. Professor pode criar reforço p/ turmas onde atua.
  - [x] Aluno: tela de reforço mostrando lições das matérias dos **seus** professores, com verificação e pontos únicos.

- **Notificações:**
  - [x] Migração 004: coluna `transient` (0/1).
  - [x] **Transientes** (somem após aparecer): tarefa enviada (submissão), nível, pontos/bônus, aprovação/reprovação.
  - [x] **Persistentes** (até ler/resolver): nova atividade (até ler), correção solicitada (resolve sozinha ao reenviar), aviso da coordenação (até ler).
  - [x] Aviso da coordenação: entidade `notices` (título, mensagem, alvo `all` | `classIds`) que gera notificação persistente por destinatário; quadro na coordenação.
  - [x] Ajustar `pages/shared/NotificationsView.tsx` (distinção transitório/persistente) e `useNotifications`.

### Fase 4 — Validação, painéis, relatórios, auditoria e perfil
**Subagentes:** `tcc-frontend-dev` + `tcc-backend-dev` → `web-qa`.
- **Filtros de validação (aba oculta):**
  - [x] `SubmissionsManager`: botão revela painel com **Matéria + Atividade + Status + Aluno (nome) + Período de envio**; aplica a teacher/staff/coord.
- **Minha Turma (professor):**
  - [x] Lista de alunos (nome/email/nível/saldo/streak), pontuação geral e por matéria, export CSV.
- **Desempenho professor:**
  - [x] Métricas por atividade própria (entregas, aprovação, atraso, taxa), ranking da turma, isolado.
- **Relatório coordenação:**
  - [x] Filtros período/turma/matéria/professor; conclusão e atraso por atividade/professor; rankings por turma e matéria; **CSV em todos**.
- **Auditoria:**
  - [x] Exibir data **e hora** por registro; filtros período + papel + busca; mantém paginação.
- **Perfil:**
  - [x] Edição própria: **foto (upload)**, nome, senha (confirmação + revogação de sessões ao trocar).
  - [x] Mais informações exibidas: turma/curso, matérias do professor, saldo/nível/streak, "desde".

---

## 4. Mudanças no modelo de dados (resumo)

| Entidade | Mudança |
|----------|---------|
| `Activity` | `lateWindowDays` INT default 7; `deletedAt`; `deletedBy` |
| `Submission` | `delayed` 0/1 (definido no envio); badges "atrasada" nas listas |
| `Notification` | `transient` 0/1 |
| `StudyContent` | descrição, conteúdo/lição, anexos, questões JSON, `teacherId`, `classIds[]`, `points` |
| `StudyContentCompletion` (nova) | `studentId`, `studyContentId`, `completedAt`, UNIQUE ambos |
| `Notice` (nova) | título, mensagem, alvo (`all`/`classIds`), `createdBy`, `createdAt` |
| `User` | avatar passa a suportar foto enviada (URL/file) |
| Conquistas | **removidas** (tabela/service/UI/tests) |
| AuditLog | sem mudança estrutural; exibição com hora e filtros; tabela resetada no seed |

---

## 5. Verificação e QA

- **Backend:** testes Vitest nas novas regras — janela de atraso (envio no prazo/atrasado/bloqueio, `ceil` de pontos), soft delete + mantém pontos, isolamento por papel, notificações transitórias/persistentes, avisos, reforço (+5 único), perfil/foto/senha, auditoria.
- **Frontend:** testes dos filtros ocultos de validação, formulários de atividade/reforço/aviso, painel Minha Turma.
- **Final:** `npm run build`, lint/typecheck no client e server; banca `web-qa` por laço funcional.
- **Regressão:** RF01–RF14 e RN01–RN06 devem seguir verdes (checklist do `tcc-reviewer`).
- **Resultado em 11/11/2026 (pré-F.2):** `npm run typecheck` exit 0; **409 testes de servidor (28 arquivos)** e **246 de client (21 arquivos)** verdes; `npm run build` exit 0. A regressão manual com os 4 papéis é o escopo da F.2.

---

## 6. Progresso e status

| Fase | Status | Observações |
|------|--------|-------------|
| 1 — Dados e seed | ✅ Concluída | Tasks 1.1–1.4: seed limpo (turmas 1º/2º/3º ano A, grade BNCC + técnicas), conquistas removidas por completo, auditoria resetada, tipos V3 |
| 2 — Gamificação e atividades | ✅ Concluída | Tasks 2.1–2.6: janela de atraso com meia pontuação, soft delete de atividade com lixeira na coordenação, isolamento de conteúdo por dono |
| 3 — Reforço e notificações | ✅ Concluída | Tasks 3.1–3.5: reforço escolar real (lição, anexos, verificação, +5 único), telas de aluno/professor, notificações transitórias vs. persistentes e avisos da coordenação |
| 4 — Validação, painéis, relatórios, auditoria, perfil | ✅ Concluída | Tasks 4.1–4.7: filtros ocultos de validação, Minha Turma, desempenho do professor isolado, relatório da coordenação com CSV, auditoria com hora/filtros/reset, perfil editável e coordenação com filtros completos |
| Round de limpeza pós-fase 4 | ✅ Parcial (2 rounds) | Round 1: dívidas de 4.5–4.7 (teacher-summary por id, CSV anti-injection, resíduos de teste). Round 2: **C4** resolvido, **RN06** auditado, busca de usuários sem acento, roster de professor em `teacherIds` e limpeza de auditoria/CSV nos testes. Restam ~40 *minors* antigos e o M-6 (N+1 do CSV) |
| Revisão final + resumo V3 | 🚧 Em andamento | F.1 ✅ (este documento); F.2 (regressão final QA) pendente |

> **Dívidas em aberto registradas no ledger** (`app/.superpowers/sdd/2026-09-24-conectaetec-v3/progress.md`):
> o ledger acumulou **~40 *minors*** das fases 1–3 (comentários que o código não cumpre, helpers duplicados, asserções fracas, regra de posse escrita à mão em 4 lugares), além de **M-6** (N+1 do ramo CSV em `routes/classes.ts`), **C1** (divergência u6/c3 — ver §7.4), endurecimento do avatar (atomicidade/resize/EXIF), `preselectActivityId` de outra matéria e os 4 *minors* da review do round 2 (2 JSDoc/comentários desatualizados + 2 coberturas de teste). **C4 está resolvido** no round 2: `/uploads/:storedName` esconde (403 + auditoria) anexo de atividade soft-deletada para todos os papéis.

---

## 7. Relatório-resumo das ações V3 (preenchido ao final)

### 7.1 O que foi entregue, por fase

**Fase 1 — Dados e seed.**
- Banco de demonstração resetado por migrações + seed idempotente: usuários demo mantidos; atividades, entregas, transações/pontos, resgates, notificações e auditoria limpos; recompensas com estoque cheio.
- Turmas `1º Ano A`, `2º Ano A` e `3º Ano A`, curso `Técnico em Administração`, turnos e professores por turma.
- Grade centralizada no seed: 12 matérias da BNCC + 4 técnicas do curso (Administração Geral, Contabilidade Básica, Matemática Financeira, Direito Empresarial). A lista fica pronta para edição manual (§7.4).
- Conquistas removidas por completo: tipos, serviço, chamadas de pontos, endpoints, UI do perfil, tabela/migração, seed, testes, auditoria e notificação.
- Auditoria resetada no seed sem quebrar migrações anteriores; tipos e mappers alinhados à V3.

**Fase 2 — Gamificação e atividades.**
- Migração 004 com `lateWindowDays` (default 7; 0 = sem tolerância), `deletedAt`/`deletedBy`, `transient` e os campos do reforço.
- Envio dentro do prazo = normal; dentro da janela = `delayed`; após a janela = bloqueado com "prazo encerrado".
- Aprovação de entrega atrasada credita `ceil(points/2)` automaticamente, marca a entrega, audita e notifica.
- Formulário de atividade com "Tolerância de entrega (dias)".
- Soft delete de atividade com pontos mantidos, endpoint do professor dono, aba "Atividades excluídas" na coordenação e auditoria `ACTIVITY_DELETED`.
- Isolamento por dono em atividades/entregas: professor e funcionário veem só as próprias; coordenação vê todas. Telas de professor e staff ajustadas.

**Fase 3 — Reforço escolar e notificações.**
- `StudyContent` evoluído para reforço real: descrição, lição, anexos, questões de verificação, `teacherId`, `classIds[]` e `points` (default 5).
- Tabela `study_content_completions` com +5 pontos únicos por reforço/aluno (transação `bonus` tipo `study_content`), creditados uma única vez.
- CRUD de reforço pelo professor dono, com anexos e funcionário apoiando o material; coordenação vê tudo.
- Telas de reforço do aluno e do professor, com estado de conclusão vindo da API.
- Notificações transitórias (somem: envio, nível, pontos, aprovação/reprovação) e persistentes (nova atividade, correção solicitada, aviso da coordenação).
- Recurso novo de avisos da coordenação (`notices`) para todos ou por turma, gerando notificação persistente por destinatário; `NotificationsView` e `useNotifications` ajustados.

**Fase 4 — Validação, painéis, relatórios, auditoria e perfil.**
- `SubmissionsManager` com aba oculta de filtros: Matéria + Atividade + Status + Aluno + Período, aplicada a professor, funcionário e coordenação.
- "Minha Turma" do professor: alunos (nome, e-mail, nível, saldo, streak), pontuação geral e por matéria, export CSV.
- Desempenho do professor por atividade própria (entregas, aprovação, atraso, taxa) e ranking da turma, isolado por dono.
- Relatório da coordenação com filtros de período/turma/matéria/professor, conclusão e atraso por atividade/professor, rankings por turma/matéria e CSV em todos os blocos.
- Auditoria com data e hora, filtros de período/papel/busca, paginação preservada e reset no seed.
- Perfil editável: foto (upload com preview), nome e senha (senha atual obrigatória e revogação das outras sessões); exibição de turma/curso, matérias do professor, saldo/nível/streak e "desde".
- Coordenação usando os mesmos filtros completos de validação e enxergando todas as atividades.

**Limpeza pós-fase 4 (2 rounds).**
- Round 1: `teacher-summary` agrupado por `teacherId` (homônimos não somam juntos), CSV neutralizando injeção de fórmula (`= + - @ TAB CR`), resíduos de teste removidos e reset de atividade ao trocar matéria.
- Round 2: **C4** — anexo de atividade soft-deletada deixa de ser servido em `/uploads` (403 + `ACCESS_DENIED` para todos os papéis); **RN06** — leitura de notificação alheia passa a 403 auditado (inexistente continua 404); busca de usuários sem acento e literal (`namekey`/`instr`); professor cadastrado com turma vai para `teacherIds` (não corrompe mais `studentIds`); auditoria e cobertura de CSV ajustadas nos testes.

### 7.2 Decisões finais

- As 20 decisões da §2 foram implementadas como escritas. Destaques: pontos mantidos após exclusão; meia pontuação automática com `ceil`; +5 único por reforço; soft delete com lixeira da coordenação; isolamento por dono para professor/funcionário; CSV em todos os relatórios; perfil com foto/nome/senha.
- **C4 (anexo de atividade excluída):** decidido esconder. `/uploads/:storedName` responde 403 com auditoria para atividade soft-deletada, inclusive para coordenação e aluno autor; restaurar a atividade volta a servir o arquivo.
- **RN06 (notificação alheia):** decidido alinhar ao resto da API — 403 com `ACCESS_DENIED` em vez de 404 silencioso. O trade-off é que o 403 revela a existência do id; aceito e documentado no código.
- **Relatórios e desempenho:** escopo por `teacherId` (dono), nunca por turma compartilhada; homônimos separados por id.

### 7.3 Qualidade e verificação

- Suíte automatizada ao final da F.1: **409 testes de servidor (28 arquivos)** e **246 de client (21 arquivos)**, `npm run typecheck` e `npm run build` verdes.
- Cada task passou por implementer + review independente, com fix rounds quando necessário; as reviews e relatórios ficam em `app/.superpowers/sdd/2026-09-24-conectaetec-v3/`.
- A regressão manual dos 4 papéis (login, entrega, aprovação, atraso, reforço, aviso, relatório, auditoria, perfil) é a F.2 e fecha o plano.

### 7.4 Pendências deixadas ao responsável

- **Lista de matérias:** a grade está centralizada em `app/server/src/db/seed.ts` para edição manual (adicionar/remover matérias e ajustar professores).
- **C1 (divergência u6/c3):** o seed mantém de propósito `u6.classIds` com `c3`, mas `c3.teacherIds = [u7]`. Efeito: Marcelo pode criar atividade no 3º Ano A, mas os relatórios dele não cobrem c3. Recomendação: reconciliar `c3.teacherIds` incluindo `u6` (decisão de coordenação) e atualizar os testes que pinam os dois lados.
- **~40 *minors* antigos** das fases 1–3: comentários que o código não cumpre, helpers duplicados, asserções fracas e a regra de posse escrita à mão em 4 lugares. Nenhum bloqueia entrega; são polimento/cobertura.
- **M-6:** N+1 no ramo CSV de `routes/classes.ts` (tensão entre as regras R6 e R13), adiado explicitamente.
- **Avatar:** upload ainda não faz resize/EXIF e a gravação/limpeza de órfãos pode ser endurecida (FIX-9).
- **Coberturas menores:** busca de usuários por e-mail, prova de "404 sem auditoria" em notificação inexistente, `preselectActivityId` de outra matéria e os 2 comentários desatualizados apontados na review do round 2.
- **Documentação de API:** registrar a mudança de contrato do `PATCH /api/notifications/:id/read` (404 → 403 + auditoria) em `docs/api-contract.md`, se o documento for mantido.