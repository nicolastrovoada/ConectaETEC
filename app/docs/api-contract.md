# Contrato de API — Conecta ETEC V3

Base: `/api`. Autenticação por **cookie httpOnly de sessão** (`sid`), mantido no servidor (tabela `sessions` no SQLite). Todas as respostas são JSON, exceto os endpoints de download de arquivo e exportação CSV.

## Convenções

- Sucesso: `200` ou `201` → `{ data: ... }`.
- Erro: `{ error: string, details?: string | Array<{ path: string, message: string }> }`.
- O cliente deve enviar `credentials: "include"` em todas as requisições para manter o cookie de sessão.
- Campos de auditoria e de notificação são criados pelo servidor (RN06/RF12). O cliente não registra auditoria nem cria notificações diretamente.
- `User.password` nunca aparece nas respostas.
- Datas de domínio usam o formato brasileiro `DD/MM/AAAA`; timestamps de auditoria usam `DD/MM/AAAA, HH:MM:SS` no fuso de São Paulo.
- Identificadores são strings UUID.
- Paginação server-side segue `{ items, total, page, pageSize }`, com `page` iniciando em 1.

### Códigos HTTP

| Código | Uso |
| --- | --- |
| `400` | Requisição inválida ou payload fora do schema. |
| `401` | Sessão ausente, inválida ou expirada. |
| `403` | Papel ou posse do recurso insuficientes. A negativa é auditada como `ACCESS_DENIED`. |
| `404` | Recurso inexistente, fora do escopo de leitura ou já excluído logicamente. |
| `409` | Conflito de estado (duplicidade, transição inválida, recurso vinculado). |
| `422` | Regra de negócio violada (saldo, estoque, janela de entrega, validação de domínio). |
| `429` | Limite de tentativas de login ou de requisições de mutação excedido. |
| `500` | Erro interno não tratado. |
| `503` | Banco de dados ocupado (`SQLITE_BUSY`); a operação pode ser repetida. |

### Papéis

`student`, `teacher`, `staff` e `coordinator`. A autorização é aplicada no servidor por middleware de papel e por guardas de posse do recurso. A interface não é fonte de autorização.

### Sessão e limites

- O login cria o cookie `sid` com `httpOnly`, `SameSite=Lax`, validade de 8 horas e `secure` quando `NODE_ENV=production`.
- `GET /api/auth/me` renova a janela da sessão.
- O login bloqueia temporariamente após 5 falhas por combinação de IP e e-mail em 5 minutos.
- Mutações autenticadas (`POST`, `PATCH`, `DELETE`) têm limite de 120 requisições por minuto por usuário e 600 por minuto por IP.

## Saúde

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/health` | público | Verificação de disponibilidade → `{ data: { ok: true, service: "conecta-etec-server" } }`. |

## Autenticação (RF01, RN01)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | público | `{ email, password }` → `{ data: SafeUser }` e cria o cookie de sessão. Apenas usuários `active` autenticam. Credenciais inválidas e conta inativa respondem `401` com a mesma mensagem. |
| POST | `/api/auth/logout` | autenticado | Encerra a sessão e limpa o cookie → `{ data: { ok: true } }`. |
| GET | `/api/auth/me` | autenticado | Devolve o usuário da sessão → `{ data: SafeUser }` e renova a validade da sessão. |

## Usuários (RF02, RF14)

O cadastro é restrito à coordenação; não existe cadastro público. `SafeUser` contém `id`, `name`, `email`, `role`, `active`, `avatar`, `classIds` e `createdAt`.

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/users?role=&search=` | coordenação | Lista usuários com filtros opcionais por papel e por trecho de nome ou e-mail. |
| POST | `/api/users` | coordenação | Cria conta com `{ name, email, password, role, classId? }` → `201` com `SafeUser`. Para aluno, a turma informada deve existir e estar ativa. |
| PATCH | `/api/users/:id` | coordenação | Atualiza `{ name?, role?, active?, password?, classIds? }` → `200` com `SafeUser`. A senha é armazenada com hash e nunca retornada. Alterar a senha revoga as sessões do usuário, preservando a sessão atual do coordenador que fez a alteração. `classIds` mantém os vínculos de turma consistentes. |
| GET | `/api/users/:id/points` | coordenação ou o próprio usuário | Consulta a carteira → `{ data: { balance, levelLabel, nextLevel, missingForNextLevel, currentStreakDays, nextStreakMilestone, daysToNextMilestone, transactions } }`. |

