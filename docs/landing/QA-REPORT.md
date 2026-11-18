# Relatório de QA — Landing page institucional Conecta ETEC

**Data da auditoria:** 2026-11-16 (auditoria estática) · 2026-11-17 (verificação em runtime e correções)  
**Escopo:** landing pública (`LandingPage` e componentes `components/landing/*`), integração de acesso em `App.tsx`/`LoginPage.tsx`, metadados em `app/client/index.html` e estilos globais relevantes em `app/client/src/index.css`.  
**Restrições atendidas:** comandos `npm run typecheck`, `npm run test` e `npm run build` executados em `D:\ConectaETEC\app` (resultados na §1); verificação em runtime com `agent-browser`; três correções pontuais aplicadas na landing (§4); alterações versionadas no branch `v3`.

## 1. Evidência de comandos e verificação em runtime (2026-11-17)

Executados em `D:\ConectaETEC\app`:

| Comando / verificação | Resultado |
|---|---|
| `npm run typecheck` (app) | OK (server + client) |
| `npm run test` (app) | OK — server 413/413 (28 arquivos), client 252/252 (24 arquivos), todos passando |
| `npm run build` (app) | OK — `dist/index.html` 1.24 kB, CSS 72.49 kB (gzip 12.47 kB), JS 520.25 kB (gzip 135.39 kB); aviso de chunk >500 kB é pré-existente e não bloqueante |
| Testes focalizados | 1 arquivo, 4 testes passando |
| `agent-browser` em `http://localhost:5173/` (Chrome headless, `AGENT_BROWSER_NO_VERSION_CHECK=1`) | 320×800: `scrollWidth = 320`, `innerWidth = 320`, `scrollWidth==innerWidth = true`, 1 `h1`; 768×900: `scrollWidth = 768`, `innerWidth = 768`; 1440×900: `scrollWidth = 1440`, `innerWidth = 1440`. Snapshot prévio em 1440: 1 `h1`, 11 `h2`, 11 seções em `<main>`. |

## 2. Checklist de aceitação

