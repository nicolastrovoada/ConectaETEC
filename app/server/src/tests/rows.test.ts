import { describe, it, expect } from "vitest"
import {
  mapActivity,
  mapNotification,
  mapStudyContent,
  mapSubmission,
  type ActivityRow,
  type NotificationRow,
  type StudyContentRow,
  type SubmissionRow,
} from "../db/rows"

/**
 * As colunas da V3 (migration 004) atravessam o mapeamento linha → entidade.
 *
 * É teste de unidade de propósito: as rotas que consomem esses mappers são
 * reescritas nas Fases 2 e 3, mas o mapeamento é o contrato único dos dois lados
 * (o que o SQLite devolve × o que o client recebe), então é ele que precisa ficar
 * preso — inclusive o JSON-em-TEXT virando array/bool de verdade.
 */

const activityRow: ActivityRow = {
  id: "a1",
  title: "Revisão de Língua Portuguesa",
  description: "",
  subjectId: "s1",
  teacherId: "u6",
  classId: "c1",
  points: 15,
  deadline: "30/09/2026",
  lateWindowDays: 7,
  type: "academic",
  status: "active",
  createdAt: "20/09/2026 10:00:00",
  deletedAt: "22/09/2026 09:30:00",
  deletedBy: "u6",
}

const submissionRow: SubmissionRow = {
  id: "sub1",
  activityId: "a1",
  studentId: "u1",
  submittedAt: "01/10/2026 08:00:00",
  status: "under_review",
  delayed: 1,
  evidence: "Lista corrigida",
  comment: "Refiz as questões 3 e 7.",
  validatedBy: null,
  validatedAt: null,
  feedback: "",
}

const notificationRow: NotificationRow = {
  id: "n1",
  userId: "u1",
  title: "Atividade aprovada!",
  message: "Você ganhou 15 pts.",
  type: "activity_approved",
  read: 0,
  transient: 1,
  relatedActivityId: "a1",
  createdAt: "01/10/2026 09:00:00",
}

const studyContentRow: StudyContentRow = {
  id: "sc1",
  subject: "Matemática",
  topic: "Saldo de somar",
  icon: "📖",
  color: "blue",
  exercises: 12,
  description: "Revisão de soma e subtração.",
  content: "Exercício 1: 3 + 4 = ?",
  teacherId: "u6",
  classIds: '["c1","c2"]',
  points: 5,
  questions: '["Quanto é 3 + 4?"]',
}

describe("Mapeamento linha → entidade: colunas da V3 (migration 004)", () => {
  it("atividade carrega janela de atraso e soft delete", () => {
    const activity = mapActivity(activityRow)
    expect(activity.lateWindowDays).toBe(7)
    expect(activity.deletedAt).toBe("22/09/2026 09:30:00")
    expect(activity.deletedBy).toBe("u6")
  })

  it("atividade não excluída vem com deletedAt/deletedBy nulos", () => {
    const activity = mapActivity({ ...activityRow, deletedAt: null, deletedBy: null })
    expect(activity.deletedAt).toBeNull()
    expect(activity.deletedBy).toBeNull()
  })

  it("entrega marcada como atrasada sai como booleano", () => {
    expect(mapSubmission(submissionRow, []).delayed).toBe(true)
    expect(mapSubmission({ ...submissionRow, delayed: 0 }, []).delayed).toBe(false)
  })

  it("notificação transitória sai como booleano e a persistente como false", () => {
    expect(mapNotification(notificationRow).transient).toBe(true)
    expect(mapNotification({ ...notificationRow, transient: 0 }).transient).toBe(false)
  })

  it("notificação carrega a atividade que resolve e usa null quando não há (migration 007)", () => {
    expect(mapNotification(notificationRow).relatedActivityId).toBe("a1")
    // Nível, bônus, sequência e resgate não têm atividade: a coluna chega
    // `undefined` em leitura e `null` gravada — o mapa não pode devolver
    // `undefined`, que quebraria o `Notification` do contrato.
    expect(mapNotification({ ...notificationRow, relatedActivityId: null }).relatedActivityId).toBeNull()
    expect(
      mapNotification({ ...notificationRow, relatedActivityId: undefined as unknown as string })
        .relatedActivityId,
    ).toBeNull()
  })

  it("reforço converte classIds/questions de JSON-em-TEXT para arrays", () => {
    const content = mapStudyContent(studyContentRow, [])
    expect(content.classIds).toEqual(["c1", "c2"])
    expect(content.questions).toEqual(["Quanto é 3 + 4?"])
    expect(content.points).toBe(5)
    expect(content.teacherId).toBe("u6")
    expect(content.attachments).toEqual([])
  })

  it("anexos do reforço entram pelo segundo argumento do mapper", () => {
    const anexo = {
      id: "att-1",
      filename: "figura.png",
      storedName: "a1b2.png",
      mimeType: "image/png",
      size: 1024,
      uploadedAt: "24/09/2026 10:00",
    }
    const content = mapStudyContent(studyContentRow, [anexo])
    expect(content.attachments).toEqual([anexo])
  })

  it("reforço com o default da coluna ('[]') vira array vazio, não string", () => {
    const content = mapStudyContent(
      {
        ...studyContentRow,
        classIds: "[]",
        questions: "[]",
        teacherId: null,
      },
      [],
    )
    expect(content.classIds).toEqual([])
    expect(content.questions).toEqual([])
    expect(content.teacherId).toBeNull()
  })
})
