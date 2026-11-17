// Conteúdo editorial da landing pública (fonte única).
// Textos copiados literalmente de docs/landing/CONTENT.md §1, §2, §13, §14 e §15.
// Nenhum componente da landing deve conter texto de marketing solto.
import type { Role } from "@shared/types"

export type IconName =
  | "cap"
  | "board"
  | "building"
  | "chart"
  | "flow"
  | "check"
  | "clock"
  | "book"
  | "star"
  | "layers"
  | "server"
  | "database"
  | "github"
  | "arrowRight"
  | "arrowUp"
  | "menu"
  | "close"

export interface NavLink {
  id: string
  label: string
}

export interface ContactChannel {
  id: string
  label: string
  href: string
  icon: IconName
  external: boolean
}

export const GITHUB_URL = "https://github.com/nicolastrovoada/ConectaETEC"

/** `null` até a abertura de Issues ser confirmada no repositório (CONTENT §12). */
export const ISSUES_URL: string | null = null

/** Canais oficiais ainda não publicados; a UI mostra a nota de transparência. */
export const CONTACT_CHANNELS: ContactChannel[] = []

export const BRAND = {
  first: "Conecta",
  second: "ETEC",
  full: "Conecta ETEC",
}

export interface SiteConfig {
  name: string
  slogan: string
  academicContext: string
  githubUrl: string
  issuesUrl: string | null
  contactChannels: ContactChannel[]
  contactFallback: string
}

export const siteConfig: SiteConfig = {
  name: BRAND.full,
  slogan: "Conectando o futuro.",
  academicContext: "Projeto acadêmico desenvolvido na ETEC Cravinhos, Centro Paula Souza, em 2026.",
  githubUrl: GITHUB_URL,
  issuesUrl: ISSUES_URL,
  contactChannels: CONTACT_CHANNELS,
  contactFallback:
    "Outros canais de contato, como e-mail institucional, telefone ou redes sociais, ainda não foram publicados.",
}

export const A11Y = {
  skipToContent: "Pular para o conteúdo",
  mainNav: "Navegação principal",
  brandLink: "Conecta ETEC — Início",
  menuOpen: "Abrir menu de navegação",
  menuClose: "Fechar menu de navegação",
  newTabNote: "(abre em nova aba)",
  footerInfoTitle: "Informações do Conecta ETEC",
  footerNav: "Navegação do rodapé",
  footerProject: "Links do projeto",
  backToTop: "Voltar ao topo",
  backToTopAria: "Voltar ao topo da página",
  previewAria:
    "Representação ilustrativa do painel do aluno, com cartões de atividade, entrega, nível e pontos",
  loginBack: "Voltar para a apresentação",
}

export const HEADER = {
  loginLabel: "Fazer login",
  accessLabel: "Entrar na conta",
  accessShortLabel: "Entrar",
}

export const NAV_LINKS: NavLink[] = [
  { id: "inicio", label: "Início" },
  { id: "sobre", label: "Sobre o projeto" },
  { id: "funcionalidades", label: "Funcionalidades" },
  { id: "para-quem", label: "Para quem" },
  { id: "desenvolvimento", label: "Desenvolvimento" },
  { id: "contato", label: "Contato" },
]

export const HERO = {
  overline: "Projeto acadêmico — ETEC Cravinhos",
  slogan: "Conectando o futuro.",
  title: "Uma escola mais conectada começa com a participação de todos.",
  lead: "O Conecta ETEC é uma plataforma que aproxima estudantes, professores, funcionários e coordenação, organizando atividades, estudos e reconhecimento em um único ambiente digital.",
  primaryCta: "Conhecer a plataforma",
  primaryCtaHref: "#sobre",
  accessCta: "Entrar na conta",
  note: "Projeto acadêmico em desenvolvimento. O acesso é feito com a conta criada pela coordenação da escola. Não há cadastro público.",
  previewCaption: "Demonstração visual. Interface ilustrativa, sem dados reais.",
}