| # | Critério | Status | Evidência / observação |
|---|---|---|---|
| 1 | Um único `h1` na landing | **Passa** | `components/landing/HeroSection.tsx:53` define o único `h1` (`id="hero-title"`). Demais seções usam `h2`/`h3`; rodapé usa `h2` sr-only para info (`LandingFooter.tsx:9`). |
| 2 | `h2` por seção com `aria-labelledby` | **Passa** | `Section.tsx:35-39` aplica `aria-labelledby` na `<section>`; todas as seções principais passam `labelledBy` para título correspondente (`HeroSection.tsx:32-54`, `ProblemSection.tsx:24-29`, `SolutionSection.tsx:6-7`, `FeaturesSection.tsx:7-8`, `ProfilesSection.tsx:72-78`, `WorkflowSection.tsx:6-7`, `GamificationSection.tsx:23-24`, `DevelopmentSection.tsx:17-23`, `TechnologySection.tsx:6-7`, `ProjectStatusSection.tsx:7-8`, `ContactSection.tsx:8-16`, `SectionIntro.tsx:70-77`). |
| 3 | Ordem de headings sem saltos | **Passa** | Hierarquia observada: `h1` (hero) → `h2` por seção/intro → `h3` em cartões/subgrupos/rodapé; sem saltos diretos (ex.: sem `h4+` fora de contexto). |
| 4 | Landmarks `header/nav/main/footer` | **Passa** | `LandingHeader.tsx:37-40` (`role="banner"`), `:51` e `:95` (`nav aria-label="Navegação principal"`), `LandingPage.tsx:31` (`main id="conteudo"`), `LandingFooter.tsx:8` (`role="contentinfo"` + navs rotulados `:19`, `:35`). |
| 5 | Skip link para `#conteudo` | **Passa** | `LandingPage.tsx:25-27` com `href="#conteudo"` e texto `A11Y.skipToContent` (`content.ts:74`); estilos `.skip-link` em `index.css:55-70`; destino `main` com `id="conteudo"` e `tabIndex={-1}` (`LandingPage.tsx:31`). |
| 6 | Foco visível (inclusive navy) | **Passa** | Foco global `:focus-visible` azul em `index.css:42-45`; componentes navy usam `focus-visible:outline-white` (`LandingFooter.tsx:24,41,58,87`, `Button.tsx:16-17` variantes `onDark/onDarkOutline`). |
| 7 | Menu: `aria-expanded`/`aria-controls`, Escape e foco | **Passa** | `LandingHeader.tsx:75-85` (`aria-expanded`, `aria-controls="menu-landing"`, label dinâmico); painel `id="menu-landing"` `:90-94`; Escape fecha e devolve foco ao botão `:21-29`; ao abrir foca primeiro link `:17-19`; links fecham menu `:102` e o CTA fecha via `requestLogin` `:31-34,111-113`. Disclosure não modal (sem focus trap) conforme design. |
| 8 | Ícones decorativos `aria-hidden` | **Passa** | `LandingIcon.tsx:99-104` (`aria-hidden`, `focusable="false"`); `Wordmark.tsx:41-44`; decorações visuais em seções marcadas `aria-hidden` (ex.: `HeroSection.tsx:36-50`, `ProblemSection.tsx:12-17,38-41,66-69`, `SolutionSection.tsx:16,19`, `ProfilesSection.tsx` conectores/nós, `WorkflowSection.tsx:17-24`, `DevelopmentSection.tsx:11-16,30`, `TechnologySection.tsx:25-31`). |
| 9 | Nenhum foco dentro do mock do produto | **Passa** | `ProductPreview.tsx:13-14` usa `<figure role="img" aria-label={A11Y.previewAria}>` e interior em `div aria-hidden="true"`; sem botões/links/inputs dentro do mock. |
| 10 | Links externos com `rel="noopener noreferrer"` e aviso de nova aba | **Passa** | GitHub/Issues em `ContactSection.tsx:32-34,48-50` e `LandingFooter.tsx:38-40,54-56` com `target="_blank" rel="noopener noreferrer"` e `sr-only` com `A11Y.newTabNote` (`"(abre em nova aba)"`). `ISSUES_URL` é `null` (`content.ts:41`) → link de Issues não renderiza. |
| 11 | Nenhum `tabIndex` positivo | **Passa** | Único `tabIndex` encontrado: `tabIndex={-1}` no `main` para alvo do skip link (`LandingPage.tsx:31`) — aceitável e não positivo. |
| 12 | Links e âncoras: `href` com destino real; ids existentes | **Passa** | Nav/header/footer usam `#inicio,#sobre,#funcionalidades,#para-quem,#desenvolvimento,#contato` (`content.ts:95-102`) e seções existem (`HeroSection.tsx:31`, `ProblemSection.tsx:7`, `FeaturesSection.tsx:7`, `ProfilesSection.tsx:70`, `DevelopmentSection.tsx:8`, `ContactSection.tsx:8`); âncoras internas adicionais `#solucao,#como-funciona,#gamificacao,#tecnologia,#estado-atual` presentes (`SolutionSection.tsx:6`, `WorkflowSection.tsx:6`, `GamificationSection.tsx:23`, `TechnologySection.tsx:6`, `ProjectStatusSection.tsx:7`); CTA hero aponta para `#sobre` (`content.ts:110`). |
| 13 | `CONTACT_CHANNELS` vazio mostra fallback | **Passa** | `CONTACT_CHANNELS: []` em `content.ts:44` e fallback renderizado em `ContactSection.tsx:25-27` com texto de `CONTACT.fallback`. |
| 14 | Nenhum botão que simula ação inexistente | **Passa** | O CTA único de acesso chama `onRequestLogin` (abre login existente) em header/hero (`LandingHeader.tsx:64-74,111-113`, `HeroSection.tsx:68`); navegação por âncoras/links reais; sem formulários fake. |
| 15 | Conteúdo/fidelidade: sem inventar estatística, usuário, depoimento, data, contato, prêmio, credencial, SIGA, URL pública | **Passa** | Textos centralizados em `content.ts` seguem `CONTENT.md`/spec: origem por observação (sem pesquisa estatística), estado atual separa implementado × evolução, transparência sem implantação/URL pública/SIGA, sem métricas/nomes/depoimentos/prêmios/contatos extras; mock rotulado “Exemplo/Demonstração visual” (`HeroSection.tsx:68`, `ProductPreview.tsx:78`). |
| 16 | Edição de perfil listada como implementada | **Passa** | `content.ts` descreve “editar nome, foto e senha do próprio perfil” nos perfis de aluno, professor/gestão e funcionário, além do estado atual, em linha com `CONTENT.md` §11/§17. |
| 17 | Sem placeholders/TODO/lorem/emojis em pt-BR | **Passa** | Busca estática sem ocorrências de TODO/placeholder/lorem; conteúdo em pt-BR com acentuação correta nos arquivos-fonte; ícones são SVG (`LandingIcon.tsx`). Corrigido: `GamificationSection.tsx` não usa mais `levelLabel` (rótulo com emoji) nem `🔥`; strings migradas para `GAMIFICATION` em `content.ts` (`levelsAriaLabel`, `levelNames`, `levelNamePrefix`, `missingPointsForLevel`, `progressGoalLabel`, `rewardsTitle`), consumidas em `GamificationSection.tsx:24-29,39,98`. Busca em `components/landing/*` sem `levelLabel` e sem emojis editoriais. |
| 18 | Responsividade 320px (verificada em runtime) | **Passa** | Mitigações presentes: container `max-w-[1200px] px-5` (`Section.tsx:37`), `min-w-0`/`overflow-hidden` no mock (`ProductPreview.tsx:13-15`), CTAs `w-full sm:w-auto`/`min-h-12` (`HeroSection.tsx:61-67`), header adapta rótulo (“Entrar” em mobile, `LandingHeader.tsx:64-74`) e menu replica o CTA (`:111-113`), grids com fallback. **Medições `agent-browser` (2026-11-17):** 320×800 → `scrollWidth = 320 = innerWidth` (sem overflow); 768×900 → `768 = 768`; 1440×900 → `1440 = 1440`. Overflow prévio de 320px (`scrollWidth = 422`) corrigido em `ContactSection.tsx:9,25,35,37,51,53,69,71` (`min-w-0` + `break-words`); detalhe na §3/§4. |
| 19 | SEO/metadados: título, description, theme-color, favicon, OG coerentes; sem og:image/og:url/canonical falsos | **Passa** | `index.html:6-20` define `lang="pt-BR"`, título, description (~150 chars), `theme-color="#0d2d6b"`, favicon `/favicon.svg` (existe em `public/favicon.svg`), OG `type/locale/site_name/title/description` coerentes; **não** define `og:image`, `og:url` nem `canonical` (correto, sem inventar). |
| 20 | Integração: landing só sem sessão; CTAs abrem login existente; `onBack` retorna; logout volta à landing; sem API/`useUser` na landing | **Passa** | `App.tsx:34-39` carrega sessão; `:54-71` mostra landing/login só quando `session === null`; `:65-67` `LandingPage` recebe `onRequestLogin`; `:61-67` `LoginPage` recebe `onBack` para `landing`; `:73-76` logout seta `session=null` e `publicView="landing"`; providers de usuário/notificações só no autenticado `:78-84`. Landing e componentes não importam `api`/`useUser` (verificado por inspeção). |