## Turmas (RF13)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/classes` | autenticado | Lista turmas. Aluno vê as próprias; professor vê aquelas em que consta em `teacherIds`; funcionário e coordenação veem todas. |
| GET | `/api/classes/:id/detail?format=csv` | coordenação, funcionário e professor da turma | Detalhe da turma → `{ data: ClassDetail }` com `class`, `students` (`id`, `name`, `email`, `balance`, `level`, `streak`, `approved`), `subjects` (`name`, `avg`) e `stats` (`students`, `avgBalance`, `total`). Com `format=csv`, devolve CSV com as colunas Aluno, E-mail, Nível, Saldo, Sequência e Aprovadas. Aluno recebe `403`; professor de outra turma recebe `403`. |
| POST | `/api/classes` | coordenação | Cria turma com `{ name, course, year, shift, active?, studentIds?, teacherIds? }` → `201` com `Class`. `shift` aceita `morning`, `afternoon` e `evening`. |
| PATCH | `/api/classes/:id` | coordenação | Atualiza os mesmos campos de criação (parcial) → `200` com `Class`. Os vínculos em `users.classIds` são reconciliados. |
| DELETE | `/api/classes/:id` | coordenação | Remove a turma → `{ data: { ok: true } }`. Retorna `409` com `CLASS_HAS_MEMBERS` ou `CLASS_HAS_ACTIVITIES` quando há vínculos. |

## Disciplinas (RF13)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/subjects` | autenticado | Lista disciplinas em ordem alfabética. |
| POST | `/api/subjects` | coordenação | Cria disciplina com `{ name, icon?, teacherIds?, classIds? }` → `201` com `Subject`. |
| PATCH | `/api/subjects/:id` | coordenação | Atualiza parcialmente os campos da disciplina → `200` com `Subject`. |
| DELETE | `/api/subjects/:id` | coordenação | Remove a disciplina → `{ data: { ok: true } }`. Retorna `409` com `SUBJECT_HAS_ACTIVITIES` quando há atividades vinculadas. |

## Atividades (RF04, RN02)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/activities?status=&type=&classId=&calendar=&deleted=` | autenticado | Lista atividades conforme o papel. Aluno vê apenas atividades `active` das próprias turmas e ignora `deleted`. Professor e funcionário veem apenas as atividades de que são responsáveis (`teacherId`). Coordenação vê todas. `calendar=true` devolve `{ calendar: [{ month, activities }] }`. `deleted=true` troca o filtro para a lixeira; cada item inclui `deletedByName` (nome do autor da exclusão ou `null`). |
| GET | `/api/activities/:id` | autenticado, dentro do escopo de leitura | Detalhe da atividade → `{ data: Activity & { submissionsCount, approvedCount } }`. Atividade excluída logicamente responde `404`. |
| POST | `/api/activities` | professor ou funcionário | Cria atividade com `{ title, description?, subjectId, classId, points, deadline, lateWindowDays?, type, status? }` → `201` com `Activity`. `deadline` deve ser `DD/MM/AAAA` válida, hoje ou futura. `lateWindowDays` aceita 0 a 90 (padrão 7). `type` aceita `academic`, `school_action`, `event`, `library`, `support` e `other`; funcionário só pode criar os tipos operacionais (`school_action`, `event`, `library`, `support`). `status` inicia como `draft` por padrão. |
| PATCH | `/api/activities/:id` | responsável pela atividade ou coordenação | Atualiza os campos editáveis de criação (parcial) → `200` com `Activity`. Para alterar status, use a rota dedicada. |
| PATCH | `/api/activities/:id/status` | responsável pela atividade ou coordenação | `{ status }` → `200` com `Activity`. Transições permitidas: `draft → active` e `active → closed`. Publicar notifica os alunos da turma. Retorna `409` com `STATUS_UNCHANGED` ou `422` com `INVALID_STATUS_TRANSITION`. |
| DELETE | `/api/activities/:id` | responsável pela atividade ou coordenação | Exclusão lógica → `200` com `Activity` (com `deletedAt` e `deletedBy`). A linha permanece no banco para preservar entregas, pontos e auditoria. Retorna `409` com `ACTIVITY_ALREADY_DELETED` em exclusão repetida. |

Atividade excluída não aparece em listagens, detalhe, painéis, relatórios nem validações. Ela é acessível apenas pela lixeira (`deleted=true`).