/** Interior ilustrativo do ProductPreview (DESIGN §6.2). Nunca são dados reais. */
export const HERO_PREVIEW = {
  panelTitle: "Início",
  panelChip: "Aluno",
  exampleBadge: "Exemplo",
  greeting: "Olá, Aluno",
  balanceLabel: "Saldo de pontos",
  balanceValue: 120,
  level: "Nível Prata",
  progressLabel: "Faltam 180 pts para Ouro",
  activityTitle: "Atividade de exemplo — Técnico em Administração",
  activityPoints: "20 pts",
  activityStatus: "Aprovada",
  panelFooter: "Continua em: Atividades · Reforço · Recompensas",
  validationTitle: "Validar entrega",
  validationChip: "Professor",
  validationLine: "Aluno · entrega com evidência",
  validationStatus: "Enviada",
  validationFeedback: "Entrega aprovada. Bom trabalho na organização das fontes.",
  validationActions: ["Aprovar", "Solicitar correção"] as string[],
  validationFooter: "Aprovação registra pontos e notifica o estudante.",
  validationCompact: "Validação: aprovar · reprovar · solicitar correção",
}

export const FOOTER = {
  slogan: "Conectando o futuro.",
  description:
    "Plataforma de engajamento escolar que reúne atividades, entregas, validação, reforço, pontos e recompensas em um único ambiente.",
  navTitle: "Navegar",
  projectTitle: "Projeto",
  academicTitle: "Acadêmico",
  academicItems: ["ETEC Cravinhos", "Centro Paula Souza", "Curso Técnico em Administração", "2026"],
  academicContext: siteConfig.academicContext,
  notice:
    "Este site apresenta um protótipo em desenvolvimento. Não representa homologação ou implantação oficial pela instituição.",
  copyright: "© 2026 Conecta ETEC · Projeto acadêmico",
  prototypeNote: "Protótipo funcional, sem implantação oficial.",
  githubLabel: "GitHub",
  issuesLabel: "Issues",
}

export interface ProblemItem {
  icon: IconName
  title: string
  text: string
}

export interface FlowStep {
  title: string
  text: string
}

export interface FeatureGroup {
  icon: IconName
  title: string
  description: string
  items: string[]
  wide?: boolean
}

export interface ProfileContent {
  role: Role
  functionLabel: string
  description: string
  bullets: string[]
}

export interface WorkflowStep {
  title: string
  text: string
}

export interface DevStage {
  title: string
  text: string
}

export interface TechLayer {
  title: string
  subtitle: string
  items: string[]
}

export interface ContactSectionContent {
  overline: string
  title: string
  lead: string
  fallback: string
  githubLabel: string
  issuesLabel: string
}

export const PROBLEMS: ProblemItem[] = [
  {
    icon: "flow",
    title: "Informações dispersas",
    text: "Atividades, prazos e comunicados podem ficar distribuídos em diferentes canais, o que dificulta saber o que está pendente e o que já foi resolvido.",
  },
  {
    icon: "clock",
    title: "Falta de constância",
    text: "Parte dos estudantes encontra dificuldades para manter uma rotina organizada de estudos e participação ao longo do período letivo.",
  },
  {
    icon: "board",
    title: "Acompanhamento manual",
    text: "Professores e funcionários precisam acompanhar entregas, conferir atividades e registrar resultados, muitas vezes com controles separados.",
  },
  {
    icon: "chart",
    title: "Pouca visibilidade do progresso",
    text: "Nem sempre o estudante consegue visualizar de maneira integrada sua participação, seus pontos e sua evolução.",
  },
]

export const SOLUTION = {
  title: "Uma plataforma. Diferentes possibilidades. Um objetivo em comum.",
  lead: "Atividades, entregas, validações, reforço, pontos, recompensas e acompanhamento deixam de viver em canais separados e passam a fazer parte do mesmo ciclo.",
  intro1:
    "O Conecta ETEC é a resposta desenvolvida para esse cenário. A plataforma reúne, em um único ambiente digital, atividades escolares, ações da escola, entregas, validações, reforço de conteúdo, pontuação, recompensas, notificações e acompanhamento.",
  intro2:
    "A proposta não é voltada apenas ao aluno. Professores e funcionários ganham ferramentas para publicar, validar e acompanhar; a coordenação passa a contar com uma visão do conjunto da escola. A tecnologia apoia a rotina pedagógica e não substitui o trabalho dos profissionais da educação.",
  intro3: "O funcionamento segue um ciclo simples, que conecta quem publica, quem participa e quem acompanha.",
  rolesLine: "Aluno · Professor · Funcionário · Coordenação",
}

