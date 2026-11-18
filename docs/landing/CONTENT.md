# Conecta ETEC — Dossiê de conteúdo da landing page

**Documento:** conteúdo editorial pronto para implementação (pt-BR)
**Projeto:** Conecta ETEC — plataforma de engajamento escolar
**Contexto:** projeto acadêmico — ETEC Cravinhos, Centro Paula Souza, 2026
**Escopo:** textos, rótulos, microcopy, metadados e requisitos textuais da página pública de apresentação
**Última verificação dos fatos no código:** 15/11/2026

---

## Como usar este documento

- Os blocos marcados como **Texto final (publicar)** estão prontos para ir à interface, sem reescrita.
- Os blocos marcados como **Notas de implementação (não publicar)** são orientações técnicas e editoriais. Não devem aparecer na página.
- A fonte de verdade sobre o que existe é o código do repositório. A documentação em `docs/` e no `README.md` foi usada para contexto, mas divergências foram resolvidas a favor do código e estão registradas na seção [17. Divergências resolvidas](#17-divergências-resolvidas).
- Nenhum número de usuários, métrica, depoimento, parceria, prêmio, e-mail ou telefone foi inventado. Onde falta informação, o texto assume explicitamente a ausência.
- Não há textos com emojis. Ícones devem ser elementos gráficos com `aria-hidden="true"` ou texto alternativo, nunca caracteres de emoji no conteúdo editorial.

## Regras editoriais vinculantes

1. **Fidelidade ao protótipo.** Só é apresentado como existente aquilo que o código implementa. Recursos futuros aparecem apenas em "O que ainda está em evolução".
2. **Sem promessas comerciais.** O Conecta ETEC não é apresentado como produto consolidado, serviço pago ou sistema oficialmente implantado.
3. **Sem dados inventados.** Não há números de alunos, percentuais de melhoria, resultados pedagógicos, avaliações, depoimentos, parceiros ou canais de contato fictícios.
4. **Transparência sobre o estágio.** A página informa que se trata de um protótipo funcional em evolução e que não há cadastro público, login institucional, integração acadêmica oficial nem endereço público de demonstração.
5. **Linguagem acessível.** Frases curtas, voz ativa, termos técnicos explicados na primeira ocorrência. O visitante não precisa saber programar para entender a página.
6. **Origem sem estatística.** A história do projeto é apresentada como vivência escolar e observação do cotidiano, nunca como pesquisa estatística ou entrevista formal.
7. **Acesso coerente.** "Entrar na conta" abre o fluxo de autenticação já existente. Não há cadastro público, segunda tela de login nem segundo CTA de acesso.

## Mapa de seções e âncoras

| # | Seção | `id` da seção | Rótulo no menu | Título público |
| --- | --- | --- | --- | --- |
| 1 | Header | — | — | — |
| 2 | Hero | `inicio` | Início | Uma escola mais conectada começa com a participação de todos. |
| 3 | Problema | `sobre` | Sobre o projeto | Tudo começou com uma necessidade real. |
| 4 | Solução | `solucao` | — (dentro de Sobre) | Uma plataforma. Diferentes possibilidades. Um objetivo em comum. |
| 5 | Funcionalidades | `funcionalidades` | Funcionalidades | Tudo o que a rotina escolar precisa, conectado em um só lugar. |
| 6 | Para quem | `para-quem` | Para quem | Quatro perfis, uma mesma conexão. |
| 7 | Como funciona na prática | `como-funciona` | — | Da atividade à conquista. |
| 8 | Gamificação | `gamificacao` | — | Participar também pode ser uma conquista. |
| 9 | Desenvolvimento | `desenvolvimento` | Desenvolvimento | Uma ideia construída a partir da realidade escolar. |
| 10 | Tecnologia | `tecnologia` | — (dentro de Desenvolvimento) | Por trás de uma experiência integrada. |
| 11 | Estado atual | `estado-atual` | — (dentro de Desenvolvimento) | Um projeto em evolução. |
| 12 | Contato | `contato` | Contato | Vamos manter essa conexão? |
| 13 | Rodapé | — | — | — |

**Notas de implementação (não publicar):**

- O menu tem seis itens, conforme a especificação: Início, Sobre o projeto, Funcionalidades, Para quem, Desenvolvimento e Contato. As demais seções existem na página, mas não entram no menu.
- "Sobre o projeto" ancora em `#sobre`, no início da seção de problema; a seção de solução vem em seguida, no mesmo bloco narrativo.
- "Desenvolvimento" ancora em `#desenvolvimento`; tecnologia e estado atual vêm logo depois, sem item próprio no menu.
- `scroll-margin-top` deve compensar o cabeçalho fixo (sticky).
- A página é pública e aparece para visitantes sem sessão. O fluxo atual do cliente renderiza a tela de login quando não há sessão (`app/client/src/App.tsx`), portanto o botão de acesso deve abrir essa mesma tela, sem criar rota, tela ou cadastro novos.

---

## 1. Header — navegação superior

### Texto final (publicar)

**Marca:** Conecta ETEC

**Links de navegação:**

- Início
- Sobre o projeto
- Funcionalidades
- Para quem
- Desenvolvimento
- Contato

**Botão:**

- Único: **Entrar na conta** (rótulo compacto **Entrar** no celular, com `aria-label="Entrar na conta"`)

**Rótulos acessíveis do menu móvel:**

- Botão fechar: **Fechar menu de navegação**
- Botão abrir: **Abrir menu de navegação**
- Navegação: **Navegação principal**
- Link da marca: **Conecta ETEC — Início**

### Notas de implementação (não publicar)

- O botão de acesso leva ao fluxo de autenticação existente. Não criar cadastro público, segunda página de autenticação, novo estado de sessão nem segundo CTA de acesso.
- No celular, o botão deve permanecer visível no cabeçalho e repetido no menu compacto; não esconder o acesso atrás de rolagem.
- Usar `aria-expanded` e `aria-controls` no botão do menu móvel, com foco gerenciado ao abrir e fechar (mesmo padrão já usado em `app/client/src/components/Layout.tsx`).
- O cabeçalho pode ser fixo (sticky), com fundo sólido ou com transparência apenas quando o contraste do texto estiver garantido.
- A marca é tipográfica ("Conecta" + "ETEC" com diferenciação de cor), como na tela de login. Não existe arquivo de logotipo no repositório: não referenciar imagem inexistente.
- No celular, o rótulo visível é "Entrar" para caber em 320px; o nome acessível permanece "Entrar na conta" via `aria-label`.

---

## 2. Hero — apresentação principal

### Texto final (publicar)

**Sobretítulo:** Projeto acadêmico — ETEC Cravinhos

**Marca:** Conecta ETEC

**Slogan:** Conectando o futuro.

**Título (h1):** Uma escola mais conectada começa com a participação de todos.

**Descrição:** O Conecta ETEC é uma plataforma que aproxima estudantes, professores, funcionários e coordenação, organizando atividades, estudos e reconhecimento em um único ambiente digital.

**Chamada principal (âncora):** Conhecer a plataforma

**Chamada de acesso:** Entrar na conta

**Microcopy abaixo das chamadas:** Projeto acadêmico em desenvolvimento. O acesso é feito com a conta criada pela coordenação da escola. Não há cadastro público.

**Rótulo da representação visual:** Demonstração visual

**Legenda da representação:** Demonstração visual. Interface ilustrativa, sem dados reais.

**Texto do mockup (painel do aluno, ilustrativo):**

- Cabeçalho do painel: Painel do aluno
- Cartão de atividade: Atividade de exemplo — Técnico em Administração
- Situação da entrega: Entrega aprovada
- Feedback: Entrega aprovada. Bom trabalho na organização das fontes.
- Indicador: Nível atual
- Indicador: Saldo de pontos
- Indicador: Sequência de participação
- Indicador: Próxima meta
- Ações ilustrativas: Ver atividades | Resgatar recompensa

### Notas de implementação (não publicar)

- O título é o único `h1` da página.
- Não usar números no mockup. Se a implementação optar por valores numéricos para dar realismo, eles devem ser explicitamente rotulados como ilustrativos na legenda e nunca apresentados como dados da escola.
- Preferir capturas reais das telas existentes quando houver capturas adequadas; caso contrário, montar a representação com os mesmos componentes e rótulos da aplicação. Em ambos os casos, o selo "Demonstração visual" é obrigatório.
- A representação deve ser marcada como imagem (por exemplo, `role="img"` com `aria-label`) ou como região com título acessível; os elementos internos decorativos recebem `aria-hidden="true"`.
- A chamada "Conhecer a plataforma" leva a `#sobre`. A chamada "Entrar na conta" abre o fluxo de login existente.
- Não usar contadores, gráficos de crescimento, "mais de X alunos" ou qualquer prova social: esses dados não existem.
- Manter hierarquia: sobretítulo pequeno, marca, slogan, `h1`, descrição, chamadas e microcopy.

---

## 3. Problema — a origem do projeto

### Texto final (publicar)

**Sobretítulo:** Origem do projeto

**Título (h2):** Tudo começou com uma necessidade real.

**Primeiro parágrafo:** O Conecta ETEC nasceu da vivência escolar dos autores como estudantes do curso Técnico em Administração da ETEC Cravinhos. Observando o cotidiano da escola, o grupo percebeu que muitas atividades já aconteciam, mas não estavam reunidas em um mesmo ambiente.

**Segundo parágrafo:** Esse ponto de partida vem da observação do dia a dia escolar, e não de uma pesquisa estatística ou de entrevistas formais. A proposta surgiu da necessidade de organizar processos que já existiam, sem aumentar a carga de trabalho de quem acompanha os estudantes.

**Quatro desafios identificados:**

**Informações dispersas**
Atividades, prazos e comunicados podem ficar distribuídos em diferentes canais, o que dificulta saber o que está pendente e o que já foi resolvido.

**Falta de constância**
Parte dos estudantes encontra dificuldades para manter uma rotina organizada de estudos e participação ao longo do período letivo.

**Acompanhamento manual**
Professores e funcionários precisam acompanhar entregas, conferir atividades e registrar resultados, muitas vezes com controles separados.

**Pouca visibilidade do progresso**
Nem sempre o estudante consegue visualizar de maneira integrada sua participação, seus pontos e sua evolução.

**Pergunta de transição:** A pergunta que orientou o projeto foi: como a tecnologia poderia ajudar a organizar a rotina escolar e incentivar a participação dos estudantes sem aumentar a carga de trabalho da equipe?

### Notas de implementação (não publicar)

- A frase sobre "pesquisa estatística ou entrevistas formais" é obrigatória: protege a narrativa de qualquer inferência de evidência empírica que o projeto não produziu.
- Não atribuir os desafios a "dados", "pesquisas" ou percentuais. Eles são o resultado da observação dos autores.
- A pergunta de transição deve funcionar como fecho visual da seção e conduzir à seção de solução.
- Os quatro cartões podem usar ícones próprios, sempre decorativos.

---

## 4. Solução — a resposta do Conecta ETEC

### Texto final (publicar)

**Título (h2):** Uma plataforma. Diferentes possibilidades. Um objetivo em comum.

**Primeiro parágrafo:** O Conecta ETEC é a resposta desenvolvida para esse cenário. A plataforma reúne, em um único ambiente digital, atividades escolares, ações da escola, entregas, validações, reforço de conteúdo, pontuação, recompensas, notificações e acompanhamento.

**Segundo parágrafo:** A proposta não é voltada apenas ao aluno. Professores e funcionários ganham ferramentas para publicar, validar e acompanhar; a coordenação passa a contar com uma visão do conjunto da escola. A tecnologia apoia a rotina pedagógica e não substitui o trabalho dos profissionais da educação.

**Terceiro parágrafo (transição para o fluxo):** O funcionamento segue um ciclo simples, que conecta quem publica, quem participa e quem acompanha.

**Fluxo visual:**

**Atividade**
Professores e funcionários criam e publicam atividades para uma turma, com prazo, pontuação e orientações.

**Entrega**
O estudante consulta a atividade, realiza o que foi solicitado e envia a entrega com comentário, evidência e, quando necessário, anexos.

**Validação**
O responsável analisa a entrega e registra o resultado: aprovação, reprovação ou solicitação de correção, sempre com retorno ao estudante.

**Pontuação**
A aprovação credita os pontos correspondentes, que passam a aparecer no extrato e no saldo do estudante.

**Recompensa e acompanhamento**
O estudante acompanha a evolução e pode trocar pontos por recompensas; a equipe escolar acompanha indicadores, relatórios e registros de auditoria.

### Notas de implementação (não publicar)

- O fluxo deve ser um `<ol>` (lista ordenada) para que leitores de tela entendam a sequência; cada etapa tem título e descrição curta.
- Manter a ordem e os nomes exatos das etapas: ATIVIDADE, ENTREGA, VALIDAÇÃO, PONTUAÇÃO, RECOMPENSA E ACOMPANHAMENTO.
- Não descrever a etapa de validação como automática: a decisão é sempre de um responsável (professor, funcionário ou coordenação).
- A pontuação na aprovação é real (RN05). Não citar valores de pontos por etapa, porque a pontuação é definida por atividade.

---

## 5. Funcionalidades

### Texto final (publicar)

**Título (h2):** Tudo o que a rotina escolar precisa, conectado em um só lugar.

**Introdução:** Os grupos abaixo reúnem recursos que já fazem parte do protótipo funcional. Itens previstos para as próximas etapas aparecem apenas na seção "Um projeto em evolução".

#### Organização de atividades

**Descrição curta:** Planejamento, publicação e acompanhamento das atividades de cada turma.

- Criação e publicação de atividades, com transição de rascunho para ativa e encerramento.
- Definição de prazo, pontuação e janela de tolerância para entregas atrasadas.
- Organização por turma, disciplina e tipo de atividade, incluindo ações escolares.
- Visualização em lista ou calendário, com filtros por status, tipo e turma.
- Acompanhamento do andamento, com contagem de entregas e aprovações por atividade.
- Exclusão lógica: a atividade sai das listas, mas entregas e pontos já registrados são preservados.

#### Entregas e validações

**Descrição curta:** Do envio do estudante ao retorno do responsável, com registro de cada etapa.

- Envio de entrega com comentário e evidência descritiva.
- Anexos de imagens e PDF, com limite de três arquivos de até 5 MB cada.
- Reenvio quando o responsável solicita correção.
- Aprovação, reprovação ou solicitação de correção, com feedback ao estudante.
- Registro de atraso e aplicação da regra de pontuação proporcional em entregas atrasadas.

#### Reforço escolar

**Descrição curta:** Conteúdos de apoio para reforçar o aprendizado ao longo do período.

- Conteúdos organizados por disciplina e destinados a turmas específicas.
- Lição, questões de verificação e materiais de apoio em imagem ou PDF.
- Conclusão única por estudante em cada reforço, com crédito de pontos previsto no conteúdo.
- Criação e gestão pelo professor para as próprias turmas.

#### Gamificação

**Descrição curta:** Pontos, níveis e sequência para tornar a participação visível ao longo do tempo.

- Carteira de pontos com extrato de créditos e débitos.
- Níveis Bronze, Prata, Ouro e Diamante, calculados pelo saldo de pontos.
- Sequência de participação, com bônus ao atingir marcos de dias seguidos.
- Bônus e ajustes de pontos registrados pela coordenação.
- Histórico de pontuação disponível para o estudante.

#### Recompensas

**Descrição curta:** Um catálogo de recompensas ligado ao esforço acumulado na plataforma.

- Catálogo de recompensas com custo em pontos e controle de estoque.
- Consulta de saldo antes do resgate.
- Resgate de pontos com validação de saldo e de estoque.
- Histórico de resgates para o estudante.
- Gerenciamento de recompensas e acompanhamento dos resgates pela coordenação.

#### Comunicação e acompanhamento

**Descrição curta:** Avisos, notificações e indicadores para que cada perfil saiba o que aconteceu e o que fazer.

- Notificações sobre novas atividades, resultados de validação, pontos e recompensas.
- Avisos da coordenação para estudantes e professores, de toda a escola ou de turmas específicas.
- Indicadores de participação nos painéis de aluno, professor, funcionário e coordenação.
- Relatórios consolidados com filtros por turma, disciplina e período.
- Exportação de relatórios em CSV.
- Auditoria das ações sensíveis da plataforma.

### Notas de implementação (não publicar)

- Não mover bullets entre grupos nem acrescentar recursos previstos: a lista acima corresponde ao código atual.
- "Evidência descritiva" é o texto que o aluno escreve no envio; os arquivos são anexos. Não chamar a evidência de "arquivo" nem prometer upload como única forma de comprovar.
- O limite de anexos vale para entregas e materiais de reforço: até 3 arquivos, 5 MB cada, nos tipos JPEG, PNG, WebP, GIF e PDF (`app/client/src/lib/attachments.ts`, `app/server/src/config.ts`).
- A exclusão é lógica e mantém os pontos concedidos: não descrever como "apagar definitivamente".
- Não afirmar "integração com o SIGA", "boletim oficial" ou "diário de classe".
- Cada cartão pode ter um ícone próprio; o texto não depende do ícone.

---

## 6. Para quem — os quatro perfis

### Texto final (publicar)

**Sobretítulo:** Para quem é o Conecta ETEC?

**Título (h2):** Quatro perfis, uma mesma conexão.

**Introdução:** Cada perfil tem um painel próprio, com as ferramentas e as permissões correspondentes ao seu papel na escola. Todos participam do mesmo ciclo de atividades, entregas, validação e acompanhamento.

#### Aluno

**Descrição:** O aluno acompanha suas atividades, organiza sua rotina de estudos e visualiza sua evolução dentro da plataforma.

- Consultar atividades, prazos e calendário da turma.
- Enviar entregas com comentário, evidência e anexos.
- Reenviar a entrega quando houver solicitação de correção.
- Acompanhar o feedback e o resultado das validações.
- Acessar o reforço escolar das suas turmas.
- Acompanhar pontos, níveis e sequência de participação.
- Resgatar recompensas e consultar o histórico de resgates.
- Receber notificações e editar nome, foto e senha do próprio perfil.

#### Professor

**Descrição:** O professor organiza as atividades de suas turmas, acompanha entregas e oferece suporte ao desenvolvimento dos estudantes.

- Criar, publicar e encerrar atividades das próprias turmas.
- Definir prazo, tolerância de atraso, pontuação e tipo de atividade.
- Consultar atividades em lista ou calendário, com filtros.
- Validar entregas, aprovando, reprovando ou solicitando correção.
- Enviar feedback e acompanhar o reenvio das correções.
- Criar e gerenciar o reforço escolar das próprias turmas.
- Acompanhar indicadores das turmas e o desempenho das próprias atividades.
- Exportar listas de alunos e relatórios em CSV.

#### Funcionário

**Descrição:** Os funcionários organizam ações escolares e participam do acompanhamento das atividades relacionadas às suas responsabilidades.

- Criar ações escolares dos tipos operacionais: Ação Escolar, Evento, Biblioteca e Suporte.
- Organizar ações de biblioteca, eventos e suporte à rotina escolar.
- Publicar e encerrar as ações sob sua responsabilidade.
- Validar as entregas relacionadas às próprias ações.
- Consultar o histórico de entregas e validações.
- Receber notificações e editar o próprio perfil.

#### Coordenação

**Descrição:** A coordenação possui uma visão global da plataforma e gerencia os elementos que sustentam a rotina escolar.

- Cadastrar e gerenciar usuários de todos os perfis.
- Gerenciar turmas e disciplinas.
- Acompanhar as atividades da escola, inclusive as excluídas logicamente.
- Acompanhar e validar entregas de toda a escola.
- Gerenciar pontos, bônus e ajustes de saldo.
- Gerenciar o catálogo de recompensas e os resgates.
- Publicar avisos para toda a escola ou para turmas específicas.
- Consultar relatórios com exportação em CSV e os registros de auditoria.

**Frase de conexão:** Os quatro perfis compartilham o mesmo sistema: a atividade criada por um professor ou funcionário chega ao aluno, a validação gera o retorno e a pontuação, e a coordenação acompanha o conjunto — sem cadastros paralelos e sem controles separados.

### Notas de implementação (não publicar)

- Cores de referência dos painéis, já definidas em `app/client/src/lib/theme.ts`: aluno em azul, professor em roxo, funcionário em verde, coordenação em laranja/vermelho. A landing page deve usar essas cores como acento, mantendo o azul como identidade central.
- Máximo de oito bullets por perfil, conforme solicitado.
- As descrições dos perfis partem do briefing e das personas (Gabriel e Larissa, alunos; Rafael, professor; Marcos, funcionário; Camila, coordenação), mas as personas não devem ser publicadas como pessoas reais nem com histórias inventadas.
- "Editar nome, foto e senha" é recurso implementado em `ProfileView` e nas rotas `PATCH /api/users/me` e `POST /api/users/me/avatar`. Não remover da lista nem tratar como futuro.
- A coordenação não cria atividades pela interface: ela acompanha, edita quando necessário e valida. Não escrever "criar atividades" no bloco da coordenação.

---

## 7. Como funciona na prática

### Texto final (publicar)

**Título (h2):** Da atividade à conquista.

**Introdução:** O percurso abaixo mostra o caminho completo de uma atividade dentro da plataforma — da publicação ao acompanhamento.

**Etapa 1 — Publicação**
O professor cria a atividade, define prazo, pontuação e turma, e publica. A partir da publicação, os estudantes da turma passam a visualizar a atividade.

**Etapa 2 — Participação**
O estudante consulta a atividade, realiza o que foi solicitado e envia a entrega com comentário e evidência. Quando necessário, anexa imagens ou PDF.

**Etapa 3 — Validação**
O professor ou funcionário responsável analisa a entrega e registra o resultado: aprovação, reprovação ou solicitação de correção. Em reprovação e correção, o feedback é obrigatório.

**Etapa 4 — Reconhecimento**
Com a aprovação, o sistema registra a pontuação correspondente e notifica o estudante. O resultado fica registrado e pode ser consultado a qualquer momento.

**Etapa 5 — Evolução**
O estudante acompanha o saldo, o nível, a sequência de participação e o histórico de pontos. Com saldo suficiente, pode resgatar recompensas do catálogo.

**Etapa 6 — Gestão**
A equipe escolar acompanha indicadores, validações pendentes, relatórios e registros de auditoria, usando esses recursos para monitorar a rotina acadêmica.

### Notas de implementação (não publicar)

- A etapa 1 exemplifica o fluxo pedagógico com o professor; ações escolares criadas por funcionários seguem o mesmo caminho, com validação pelo responsável.
- A etapa 3 deve deixar claro que a validação é humana e registrada; não sugerir correção automática.
- A etapa 4 não deve prometer pontos em toda entrega: só a aprovação gera crédito de atividade; entregas atrasadas seguem a regra de pontuação proporcional.
- Na etapa 6, não afirmar que os relatórios substituem registros acadêmicos oficiais.
- A linha do tempo deve ser um `<ol>` com seis itens; em telas pequenas, empilhar verticalmente sem perder a numeração.

---

## 8. Gamificação e evolução

### Texto final (publicar)

**Título (h2):** Participar também pode ser uma conquista.

**Primeiro parágrafo:** A gamificação é usada para tornar a participação mais visível e significativa. Em vez de um número isolado, o estudante acompanha uma trajetória: pontos, níveis, sequência de participação e recompensas.

**Segundo parágrafo:** Os pontos ficam registrados em uma carteira, com extrato de créditos e débitos. Entregas aprovadas geram pontos; a conclusão de um reforço escolar também pode gerar crédito; bônus de sequência e ajustes feitos pela coordenação entram no mesmo histórico.

**Subtítulo (h3):** Níveis

**Tabela de níveis:**

| Nível | Faixa de pontos |
| --- | --- |
| Bronze | Menos de 100 pontos |
| Prata | De 100 a 299 pontos |
| Ouro | De 300 a 499 pontos |
| Diamante | 500 pontos ou mais |

**Texto após a tabela:** Ao acumular pontos, o estudante avança de nível. A barra de progresso mostra quanto falta para o próximo nível. Ao chegar ao Diamante, a plataforma acompanha uma meta de progresso de 800 pontos.

**Subtítulo (h3):** Recompensas

**Parágrafo:** Os pontos podem ser trocados por recompensas cadastradas pela escola. O resgate desconta o valor do saldo e fica registrado no histórico do estudante; a coordenação acompanha os resgates e o estoque do catálogo.

**Aviso de ilustração:** Os exemplos desta página são ilustrativos e servem apenas para explicar o funcionamento. Não representam dados de estudantes reais.

**Exemplo ilustrativo (opcional na interface):** Um estudante com 120 pontos está no nível Prata. Se o catálogo tiver uma recompensa de 50 pontos e houver estoque, ele pode resgatar e ficar com 70 pontos.

### Notas de implementação (não publicar)

- As faixas são exatamente as do código: `levelLabel` em `app/shared/types.ts` (Bronze < 100, Prata >= 100, Ouro >= 300, Diamante >= 500).
- A meta de 800 pontos existe como progresso dentro do Diamante, não como quinto nível. Não criar "nível 800".
- O crédito de reforço é único por estudante e por reforço, com valor definido no conteúdo (padrão 5 pontos). Não prometer valores fixos.
- Os marcos de sequência no código são 3, 7, 12 e 20 dias, com bônus de 10, 20, 40 e 80 pontos. A página pode citar "marcos de dias seguidos" sem detalhar números; se detalhar, usar exatamente esses valores.
- A tabela de níveis deve ter `<caption>` acessível ("Níveis e faixas de pontos") e cabeçalhos de coluna.
- Não prometer prêmios específicos, benefícios financeiros, notas melhores ou aprovação garantida.

---

## 9. Desenvolvimento — como o projeto foi construído

### Texto final (publicar)

**Título (h2):** Uma ideia construída a partir da realidade escolar.

**Introdução:** O Conecta ETEC não começou pelas telas. Começou pela observação da rotina escolar e pela definição do problema que a plataforma deveria ajudar a resolver.

**1. Identificação do problema**
A partir da vivência escolar, o grupo percebeu dificuldades relacionadas à organização, à participação e ao acompanhamento das atividades. Foi esse conjunto de necessidades que deu origem ao projeto.

**2. Planejamento da solução**
Foram definidos o público-alvo, as necessidades dos usuários, os objetivos, as personas e a proposta de valor da plataforma.

**3. Estruturação das funcionalidades**
Foram planejados os perfis de acesso e os processos de atividades, entregas, validações, pontuação e recompensas, com as regras de negócio que sustentam cada etapa.

**4. Desenvolvimento da interface**
Foram elaboradas as telas e os fluxos de navegação, considerando a experiência de alunos, professores, funcionários e coordenação.

**5. Desenvolvimento tecnológico**
O projeto evoluiu para uma aplicação web com interface, servidor, banco de dados, autenticação e controle de permissões.

**6. Evolução do protótipo**
A plataforma foi ampliada com reforço escolar, notificações, avisos, relatórios, auditoria, acessibilidade e recursos de acompanhamento para os quatro perfis.

### Notas de implementação (não publicar)

- Não inserir datas, prazos, quantidade de versões, número de testes ou nomes de ferramentas não confirmados.
- Preferir "projeto acadêmico desenvolvido na ETEC Cravinhos" a "TCC" ou "Projeto Integrador II" na página pública, para não criar divergência entre os documentos do projeto.
- A linha do tempo pode usar marcadores visuais numerados, sem datas.

---

## 10. Tecnologia e desenvolvimento

### Texto final (publicar)

**Título (h2):** Por trás de uma experiência integrada.

**Introdução:** A plataforma é construída com tecnologias consolidadas no desenvolvimento web. A escolha prioriza organização do código, tipagem, acessibilidade e manutenção.

**Interface do usuário**
React 19, TypeScript, Vite e Tailwind CSS 4. Essas ferramentas sustentam as telas, os componentes e o comportamento responsivo dos painéis.

**Servidor e dados**
Node.js, Express, SQLite e Zod. O servidor concentra as regras de negócio, as permissões, a persistência e a validação dos dados recebidos.

**Recursos de base**
Sessão autenticada, controle de permissões por perfil, gerenciamento de arquivos, relatórios, testes automatizados e auditoria.

**Frase de encerramento:** A arquitetura separa a interface do usuário da lógica de negócio e do armazenamento de dados. Na prática, a tela não decide sozinha o que pode ser feito: as regras e as permissões são verificadas no servidor.

### Notas de implementação (não publicar)

- Não transformar a seção em documentação técnica: no máximo uma frase explicativa por item, sem trechos de código.
- Node.js é requisito 24 ou superior; a página pode dizer apenas "Node.js" para não poluir. Se citar versão, usar "Node.js 24 ou superior", conforme `app/README.md` e `docs/TECNICO.md`.
- "Sessão autenticada" significa cookie `httpOnly` com sessão registrada no servidor; não detalhar o mecanismo na página pública.
- Testes automatizados existem (Vitest, Testing Library, MSW e Supertest), mas não há suíte ponta a ponta: não afirmar cobertura total.
- Não mencionar licença de uso: ela ainda não foi definida pelos autores (`README.md`).

---

## 11. Estado atual e próximos passos

### Texto final (publicar)

**Título (h2):** Um projeto em evolução.

**Primeiro parágrafo:** O Conecta ETEC é um protótipo funcional em desenvolvimento. O ciclo principal já está implementado e pode ser percorrido pelos quatro perfis, mas a plataforma ainda não é um sistema institucional em produção.

**Segundo parágrafo:** A distinção abaixo é intencional: de um lado, o que já funciona no protótipo; de outro, o que ainda depende de desenvolvimento, validação ou decisão institucional.

#### O que já foi desenvolvido

- Autenticação com e-mail e senha, sessão autenticada e perfis de acesso separados.
- Cadastro e gerenciamento de usuários, turmas e disciplinas pela coordenação.
- Criação, publicação, encerramento e exclusão lógica de atividades, com prazo e tolerância de atraso.
- Visualização de atividades em lista e em calendário, com filtros nas telas de gestão.
- Entregas com comentário, evidência e anexos de imagem ou PDF.
- Reenvio de entrega após solicitação de correção.
- Validação com aprovação, reprovação ou solicitação de correção, com feedback ao estudante.
- Pontuação, níveis, sequência de participação, bônus e ajustes de saldo.
- Catálogo de recompensas, resgate de pontos e histórico de resgates.
- Reforço escolar com lição, questões de verificação e materiais de apoio.
- Notificações dentro da plataforma e avisos da coordenação.
- Indicadores por perfil, relatórios com exportação em CSV e auditoria de ações.
- Edição do próprio perfil, com alteração de nome, foto e senha.
- Modo escuro, ajuste de tamanho de fonte e recursos de acessibilidade nos painéis.

#### O que ainda está em evolução

- Login único institucional e recuperação de senha.
- Cadastro público de contas, hoje inexistente: as contas são criadas pela coordenação.
- Publicação em infraestrutura oficial, com HTTPS, backups e monitoramento.
- Integração com sistemas acadêmicos institucionais.
- Notificações por e-mail ou push.
- Ampliação dos testes, incluindo testes ponta a ponta.
- Reforço das políticas de segurança e de privacidade.
- Interface de manutenção da grade curricular.
- Pesquisa formal com estudantes e equipe escolar para medir engajamento e impacto.
- Endereço público de demonstração: ainda não existe.

**Frase de transparência:** O protótipo não é apresentado como sistema homologado ou oficialmente implantado pela instituição. A publicação e a integração com sistemas acadêmicos oficiais fazem parte das próximas etapas.

### Notas de implementação (não publicar)

- Não mover "edição de perfil" para a lista de evolução: o recurso está implementado (`app/client/src/pages/shared/ProfileView.tsx`, `PATCH /api/users/me`, `POST /api/users/me/avatar`).
- "Upload de anexos" também é recurso implementado e não deve aparecer como futuro.
- As listas devem usar `<ul>` e ter títulos claros; não usar apenas cor (verde/vermelho) para diferenciar as categorias.
- Não citar SIGA, login institucional, implantação oficial ou URL de demonstração como existentes. Podem ser citados apenas como etapas futuras, exatamente como acima.
- A frase sobre não ser "sistema homologado" é obrigatória para evitar leitura de vínculo oficial.
- "Modo escuro" e "ajuste de fonte" estão nos painéis autenticados; não prometer que a landing page terá os mesmos controles, a menos que sejam implementados.

---

## 12. Contato

### Texto final (publicar)

**Título (h2):** Vamos manter essa conexão?

**Primeiro parágrafo:** O Conecta ETEC é um projeto acadêmico em desenvolvimento, e o repositório público é o principal canal para acompanhar sua evolução. Ali estão o código e a documentação técnica do protótipo.

**Segundo parágrafo:** Para sugestões, dúvidas técnicas ou relatos de problemas, use a página de issues do repositório. Ela é o canal disponível para registrar contribuições e acompanhar as respostas.

**Link 1:** Acompanhar o projeto no GitHub
Destino: `https://github.com/nicolastrovoada/ConectaETEC`

**Link 2:** Abrir uma issue no repositório
Destino: `https://github.com/nicolastrovoada/ConectaETEC/issues`

**Aviso transparente:** Outros canais de contato, como e-mail institucional, telefone ou redes sociais, ainda não foram publicados. Quando forem definidos pelos responsáveis pelo projeto, serão divulgados nesta seção.

### Notas de implementação (não publicar)

- Não criar formulário de contato. Não existe integração real de envio; um formulário que apenas simula o envio violaria a especificação.
- Não inventar e-mail, telefone, WhatsApp, Instagram ou qualquer rede social.
- Os canais adicionais devem vir de uma configuração centralizada (ver seção [16](#16-configuração-centralizada-de-conteúdo)), com lista vazia por padrão e o aviso acima como fallback.
- Se o repositório não permitir abertura de issues, o segundo link deve ser omitido e o texto ajustado para mencionar apenas o GitHub. A disponibilidade de issues não pode ser confirmada pelo código.
- Links externos devem abrir em nova aba com `rel="noopener noreferrer"` e indicação acessível "(abre em nova aba)".
- O nome do repositório e o endereço são os únicos contatos confirmados.

---

## 13. Rodapé

### Texto final (publicar)

**Marca:** Conecta ETEC

**Slogan:** Conectando o futuro.

**Descrição curta:** Plataforma de engajamento escolar que reúne atividades, entregas, validação, reforço, pontos e recompensas em um único ambiente.

**Navegação:** Início | Sobre o projeto | Funcionalidades | Para quem | Desenvolvimento | Contato

**Link externo:** GitHub

**Contexto acadêmico:** Projeto acadêmico desenvolvido na ETEC Cravinhos, Centro Paula Souza, em 2026.

**Aviso:** Este site apresenta um protótipo em desenvolvimento. Não representa homologação ou implantação oficial pela instituição.

**Ano:** 2026

### Notas de implementação (não publicar)

- Não incluir "todos os direitos reservados" nem badge de licença: a licença de uso ainda não foi definida pelos autores (`README.md`).
- Não incluir endereço físico, CNPJ, telefone ou e-mail institucional.
- O rodapé deve ser um `<footer>` com grupos de links nomeados por `aria-label` (por exemplo, "Navegação do rodapé" e "Links do projeto").
- A descrição curta deve repetir apenas recursos existentes.

---

## 14. SEO e apresentação pública

### Texto final (publicar)

**`<title>`:** Conecta ETEC — Conectando o futuro

**Meta description:** Plataforma de engajamento escolar que conecta alunos, professores, funcionários e coordenação em atividades, entregas, validação, pontos e recompensas.

**Open Graph:**

- `og:type`: website
- `og:site_name`: Conecta ETEC
- `og:locale`: pt_BR
- `og:title`: Conecta ETEC — Conectando o futuro
- `og:description`: Plataforma de engajamento escolar que aproxima estudantes, professores, funcionários e coordenação, organizando atividades, estudos e reconhecimento em um único ambiente digital.

**Idioma do documento:** `pt-BR`

**Cor de tema sugerida:** `#172554` (azul escuro da identidade, equivalente ao `blue-950` já usado no login)

### Notas de implementação (não publicar)

- O `index.html` atual tem `<title>Conecta ETEC — V2</title>` e uma descrição genérica. O título e a descrição acima devem substituí-los.
- Como a aplicação é uma SPA, as metatags estáticas valem para todas as rotas. Não é necessário criar lógica dinâmica de SEO para a landing page.
- Não definir `og:url` nem `canonical` enquanto não houver domínio público definido: inventar URL é proibido pela especificação.
- Não há arquivo de imagem Open Graph nem favicon no repositório. Ou o time cria esses ativos antes de publicar, ou as tags `og:image` e o favicon são omitidos. Não apontar para arquivos inexistentes.
- A meta description tem cerca de 150 caracteres e deve ser mantida nesse intervalo para não ser truncada nos resultados de busca.
- Não incluir palavras-chave falsas, nomes de outras instituições, "sistema oficial" ou promessas de resultado.
- O título deve ser coerente com o `h1`, mas não idêntico: o `h1` é a mensagem da página; o `<title>` é a identificação para buscadores e abas.

---

## 15. Acessibilidade textual

### Textos alternativos e rótulos

| Elemento | Texto acessível |
| --- | --- |
| Marca no cabeçalho | Se for imagem: `alt="Conecta ETEC"`. Se for texto, não precisa de `alt`; o link recebe `aria-label="Conecta ETEC — Início"`. |
| Representação do produto no hero | `aria-label="Representação ilustrativa do painel do aluno, com cartões de atividade, entrega, nível e pontos"` |
| Selo da representação | Texto visível "Demonstração visual"; leitura: "Demonstração visual, interface ilustrativa sem dados reais" |
| Ícones decorativos | `aria-hidden="true"` |
| Navegação principal | `aria-label="Navegação principal"` |
| Menu móvel fechado | Botão "Abrir menu de navegação", com `aria-expanded="false"` |
| Menu móvel aberto | Botão "Fechar menu de navegação", com `aria-expanded="true"` |
| Atalho de conteúdo | Link "Pular para o conteúdo", visível ao receber foco |
| Fluxo de etapas | `<ol>` com título acessível "Ciclo de funcionamento da plataforma" |
| Tabela de níveis | `<caption>` "Níveis e faixas de pontos" e cabeçalhos "Nível" e "Faixa de pontos" |
| Link do GitHub | Texto visível "Acompanhar o projeto no GitHub"; leitura complementar "(abre em nova aba)" |
| Link de issues | Texto visível "Abrir uma issue no repositório"; leitura complementar "(abre em nova aba)" |
| Botão de acesso do cabeçalho | "Entrar na conta" (rótulo visível compacto "Entrar" no celular) |
| Chamada do hero | "Conhecer a plataforma" |
| Chamada de acesso do hero | "Entrar na conta" |

### Notas de implementação (não publicar)

- Não usar "clique aqui", "saiba mais" ou "leia mais" como único texto de link. Todo link deve fazer sentido fora de contexto.
- Não depender de cor para indicar estado, nível ou categoria: usar texto, rótulo ou ícone com descrição.
- Garantir foco visível em todos os elementos interativos, inclusive nos cartões que forem links.
- Respeitar `prefers-reduced-motion`; a aplicação já possui regra global em `app/client/src/index.css`.
- Hierarquia de títulos: um `h1` (hero), `h2` por seção, `h3` apenas dentro de seção (por exemplo, "Níveis" e "Recompensas" na gamificação).
- Textos de botões e links não devem ser alterados por tamanho de tela.
- O menu móvel deve prender o foco enquanto aberto e fechar com `Esc`, seguindo o padrão já usado em `Layout.tsx`.
- A representação visual do produto não pode ser o único meio de transmitir informação: o texto ao redor deve explicar o mesmo conteúdo.

---

## 16. Configuração centralizada de conteúdo

### Estrutura recomendada

Os textos e links que podem mudar com o tempo devem ficar em um único módulo de configuração do cliente, e não espalhados pelos componentes. Formato sugerido (TypeScript, apenas como referência de conteúdo):

```ts
export const siteConfig = {
  name: "Conecta ETEC",
  slogan: "Conectando o futuro.",
  academicContext: "Projeto acadêmico desenvolvido na ETEC Cravinhos, Centro Paula Souza, em 2026.",
  githubUrl: "https://github.com/nicolastrovoada/ConectaETEC",
  issuesUrl: "https://github.com/nicolastrovoada/ConectaETEC/issues",
  contactChannels: [] as Array<{ label: string; href: string; kind: "email" | "social" | "other" }>,
  contactFallback:
    "Outros canais de contato, como e-mail institucional, telefone ou redes sociais, ainda não foram publicados.",
}
```

### Regras

- Enquanto `contactChannels` estiver vazio, a seção de contato exibe o aviso de fallback.
- Nenhum canal deve ser adicionado sem confirmação dos responsáveis pelo projeto.
- O link de issues deve ser exibido apenas se o repositório permitir abertura de issues; caso contrário, remover o item e manter apenas o GitHub.
- Não duplicar URLs em componentes: todos os links externos vêm da configuração.

---

## 17. Divergências resolvidas

| # | O que a documentação ou a especificação dizia | O que o código mostra | Decisão editorial | Fonte usada |
| --- | --- | --- | --- | --- |
| 1 | Edição de perfil pelo próprio usuário seria recurso futuro (`README.md`, `docs/ROADMAP.md`, `docs/TECNICO.md`, `app/README.md`). | O perfil tem modo de edição com nome, senha e foto; o servidor expõe `PATCH /api/users/me` e `POST /api/users/me/avatar`. | "Edição de perfil" aparece como recurso já desenvolvido. | `app/client/src/pages/shared/ProfileView.tsx`; `app/server/src/routes/users.ts` |
| 2 | O briefing descreve dados em `INITIAL_DB` na memória, senhas sem hash, ausência de upload e ausência de sessão segura (limitações do protótipo inicial). | A versão atual usa SQLite persistente, hash de senha com bcrypt, sessão em cookie `httpOnly` registrada no servidor e upload de anexos com validação de tipo e tamanho. | A página não menciona limitações que não existem mais. O protótipo é descrito como funcional, com banco persistente local e upload de anexos. | `docs/TECNICO.md` (seções 1 e 6); `app/README.md`; `app/server/src/auth/password.ts`; `app/server/src/auth/session.ts`; `app/server/src/routes/uploads.ts` |
| 3 | A especificação lista "edição de perfil" entre as melhorias previstas (§5.11). | Recurso implementado (ver item 1). | Item removido da lista de evolução. | Código citado no item 1 |
| 4 | A especificação fala em "rota existente de login". | Não há rota de URL: o cliente renderiza `LoginPage` quando não há sessão, e o login é `POST /api/auth/login`. | O botão de acesso abre o fluxo de autenticação existente, sem nova rota, tela ou cadastro. | `app/client/src/App.tsx`; `app/server/src/routes/auth.ts` |
| 5 | A especificação sugere link para issues "caso o repositório permita". | O código não informa se as issues estão habilitadas. | O link é apresentado como canal disponível, com nota de implementação para removê-lo se as issues estiverem desabilitadas. | `README.md` (repositório público); verificação não possível pelo código |
| 6 | README e documentos usam "TCC 2026" e mencionam "Projeto Integrador II". | Não há texto público que exija a sigla. | A página usa "projeto acadêmico desenvolvido na ETEC Cravinhos", evitando divergência entre documentos. | `README.md`; `Arquivos_fonte/landing-spec.txt` §5.9 |
| 7 | A especificação pede "favicon com a identidade do projeto" e Open Graph "quando adequado". | Não existe favicon nem imagem Open Graph no repositório; a marca é tipográfica. | As tags de imagem ficam pendentes de criação de ativo; nenhuma URL de imagem é inventada. | `app/client/index.html`; ausência de `public/` no cliente |
| 8 | A tela de login exibia contas de demonstração e a senha `123456`. | O boot do servidor não semeia essas contas: cria apenas a coordenação inicial a partir de variáveis de ambiente; o seed com contas demo é usado somente em testes. | Os atalhos demo foram removidos da tela de login para não sugerir credenciais inexistentes. A landing page nunca menciona credenciais. | `app/client/src/pages/LoginPage.tsx`; `app/client/src/pages/LoginPage.test.tsx`; `app/server/src/db/bootstrap.ts`; `app/server/src/tests/helpers.ts` |
| 9 | A especificação pede "relatórios" e "exportação de dados" (§5.5). | Existem relatórios de conclusão, pontos, atividades por tipo, detalhe de atividades, resumo por professor e rankings, com exportação CSV nos relatórios aplicáveis. | A página descreve "relatórios consolidados com filtros e exportação em CSV", sem listar todos os relatórios. | `app/server/src/routes/reports.ts`; `app/client/src/pages/coordinator/CoordinatorReportsView.tsx` |
| 10 | A especificação fala em "notificações" sem distinguir tipos. | O sistema separa notificações transitórias (somem após leitura) e persistentes (permanecem até leitura). | A página fala apenas em "notificações dentro da plataforma"; o detalhe técnico fica fora do texto público. | `app/server/src/routes/notifications.ts`; `app/docs/api-contract.md` |
| 11 | O briefing descreve "evidência de atividades apenas textual", sem upload. | Entregas aceitam comentário, evidência textual e até 3 anexos de imagem ou PDF, com 5 MB cada. | A página cita "comentário, evidência e anexos". | `app/client/src/features/StudentSubmitModal.tsx`; `app/server/src/routes/submissions.ts`; `app/server/src/config.ts` |
| 12 | Os documentos citam "sequência de participação" sem detalhar marcos. | Os marcos são 3, 7, 12 e 20 dias, com bônus de 10, 20, 40 e 80 pontos. | A página menciona "bônus ao atingir marcos"; os números ficam em nota de implementação, não no texto público. | `app/shared/types.ts` (`STREAK_MILESTONES`) |

---

## 18. Pendências que dependem dos autores

Os itens abaixo não podem ser preenchidos por inferência. Cada um deve ser resolvido antes de a página ser publicada:

1. **Canais oficiais de contato.** Não há e-mail, telefone ou redes sociais definidos. A seção de contato exibe apenas GitHub e issues, com o aviso de que outros canais ainda não foram publicados.
2. **Disponibilidade de issues.** Confirmar se o repositório permite abertura de issues. Se não permitir, remover o segundo link.
3. **Ativo de imagem para Open Graph e favicon.** Não existe arquivo de imagem no repositório. Criar o ativo ou manter as tags ausentes.
4. **Domínio público.** Não há URL pública de demonstração nem domínio oficial. `og:url` e `canonical` ficam indefinidos até a publicação.
5. **Resultados de pesquisa com usuários.** Não há campanha formal de pesquisa. Nenhum resultado, depoimento ou métrica de impacto deve ser acrescentado até que exista coleta real e autorizada.
6. **Nome institucional do projeto.** A página usa "projeto acadêmico desenvolvido na ETEC Cravinhos". Se a instituição exigir a sigla do componente curricular (TCC ou Projeto Integrador), a decisão deve ser registrada e aplicada de forma consistente.
7. **Licença de uso.** A licença ainda não foi definida; não incluir badge ou afirmação de código aberto.
8. **Credenciais na tela de login.** Recomenda-se revisar a exibição de contas de demonstração na área pública, que hoje aparece antes do login e não corresponde ao banco criado no boot do servidor.

---

## Referências consultadas

Os itens abaixo registram as fontes usadas para verificar fatos e tecnologias citadas na página. Quando a página mencionar uma tecnologia, a referência correspondente pode ser usada em materiais acadêmicos do projeto.

BRASIL. **Base Nacional Comum Curricular**. Brasília: Ministério da Educação, 2018.

CENTRO PAULA SOUZA. **ETEC Cravinhos**. São Paulo: Centro Paula Souza, 2026.

CONECTA ETEC. **Conecta ETEC — plataforma de engajamento escolar**: repositório público. 2026. Disponível em: <https://github.com/nicolastrovoada/ConectaETEC>. Acesso em: 15 nov. 2026.

CONECTA ETEC. **Contrato da API — Conecta ETEC V3**. 2026. Disponível em: <https://github.com/nicolastrovoada/ConectaETEC/blob/main/app/docs/api-contract.md>. Acesso em: 15 nov. 2026.

CONECTA ETEC. **Referência técnica**. 2026. Disponível em: <https://github.com/nicolastrovoada/ConectaETEC/blob/main/docs/TECNICO.md>. Acesso em: 15 nov. 2026.

CONECTA ETEC. **Roadmap técnico**. 2026. Disponível em: <https://github.com/nicolastrovoada/ConectaETEC/blob/main/docs/ROADMAP.md>. Acesso em: 15 nov. 2026.

EXPRESS. **Express — web framework for Node.js**. 2026. Disponível em: <https://expressjs.com>. Acesso em: 15 nov. 2026.

NODE.JS. **Node.js documentation**. 2026. Disponível em: <https://nodejs.org/docs>. Acesso em: 15 nov. 2026.

REACT CORE TEAM. **React documentation**. 2026. Disponível em: <https://react.dev>. Acesso em: 15 nov. 2026.

SQLITE. **SQLite documentation**. 2026. Disponível em: <https://sqlite.org/docs.html>. Acesso em: 15 nov. 2026.

TAILWIND LABS. **Tailwind CSS documentation**. 2026. Disponível em: <https://tailwindcss.com/docs>. Acesso em: 15 nov. 2026.

TYPESCRIPT TEAM. **TypeScript documentation**. 2026. Disponível em: <https://typescriptlang.org/docs>. Acesso em: 15 nov. 2026.

VITE. **Vite documentation**. 2026. Disponível em: <https://vite.dev>. Acesso em: 15 nov. 2026.

ZOD. **Zod documentation**. 2026. Disponível em: <https://zod.dev>. Acesso em: 15 nov. 2026.

**Nota:** as datas de acesso acima registram a verificação feita em 15/11/2026. Ajustar caso a revisão final ocorra em outra data.