## Entregas e evidências (RF05, RF06, RN03)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/submissions?activityId=&studentId=&status=&subjectId=&studentName=&from=&to=` | autenticado | Lista entregas dentro do escopo do papel. Aluno vê apenas as próprias; professor e funcionário veem as entregas das próprias atividades; coordenação vê todas. Os filtros são combináveis. `from` e `to` usam `DD/MM/AAAA` e incluem as duas pontas; período invertido responde `400` com `PERIOD_REVERSED`. |
| POST | `/api/activities/:activityId/submissions` | aluno da turma | Envia ou reenvia entrega em `multipart/form-data` com `comment`, `evidence` e até 3 arquivos no campo `attachments` → `201` com `Submission`. A atividade deve estar `active` e dentro da janela de atraso. Reenvio é permitido somente quando o status é `revision_required`; caso contrário, `409` com `ALREADY_SUBMITTED`. Entrega após o prazo, mas dentro da janela, é marcada como atrasada. |
| GET | `/api/submissions/:id/attachments/:attId` | autor, responsável pela atividade ou coordenação | Baixa o anexo autorizado como arquivo binário. |
| POST | `/api/submissions/:id/validate` | responsável pela atividade ou coordenação | `{ action: "approve" \| "reject" \| "revision", feedback? }` → `200` com `Submission`. `feedback` é obrigatório para `reject` e `revision`. A aprovação credita pontos e notifica o aluno; reprovação e solicitação de correção também notificam. Retorna `409` com `SUBMISSION_ALREADY_VALIDATED` quando a entrega já foi validada. |
| GET | `/uploads/:storedName` | autorizado por vínculo | Entrega o arquivo físico de anexo de entrega ou de reforço. O acesso é decidido pelo vínculo com a entrega, pela autoria do reforço ou pelo papel. |

Uploads aceitam imagens JPEG, PNG, WebP e GIF e arquivos PDF, com até 3 arquivos de 5 MB cada. O conteúdo real do arquivo é validado por assinatura binária, além da extensão e do MIME type.

## Pontos e recompensas (RF07, RF08, RN04, RN05)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/transactions?studentId=&type=` | autenticado | Extrato de pontos. Coordenação vê todas as transações e pode filtrar por aluno e tipo; os demais papéis veem apenas as próprias transações. |
| POST | `/api/points/bonus` | coordenação | `{ studentId, amount, description }` → `201` com `PointsTransaction`. O valor deve ser inteiro positivo, limitado a 500 pontos por transação e 500 pontos por dia por aluno. Gera notificação e auditoria `POINTS_ADJUSTED`. |
| POST | `/api/points/adjust` | coordenação | `{ studentId, amount, description }` → `201` com `PointsTransaction`. O valor deve ser inteiro diferente de zero; o saldo nunca pode ficar negativo (`422` com `NEGATIVE_BALANCE`). |
| GET | `/api/rewards` | autenticado | Lista recompensas. Para aluno, devolve `{ data: { rewards, balance } }`; para os demais papéis, devolve a lista de recompensas. |
| POST | `/api/rewards` | coordenação | Cria recompensa com `{ label, icon?, points, stock }` → `201` com `Reward`. |
| PATCH | `/api/rewards/:id` | coordenação | Atualiza parcialmente `{ label?, icon?, points?, stock? }` → `200` com `Reward`. |
| DELETE | `/api/rewards/:id` | coordenação | Remove a recompensa → `{ data: { ok: true } }`. Retorna `409` com `REWARD_HAS_REDEMPTIONS` quando há resgates vinculados. |
| POST | `/api/rewards/:id/redeem` | aluno | Resgata a recompensa → `201` com `{ redemption, transaction, balance }`. Valida saldo e estoque de forma atômica. Retorna `422` com `INSUFFICIENT_BALANCE` ou `REWARD_OUT_OF_STOCK`; a corrida de estoque pode responder `409` com `REWARD_OUT_OF_STOCK`. |