export const FLOW_STEPS: FlowStep[] = [
  {
    title: "Atividade",
    text: "O professor ou funcionário publica a atividade com prazo, turma e pontuação.",
  },
  {
    title: "Entrega",
    text: "O estudante realiza a atividade e envia a entrega com evidência.",
  },
  {
    title: "Validação",
    text: "O responsável aprova, reprova ou solicita correção com feedback.",
  },
  {
    title: "Pontuação",
    text: "A aprovação registra os pontos e atualiza o saldo do estudante.",
  },
  {
    title: "Recompensa e acompanhamento",
    text: "O estudante acompanha níveis e recompensas; a equipe acompanha indicadores.",
  },
]

export const FEATURES = {
  title: "Tudo o que a rotina escolar precisa, conectado em um só lugar.",
  lead: "Os grupos abaixo reúnem recursos que já fazem parte do protótipo funcional. Itens previstos para as próximas etapas aparecem apenas na seção \u201CUm projeto em evolução\u201D.",
  note: "Recursos presentes no protótipo funcional. O que ainda está em evolução aparece na seção de estado atual.",
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    icon: "board",
    title: "Organização de atividades",
    description: "Planejamento, publicação e acompanhamento das atividades de cada turma.",
    wide: true,
    items: [
      "Criação e publicação de atividades, com transição de rascunho para ativa e encerramento.",
      "Definição de prazo, pontuação e janela de tolerância para entregas atrasadas.",
      "Organização por turma, disciplina e tipo de atividade, incluindo ações escolares.",
      "Visualização em lista ou calendário, com filtros por status, tipo e turma.",
      "Acompanhamento do andamento, com contagem de entregas e aprovações por atividade.",
      "Exclusão lógica: a atividade sai das listas, mas entregas e pontos já registrados são preservados.",
    ],
  },
  {
    icon: "check",
    title: "Entregas e validações",
    description: "Do envio do estudante ao retorno do responsável, com registro de cada etapa.",
    wide: true,
    items: [
      "Envio de entrega com comentário e evidência descritiva.",
      "Anexos de imagens e PDF, com limite de três arquivos de até 5 MB cada.",
      "Reenvio quando o responsável solicita correção.",
      "Aprovação, reprovação ou solicitação de correção, com feedback ao estudante.",
      "Registro de atraso e aplicação da regra de pontuação proporcional em entregas atrasadas.",
    ],
  },
  {
    icon: "book",
    title: "Reforço escolar",
    description: "Conteúdos de apoio para reforçar o aprendizado ao longo do período.",
    items: [
      "Conteúdos organizados por disciplina e destinados a turmas específicas.",
      "Lição, questões de verificação e materiais de apoio em imagem ou PDF.",
      "Conclusão única por estudante em cada reforço, com crédito de pontos previsto no conteúdo.",
      "Criação e gestão pelo professor para as próprias turmas.",
    ],
  },
  {
    icon: "star",
    title: "Gamificação",
    description: "Pontos, níveis e sequência para tornar a participação visível ao longo do tempo.",
    items: [
      "Carteira de pontos com extrato de créditos e débitos.",
      "Níveis Bronze, Prata, Ouro e Diamante, calculados pelo saldo de pontos.",
      "Sequência de participação, com bônus ao atingir marcos de dias seguidos.",
      "Bônus e ajustes de pontos registrados pela coordenação.",
      "Histórico de pontuação disponível para o estudante.",
    ],
  },
  {
    icon: "chart",
    title: "Recompensas",
    description: "Um catálogo de recompensas ligado ao esforço acumulado na plataforma.",
    items: [
      "Catálogo de recompensas com custo em pontos e controle de estoque.",
      "Consulta de saldo antes do resgate.",
      "Resgate de pontos com validação de saldo e de estoque.",
      "Histórico de resgates para o estudante.",
      "Gerenciamento de recompensas e acompanhamento dos resgates pela coordenação.",
    ],
  },
  {
    icon: "flow",
    title: "Comunicação e acompanhamento",
    description: "Avisos, notificações e indicadores para que cada perfil saiba o que aconteceu e o que fazer.",
    wide: true,
    items: [
      "Notificações sobre novas atividades, resultados de validação, pontos e recompensas.",
      "Avisos da coordenação para estudantes e professores, de toda a escola ou de turmas específicas.",
      "Indicadores de participação nos painéis de aluno, professor, funcionário e coordenação.",
      "Relatórios consolidados com filtros por turma, disciplina e período.",
      "Exportação de relatórios em CSV.",
      "Auditoria das ações sensíveis da plataforma.",
    ],
  },
]

