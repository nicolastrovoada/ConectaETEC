import type { SafeUser, StudyContent } from "../shared/types"

/**
 * Autorização do reforço escolar (3.1) — as perguntas que a rota e o `/uploads`
 * precisam responder, em um lugar só.
 *
 * A regra é a mesma das atividades e das entregas: o papel abre a porta, o DONO do
 * recurso decide o resto. A coordenação administra tudo; o professor responde
 * pelo conteúdo que ele mesmo criou; aluno e funcionário não são autores de
 * reforço.
 *
 * Um reforço é de um professor só, mesmo quando a turma tem dois professores
 * (`Class.teacherIds` com dois ids, como a c2 do seed). Atender a turma não
 * transfere a autoria: quem não criou o material não edita, não apaga e não
 * sobe arquivo no reforço de um colega — é o mesmo isolamento por dono que a 2.5
 * aplicou ao anexo de entrega.
 *
 * A LEITURA (corpo da lição e arquivo dela) tem a sua própria pergunta,
 * `canReadStudyContent`, porque ler não é gerenciar: o aluno da turma
 * destinatária lê sem ser dono, e é ela que escopa o `GET /` e o `GET /:id`.
 */

export function isStudyContentOwner(user: SafeUser, content: StudyContent): boolean {
  return content.teacherId !== null && content.teacherId === user.id
}

/** Cria, edita e apaga reforço: só o autor, exceto a coordenação. */
export function canManageStudyContent(user: SafeUser, content: StudyContent): boolean {
  if (user.role === "coordinator") return true
  return user.role === "teacher" && isStudyContentOwner(user, content)
}

/**
 * Sobe anexo no reforço: os mesmos papéis de `canManageStudyContent`, mais o
 * FUNCIONÁRIO. O funcionário não cria nem edita reforço — ele não é autor — mas
 * prepara o material de apoio para o professor publicar, que é a separação de
 * papéis da escola (2.6): quem produz o apoio escolar não é o professor da
 * matéria.
 */
export function canUploadStudyContentAttachment(user: SafeUser, content: StudyContent): boolean {
  if (user.role === "staff") return true
  return canManageStudyContent(user, content)
}

/**
 * Escopo de LEITURA do reforço (R28) — o mesmo isolamento por dono que a 2.5
 * aplicou ao anexo de entrega, e a MESMA regra do corpo da lição e do arquivo
 * dela. Antes desta função o `GET /` era global e o `GET /:id` (novo) entregava
 * a lição inteira de qualquer reforço: a aluna da c1 não podia BAIXAR o
 * material do reforço da c3 e mesmo assim lia o texto dele.
 *
 * Aluno: só das turmas em que está. Professor: só o que é dele. Funcionário e
 * coordenação: todos (a coordenação administra a lixeira; o funcionário prepara
 * o material de apoio).
 *
 * É a única fonte de verdade das DUAS rotas de leitura (`GET /` e `GET /:id`)
 * e do `/uploads`: um predicado só, para elas não divergirem por construção.
 */
export function canReadStudyContent(user: SafeUser, content: StudyContent): boolean {
  if (user.role === "coordinator" || user.role === "staff") return true
  if (user.role === "teacher") return isStudyContentOwner(user, content)
  return content.classIds.some((classId) => user.classIds.includes(classId))
}

/**
 * O arquivo do reforço se lê pela MESMA regra da lição: quem não pode ler a
 * lição também não baixa o anexo, e o que pode, baixa. Nome separado só para o
 * call site do `/uploads` dizer o que está sendo decidido.
 */
export function canReadStudyContentAttachment(user: SafeUser, content: StudyContent): boolean {
  return canReadStudyContent(user, content)
}