## 3. Falhas priorizadas

Nenhuma falha **P0** permanece aberta; o **P1** de overflow horizontal em 320px encontrado na verificação em runtime foi corrigido e verificado.

| Prioridade | Achado | Passos para reproduzir | Esperado | Real | Evidência | Status |
|---|---|---|---|---|---|---|
| P1 | **Overflow horizontal em 320px quebrava o layout da landing** | 1. Abrir `http://localhost:5173/` com viewport 320×800 (`agent-browser`, Chrome headless). 2. Medir `document.documentElement.scrollWidth` × `window.innerWidth`. 3. Inspecionar a seção de contato. | `scrollWidth == innerWidth == 320` em todos os viewports (320/768/1440), sem rolagem horizontal. | **Antes:** `scrollWidth = 422` em 320px — URL longa do GitHub como token sem quebra em `ContactSection` + itens de grid/flex com `min-width: auto` (elemento `div.lg:col-span-6` media 402px). **Depois:** 320/768/1440 sem overflow. | `agent-browser` 2026-11-17 (320×800): `scrollWidth = 320`, `innerWidth = 320`, `scrollWidth==innerWidth = true`; correção em `ContactSection.tsx:9,25,35,37,51,53,69,71` | **Corrigido e verificado** |
| P2 | **Acessibilidade depende de contraste real em tema escuro e sobre navy** | 1. Ativar dark mode (preferência persistida). 2. Revisar textos secundários (`text-blue-100/200`, `text-slate-400/500`) sobre fundos navy/tinta/papel escuro. 3. Medir contraste WCAG AA. | Texto normal ≥ 4.5:1 (grande ≥ 3:1) em todos os pares usados. | Paleta e pares foram definidos no design (`DESIGN.md` §2.1) e classes seguem o sistema, mas **contraste efetivo (WCAG AA) não medido por ferramenta**. | `index.css:19-27,42-45`, `HeroSection.tsx:31-69`, `ProfilesSection.tsx:70-119`, `ContactSection.tsx:8-27`, `LandingFooter.tsx:8-79` | **Em aberto** (medição recomendada) |