export const PROFILES_SECTION = {
  overline: "Para quem é o Conecta ETEC?",
  title: "Quatro perfis, uma mesma conexão.",
  lead: "Cada perfil tem um painel próprio, com as ferramentas e as permissões correspondentes ao seu papel na escola.",
  closing:
    "Os quatro perfis compartilham o mesmo sistema: a atividade criada por um professor ou funcionário chega ao aluno, a validação gera o retorno e a pontuação, e a coordenação acompanha o conjunto — sem cadastros paralelos e sem controles separados.",
}

export const PROFILES: ProfileContent[] = [
  {
    role: "student",
    functionLabel: "aprende e participa",
    description: "O aluno acompanha suas atividades, organiza sua rotina de estudos e visualiza sua evolução dentro da plataforma.",
    bullets: [
      "Consultar atividades, prazos e calendário da turma.",
      "Enviar entregas com comentário, evidência e anexos.",
      "Reenviar a entrega quando houver solicitação de correção.",
      "Acompanhar o feedback e o resultado das validações.",
      "Acessar o reforço escolar das suas turmas.",
      "Acompanhar pontos, níveis e sequência de participação.",
      "Resgatar recompensas e consultar o histórico de resgates.",
      "Receber notificações e editar nome, foto e senha do próprio perfil.",
    ],
  },
  {
    role: "teacher",
    functionLabel: "publica e valida",
    description: "O professor organiza as atividades de suas turmas, acompanha entregas e oferece suporte ao desenvolvimento dos estudantes.",
    bullets: [
      "Criar, publicar e encerrar atividades das próprias turmas.",
      "Definir prazo, tolerância de atraso, pontuação e tipo de atividade.",
      "Consultar atividades em lista ou calendário, com filtros.",
      "Validar entregas, aprovando, reprovando ou solicitando correção.",
      "Enviar feedback e acompanhar o reenvio das correções.",
      "Criar e gerenciar o reforço escolar das próprias turmas.",
      "Acompanhar indicadores das turmas e o desempenho das próprias atividades.",
      "Exportar listas de alunos e relatórios em CSV.",
    ],
  },
  {
    role: "staff",
    functionLabel: "organiza e apoia",
    description: "Os funcionários organizam ações escolares e participam do acompanhamento das atividades relacionadas às suas responsabilidades.",
    bullets: [
      "Criar ações escolares dos tipos operacionais: Ação Escolar, Evento, Biblioteca e Suporte.",
      "Organizar ações de biblioteca, eventos e suporte à rotina escolar.",
      "Publicar e encerrar as ações sob sua responsabilidade.",
      "Validar as entregas relacionadas às próprias ações.",
      "Consultar o histórico de entregas e validações.",
      "Receber notificações e editar o próprio perfil.",
    ],
  },
  {
    role: "coordinator",
    functionLabel: "acompanha e decide",
    description: "A coordenação possui uma visão global da plataforma e gerencia os elementos que sustentam a rotina escolar.",
    bullets: [
      "Cadastrar e gerenciar usuários de todos os perfis.",
      "Gerenciar turmas e disciplinas.",
      "Acompanhar as atividades da escola, inclusive as excluídas logicamente.",
      "Acompanhar e validar entregas de toda a escola.",
      "Gerenciar pontos, bônus e ajustes de saldo.",
      "Gerenciar o catálogo de recompensas e os resgates.",
      "Publicar avisos para toda a escola ou para turmas específicas.",
      "Consultar relatórios com exportação em CSV e os registros de auditoria.",
    ],
  },
]