## Resgates

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/redemptions` | autenticado | Lista resgates. Coordenação vê todos; os demais papéis veem apenas os próprios. |
| PATCH | `/api/redemptions/:id/cancel` | coordenação | Cancela um resgate pendente → `200` com `Redemption`. Devolve o estoque, estorna o débito como transação positiva, notifica o aluno e audita `REDEMPTION_CANCELLED`. Resgate processado ou já cancelado responde `409` com `REDEMPTION_ALREADY_PROCESSED`. |
| PATCH | `/api/redemptions/:id` | coordenação | `{ status: "processed" }` → `200` com `Redemption`. Notifica o aluno e audita `REDEMPTION_PROCESSED`. Resgate cancelado ou já processado responde `409` com `REDEMPTION_ALREADY_PROCESSED`. |

## Notificações (RF10)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/notifications` | autenticado | Lista as notificações do usuário. A listagem é somente leitura: não apaga nem marca notificações. |
| PATCH | `/api/notifications/read` | autenticado | Confirma a leitura de todas as notificações → `{ data: { ok: true } }`. Notificações transitórias são removidas; persistentes passam a lidas. Audita `NOTIFICATIONS_ACKNOWLEDGED` quando há alteração. |
| PATCH | `/api/notifications/:id/read` | autenticado | Confirma a leitura de uma notificação → `{ data: { ok: true } }`. Retorna `404` quando a notificação não existe ou pertence a outro usuário. Audita `NOTIFICATION_ACKNOWLEDGED` quando há alteração. |

A classificação entre transitória e persistente é derivada do `type` da notificação em `TRANSIENT_BY_TYPE` (`app/shared/types.ts`).

| Tipo | Comportamento ao confirmar leitura |
| --- | --- |
| `activity_approved`, `activity_rejected`, `reward`, `system` | Transitória: é removida da lista. |
| `new_activity`, `activity_revision`, `coord_notice` | Persistente: passa a lida e permanece na lista. |

`relatedActivityId` (nullable) referencia a atividade relacionada. Ao reenviar uma entrega, as notificações `activity_revision` do aluno para aquela atividade são removidas e a resolução é auditada como `REVISION_RESOLVED`.

## Avisos da coordenação

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/notices?page=&pageSize=` | coordenação | Quadro de avisos, do mais recente para o mais antigo → `{ data: { items, total, page, pageSize } }`. Cada item inclui `createdByName` (`null` quando o autor não existe mais ou está inativo) e `classIds` como array. |
| POST | `/api/notices` | coordenação | `{ title, message, audienceType: "all" \| "classes", classIds? }` → `201` com `{ data: { notice, notifiedUserIds } }`. |

Regras de público, decididas no servidor:

- `all`: estudantes e professores ativos. `classIds` é normalizado para `[]`.
- `classes`: estudantes e professores ativos das turmas indicadas, considerando `Class.studentIds`, `Class.teacherIds` e `User.classIds`. Os IDs são deduplicados.
- Funcionários e coordenação não recebem o próprio aviso.
- O aviso, as notificações dos destinatários e a auditoria `NOTICE_CREATED` são gravados na mesma transação.

Erros: `400` para payload inválido ou público `classes` sem turma; `422` com `CLASSES_NOT_FOUND` quando alguma turma não existe ou está inativa, recusando o lote inteiro; `403` para papéis diferentes de coordenação.

## Reforço escolar (RF09)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/study-contents?subject=` | autenticado | Lista reforços dentro do escopo de leitura. Aluno vê os reforços das próprias turmas e recebe `completedAt`; professor vê os próprios; funcionário e coordenação veem todos. |
| GET | `/api/study-contents/:id` | autenticado, dentro do escopo de leitura | Detalhe do reforço → `{ data: StudyContent }`. Aluno recebe também `completedAt`. Fora do escopo, responde `403` com auditoria `ACCESS_DENIED`. |
| POST | `/api/study-contents` | professor ou coordenação | Cria reforço com `{ subject, topic, icon?, color?, exercises?, description?, content?, classIds, points?, questions? }` → `201` com `StudyContent`. `classIds` exige de 1 a 20 turmas; `points` aceita de 1 a 100 (padrão 5); `questions` aceita até 20 itens. Professor só publica nas próprias turmas. |
| PATCH | `/api/study-contents/:id` | autor do reforço ou coordenação | Atualiza parcialmente os campos do reforço → `200` com `StudyContent`. |
| DELETE | `/api/study-contents/:id` | autor do reforço ou coordenação | Remove o reforço → `{ data: { ok: true } }`. Retorna `409` com `CONTENT_HAS_COMPLETIONS` quando já houve conclusão com crédito de pontos. |
| POST | `/api/study-contents/:id/complete` | aluno de turma destinatária | Conclui o reforço → `201` com `{ completion, transaction, balance }`. O crédito ocorre uma única vez por aluno e reforço. Retorna `403` com `NOT_IN_CLASS` fora das turmas destinatárias; `409` com `ALREADY_COMPLETED` em conclusão repetida; `422` com `INVALID_CONTENT_POINTS` quando a pontuação é inválida. |
| POST | `/api/study-contents/:id/attachments` | autor do reforço, funcionário ou coordenação | Anexa material de apoio em `multipart/form-data`, no campo `attachments` → `201` com os metadados dos anexos. Aplica os mesmos limites de quantidade, tamanho e tipo dos demais uploads. |