## 4. Correções aplicadas

1. **Overflow horizontal em 320px (P1):** em `app/client/src/components/landing/ContactSection.tsx`, adicionado `min-w-0` aos dois filhos do grid (`:9`, `:25`) e ao `span` de texto dos links (`:35`, `:51`, `:69`), e `break-words` nas URLs exibidas (`:37`, `:53`, `:71`). Resultado: a URL longa do GitHub deixa de forçar largura mínima de 402px; `scrollWidth == innerWidth` em 320/768/1440.
2. **Emojis / centralização de strings (item 17):** `GamificationSection.tsx` deixou de usar `levelLabel` (rótulo com emoji) e `🔥`; os rótulos migraram para `GAMIFICATION` em `content.ts` (`levelsAriaLabel`, `levelNames`, `levelNamePrefix`, `missingPointsForLevel`, `progressGoalLabel`, `rewardsTitle`), consumidos em `GamificationSection.tsx:24-29,39,98`. Busca em `components/landing/*` sem `levelLabel` e sem emojis editoriais.
3. **CTA duplicado removido:** `LandingHeader.tsx` e `content.ts` deixaram de exibir “Fazer login”; header e menu mobile agora têm apenas “Entrar na conta”. `LandingPage.test.tsx` cobre a unicidade do CTA, o callback `onRequestLogin` e o fechamento do menu.

## 5. Pendências

1. **Medição objetiva de contraste** (WCAG AA) nos modos claro/escuro e superfícies navy, com ferramenta de acessibilidade — única falha P2 em aberto (§3).
2. **Verificação de navegação por teclado completa** em ambiente interativo (ordem de tab, foco ao abrir/fechar menu em diferentes viewports, skip link em navegador real) — parcialmente coberta por testes existentes, mas validação manual recomendada.
3. **Assets/SEO futuros dependem de decisão de produto:** não há `og:image`, `og:url`, `canonical` nem link de Issues (`ISSUES_URL` nulo) — intencional e fiel à transparência documentada; revisar quando houver URL pública/Issues habilitadas.

## 6. Status final por fluxo (landing)

| Fluxo | Status | Observação |
|---|---|---|
| Descoberta pública da landing (sem sessão) | **Aprovado** | Renderização condicionada a `session === null` em `App.tsx`. |
| Navegação por seções/âncoras e skip link | **Aprovado** | Âncoras, landmarks, headings e skip link presentes e consistentes. |
| Acesso ao login existente (CTA header/hero/menu) | **Aprovado** | Callback `onRequestLogin` → `LoginPage` existente, sem API/cadastro novo e sem CTA duplicado. |
| Retorno da tela de login para a landing | **Aprovado** | `onBack` retorna para `publicView="landing"` (`App.tsx:64`, `LoginPage.tsx:14,52-59`). |
| Contato/links externos | **Aprovado com ressalvas** | GitHub com `rel` e aviso de nova aba; Issues/canais adicionais corretamente omitidos quando não confirmados. |
| Responsividade e a11y visual fina | **Aprovado com ressalva de contraste** | Overflow verificado em runtime em 320×800, 768×900 e 1440×900 (`scrollWidth == innerWidth`; 1 `h1`, 11 `h2`, 11 seções em `<main>`); ressalva restrita à medição de contraste WCAG AA, não feita por ferramenta. |