export const WORKFLOW = {
  title: "Da atividade à conquista.",
  lead: "Seis etapas, sempre na mesma ordem. É a mesma jornada em qualquer perfil.",
  legend: "Da operação ao reconhecimento",
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { title: "Publicação", text: "O professor cria e publica uma atividade para determinada turma." },
  { title: "Participação", text: "O estudante visualiza a atividade, realiza o que foi solicitado e envia sua entrega." },
  { title: "Validação", text: "O professor ou funcionário responsável analisa a entrega e registra o resultado, podendo aprovar, reprovar ou solicitar correção." },
  { title: "Reconhecimento", text: "Quando a entrega é aprovada, o sistema registra a pontuação correspondente e notifica o estudante." },
  { title: "Evolução", text: "O estudante acompanha seus pontos, níveis, histórico e recompensas." },
  { title: "Gestão", text: "A equipe escolar acompanha os indicadores e utiliza os recursos administrativos para monitorar as atividades." },
]

export const GAMIFICATION = {
  title: "Participar também pode ser uma conquista.",
  lead: "A participação aprovada gera pontos. Os pontos mostram evolução e podem ser trocados por recompensas cadastradas pela coordenação.",
  levelsTitle: "Níveis",
  levelsAriaLabel: "Trilha de níveis",
  levelsCaption: "Níveis e faixas de pontos",
  levelCol: "Nível",
  rangeCol: "Faixa de pontos",
  levelNames: ["Bronze", "Prata", "Ouro", "Diamante"] as const,
  levelNamePrefix: "Nível ",
  afterTable:
    "Ao acumular pontos, o estudante avança de nível. A barra de progresso mostra quanto falta para o próximo nível. Ao chegar ao Diamante, a plataforma acompanha uma meta de progresso de 800 pontos.",
  walletTitle: "Exemplo de carteira",
  walletNote: "Valores ilustrativos, calculados com as faixas reais da plataforma.",
  missingPointsForLevel: (missing: number, levelName: string) => `Faltam ${missing} pts para ${levelName}`,
  progressGoalLabel: "Meta de progresso",
  originsTitle: "Como os pontos acontecem",
  origins: [
    "Aprovação de atividade.",
    "Conclusão de reforço escolar.",
    "Bônus de sequência de participação.",
  ],
  streakLabel: "Sequência de participação",
  rewardsTitle: "Recompensas",
  rewardsText:
    "O catálogo, o saldo e o histórico de resgates ficam na área do aluno; o gerenciamento é da coordenação.",
  rewardsBadge: "Catálogo cadastrado pela escola",
  exampleNote: "Os exemplos desta página são ilustrativos e servem apenas para explicar o funcionamento. Não representam dados de estudantes reais.",
}

export const DEVELOPMENT = {
  title: "Uma ideia construída a partir da realidade escolar.",
  lead: "O projeto começou pelo problema, não pelas telas. As etapas abaixo descrevem a trajetória de desenvolvimento.",
  note: "Projeto acadêmico desenvolvido na ETEC Cravinhos (Centro Paula Souza), no contexto do Projeto Integrador II. Não há datas de fase publicadas.",
}

export const DEV_STAGES: DevStage[] = [
  { title: "Identificação do problema", text: "A partir da vivência escolar, o grupo percebeu dificuldades relacionadas à organização, à participação e ao acompanhamento das atividades." },
  { title: "Planejamento da solução", text: "Foram definidos o público-alvo, as necessidades dos usuários, os objetivos, as personas e a proposta de valor." },
  { title: "Estruturação das funcionalidades", text: "Foram planejados os diferentes perfis de acesso e os processos de atividades, entregas, validações, pontuação e recompensas." },
  { title: "Desenvolvimento da interface", text: "Foram elaboradas as telas e os fluxos de navegação, considerando a experiência de alunos, professores, funcionários e coordenação." },
  { title: "Desenvolvimento tecnológico", text: "O projeto evoluiu para uma implementação web com frontend, backend, autenticação, banco de dados e gerenciamento das funcionalidades." },
  { title: "Evolução do protótipo", text: "A plataforma foi ampliada com funcionalidades de acompanhamento, relatórios, notificações, auditoria, gamificação e organização dos diferentes perfis." },
]