## Painel e relatórios (RF11, RF14)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/dashboard/overview` | autenticado | Indicadores do painel conforme o papel. Aluno: saldo, atividades pendentes, entregas e retornos. Professor e funcionário: atividades próprias, alunos, validações pendentes e aprovações. Coordenação: totais de usuários, alunos, turmas, atividades, validações, pontos emitidos e classes. |
| GET | `/api/reports/completion?format=csv` | professor ou coordenação | Taxa de conclusão por turma. Professor vê apenas as próprias turmas; coordenação vê todas. Com `format=csv`, exporta as colunas Turma, Curso, Alunos, Atividades, Possíveis, Concluídas e %. |
| GET | `/api/reports/points?format=csv` | professor ou coordenação | Pontos por aluno. Professor vê alunos das próprias turmas; coordenação vê todos. Com `format=csv`, exporta Aluno, Turma, Saldo e Nível. |
| GET | `/api/reports/activities-by-type?format=csv` | coordenação | Distribuição de atividades por tipo. Com `format=csv`, exporta Tipo e Quantidade. |
| GET | `/api/reports/teacher-performance` | professor | Desempenho do professor autenticado, restrito às próprias atividades e turmas. Esta rota não possui exportação CSV. |

Atividades excluídas logicamente não entram nos indicadores nem nos relatórios.

## Auditoria (RF12, RN06)

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/api/audit?role=&action=&date=&user=` | coordenação | Consulta os registros de auditoria com filtros por papel, ação, data e nome do usuário. Com `page` e/ou `pageSize`, devolve `{ data: { items, total, page, pageSize } }` (padrão 50, máximo 200). Sem esses parâmetros, mantém o formato `{ data: AuditLog[] }` com `limit` (padrão 500, máximo 2000). |

Os registros de auditoria são criados exclusivamente pelo servidor. Não existe rota pública de escrita em `/api/audit`.

## Códigos de auditoria

Lista vigente dos valores registrados pelo servidor:

- Autenticação e acesso: `LOGIN`, `LOGOUT`, `ACCESS_DENIED`.
- Usuários: `USER_CREATED`, `USER_UPDATED`.
- Atividades: `ACTIVITY_CREATED`, `ACTIVITY_UPDATED`, `ACTIVITY_PUBLISHED`, `ACTIVITY_CLOSED`, `ACTIVITY_DELETED`.
- Entregas: `SUBMISSION_SENT`, `SUBMISSION_RESUBMITTED`, `SUBMISSION_APPROVED`, `SUBMISSION_REJECTED`, `REVISION_REQUIRED`, `REVISION_RESOLVED`.
- Anexos: `ATTACHMENT_UPLOADED`.
- Pontos e gamificação: `STREAK_BONUS`, `LEVEL_UP`, `POINTS_ADJUSTED`, `REWARD_REDEEMED`, `REDEMPTION_PROCESSED`, `REDEMPTION_CANCELLED`.
- Turmas: `CLASS_CREATED`, `CLASS_UPDATED`, `CLASS_DELETED`.
- Disciplinas: `SUBJECT_CREATED`, `SUBJECT_UPDATED`, `SUBJECT_DELETED`.
- Recompensas: `REWARD_CREATED`, `REWARD_UPDATED`, `REWARD_DELETED`.
- Reforço escolar: `CONTENT_CREATED`, `CONTENT_UPDATED`, `CONTENT_DELETED`, `STUDY_CONTENT_COMPLETED`.
- Notificações e avisos: `NOTIFICATION_ACKNOWLEDGED`, `NOTIFICATIONS_ACKNOWLEDGED`, `NOTICE_CREATED`.

Novas ações devem ser registradas nesta lista e, quando fizer sentido, centralizadas em `AUDIT_ACTIONS` (`app/server/src/services/audit.ts`).