export const TECHNOLOGY = {
  title: "Por trás de uma experiência integrada.",
  lead: "A interface, as regras de negócio e o armazenamento ficam em camadas separadas. É isso que permite evoluir a plataforma sem reescrever a experiência.",
  extrasTitle: "Outros recursos",
  closing: "A arquitetura separa a interface da lógica de negócio e do armazenamento de dados.",
}

export const TECH_LAYERS: TechLayer[] = [
  { title: "Interface", subtitle: "Interface do usuário", items: ["React 19", "TypeScript", "Vite", "Tailwind CSS 4"] },
  { title: "API e regras", subtitle: "Servidor e dados", items: ["Node.js", "Express", "Zod", "Sessão", "Permissões por perfil"] },
  { title: "Dados", subtitle: "Persistência", items: ["SQLite", "Uploads", "Auditoria"] },
]

export const TECH_EXTRAS: string[] = [
  "Autenticação por sessão",
  "Controle de permissões",
  "Gerenciamento de arquivos",
  "Relatórios",
  "Testes automatizados",
  "Auditoria",
]

export const PROJECT_STATUS = {
  title: "Um projeto em evolução.",
  lead: "O Conecta ETEC é um protótipo funcional. Esta seção separa o que já existe do que ainda está previsto.",
  badge: "Protótipo funcional em evolução",
  doneTitle: "O que já foi desenvolvido",
  plannedTitle: "O que ainda está em evolução",
  note: "Não há implantação oficial na ETEC nem URL pública de demonstração. Este site apresenta um projeto acadêmico em desenvolvimento.",
}

export const STATUS_DONE: string[] = [
  "Autenticação com e-mail e senha e perfis de acesso separados.",
  "Cadastro e gerenciamento de usuários, turmas e disciplinas pela coordenação.",
  "Criação, publicação, encerramento e exclusão lógica de atividades, com prazo e tolerância de atraso.",
  "Visualização de atividades em lista e em calendário, com filtros nas telas de gestão.",
  "Entregas com comentário, evidência e anexos de imagem ou PDF.",
  "Reenvio de entrega após solicitação de correção.",
  "Validação com aprovação, reprovação ou solicitação de correção, com feedback ao estudante.",
  "Pontuação, níveis, sequência de participação, bônus e ajustes de saldo.",
  "Catálogo de recompensas, resgate de pontos e histórico de resgates.",
  "Reforço escolar com lição, questões de verificação e materiais de apoio.",
  "Notificações dentro da plataforma e avisos da coordenação.",
  "Indicadores por perfil, relatórios com exportação em CSV e auditoria de ações.",
  "Edição do próprio perfil, com alteração de nome, foto e senha.",
  "Modo escuro, ajuste de tamanho de fonte e recursos de acessibilidade nos painéis.",
]

export const STATUS_PLANNED: string[] = [
  "Login único institucional e recuperação de senha.",
  "Cadastro público de contas, hoje inexistente: as contas são criadas pela coordenação.",
  "Publicação em infraestrutura oficial, com HTTPS, backups e monitoramento.",
  "Integração com sistemas acadêmicos institucionais.",
  "Notificações por e-mail ou push.",
  "Ampliação dos testes, incluindo testes ponta a ponta.",
  "Reforço das políticas de segurança e de privacidade.",
  "Interface de manutenção da grade curricular.",
  "Pesquisa formal com estudantes e equipe escolar para medir engajamento e impacto.",
  "Endereço público de demonstração: ainda não existe.",
]

export const CONTACT: ContactSectionContent = {
  overline: "Contato",
  title: "Vamos manter essa conexão?",
  lead: "O código e a documentação pública do projeto ficam no GitHub. É por lá que o desenvolvimento pode ser acompanhado.",
  fallback:
    "Os canais oficiais de contato ainda não foram publicados. Quando existirem, aparecerão nesta seção.",
  githubLabel: "Acompanhar o projeto no GitHub",
  issuesLabel: "Abrir uma issue no repositório",
}
