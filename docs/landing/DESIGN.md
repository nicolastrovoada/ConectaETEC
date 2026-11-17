# Design Brief — Landing page institucional do Conecta ETEC

**Arquivo:** `docs/landing/DESIGN.md`
**Papel:** especificação de UI/UX para implementação (este documento não é código de produção)
**Base:** `Arquivos_fonte/landing-spec.txt` (§5.1–5.13, §6), `Arquivos_fonte/BRIEFING.md`, `README.md`, `app/client/src/index.css`, `app/client/src/lib/theme.ts`, `app/client/src/pages/LoginPage.tsx`, `app/client/src/App.tsx`, `app/client/src/components/ui/*`, `app/client/src/components/Layout.tsx`, `app/client/index.html`
**Público:** `web-frontend` (implementação), `web-qa` (verificação), `web-lead` (escopo)

> Este documento **define** a interface; a implementação React fica a cargo de `web-frontend`.
> Toda a UI em pt-BR. Nenhuma estatística, usuário, depoimento, data, prêmio ou canal de contato deve ser inventado.
> **Copy final:** `docs/landing/CONTENT.md` é a fonte editorial (textos literais por seção). Quando este brief resumir um texto, **prevalece o CONTENT.md**. Este documento define composição, hierarquia, tokens, estados e critérios visuais.

---

## 0. Resumo executivo

- A landing é uma **view pública** renderizada quando `session === null` e o visitante ainda não pediu login. Não há rota nova: a alternância é por estado no `App.tsx`.
- Identidade preservada: azul `#1a4fa0` + navy `#0d2d6b`, Nunito (títulos) e Inter (corpo), gradientes por papel já existentes em `ROLE_THEME`.
- Conceito visual: **“caderno + rede”** — malha de pontos discreta (caderno escolar) e trilhas com nós (conexão entre pessoas). Sem bibliotecas de ícones, sem imagens de `/uploads`.
- Ritmo: hero navy (único momento de impacto), alternância entre papel, tinta clara e dois blocos navy (Perfis e Contato), fechando no rodapé tinta.
- Dois CTAs de acesso no topo, ambos abrindo o login existente; nenhuma credencial de teste é exibida.

---

## 1. Direção visual

### 1.1 Personalidade

| Atributo | Como aparece | Como NÃO aparece |
|---|---|---|
| **Educação** | malha tipo caderno, linguagem simples, hierarquia editorial | ícones infantis, bege “papel envelhecido”, ilustrações fofas |
| **Tecnologia** | linhas de 1px, nós de 2–8px, painéis que imitam a interface real | neon “cyber”, código decorativo, terminal falso |
| **Organização** | grid de 12 colunas, alinhamento à esquerda, muito espaço em branco | mosaico sem hierarquia, blocos longos centralizados |
| **Conexão** | trilhas com nós ligando etapas, perfis e marcos | linhas curvas decorativas aleatórias |
| **Evolução** | progressão visível (níveis, etapas numeradas) | promessas de resultado, números de crescimento |
| **Reconhecimento** | pontos, níveis e bônus apresentados como mecanismo | ranking inventado, prêmios, medalhas genéricas |

**Tom de voz:** direto, afirmativo, sem marketing agressivo. Frases curtas. Verbo no presente para o que existe (“O professor publica”); “previsto”/“em evolução” para o que não existe.

### 1.2 Conceito: “caderno + rede”

Dois materiais da vida escolar e da computação se encontram:

- **Caderno** → malha de pontos muito discreta no fundo. Não é textura decorativa: dá coordenada ao layout e alinha títulos.
- **Rede** → a **trilha**: linha de 1px com nós de 2–8px. Liga etapas de um processo, liga os quatro perfis ao redor da plataforma e marca marcos de evolução.

A trilha é o dispositivo estrutural do site. Só aparece onde existe **relação real** (processo, conexão entre perfis, progressão). Nunca como enfeite.

### 1.3 Princípios

1. **Uma ousadia por página.** O hero navy é o único bloco de forte contraste no topo. O resto é disciplinado: borda antes de sombra, cor sólida antes de gradiente.
2. **Estrutura é informação.** Números só em sequências reais (“Como funciona” 1–6, “Desenvolvimento” 1–6). Perfis e funcionalidades não recebem numeração.
3. **Menos cards, mais composição.** Cada seção tem forma própria (lista editorial, fluxo, hub, trilha, camadas, comparação). Cards só quando o conteúdo é de fato uma coleção de itens equivalentes.
4. **Prova visual, não estatística.** Representar o produto com trechos fiéis da interface real, sempre rotulados como demonstração.
5. **Silêncio tipográfico.** Sem etiqueta em caixa alta acima de cada título, sem “— fragmento” em todo lugar, sem seta “→” em todos os botões.
6. **Acessível por padrão.** Contraste, foco visível, teclado e movimento reduzido fazem parte do desenho.

### 1.4 O que evitar (explícito)

- Landing genérica de SaaS: hero centralizado + dois botões + três cards de features + depoimentos + logos de clientes (não há clientes, depoimentos nem logos).
- Gradiente em tudo (cards, títulos, bordas, fundos). **Máximo 3 tipos de gradiente**, listados em §2.2.
- Cards idênticos repetidos 4, 6 ou 12 vezes com o mesmo raio, sombra e ícone.
- Excesso de emoji. A landing usa **ícones SVG inline** (traço 1,75px). Emojis são exceção, nunca padrão.
- “Números de impacto” (alunos, escolas, %), selos de nota, medalhas genéricas, prints com dados falsos apresentados como reais.
- Header transparente sobre o hero com troca de cor no scroll (frágil em contraste e em dark mode). O header é sólido desde o início (§4).
- Scroll horizontal, animações que escondem conteúdo, hover como único caminho de interação.

### 1.5 Onde gastar a ousadia

Um único gesto: **hero navy com malha, anéis geométricos e o painel do produto**, com entrada orquestrada de uma vez (texto → painel). Fora disso, a página é contida. Não adicionar “mais um efeito” por seção.

---

## 2. Sistema visual

### 2.1 Paleta com papéis

Tokens existentes em `index.css` (`@theme`) são a base. Os três novos são aditivos, com prefixo `etec-`, e não alteram nenhum token atual.

| Papel | Token / classe | Hex | Uso |
|---|---|---|---|
| Primária | `--color-etec-blue` / `text-[#1a4fa0]` | `#1a4fa0` | links, foco, marcadores, nós ativos, CTA |
| Profundidade | `--color-etec-navy` / `bg-[#0d2d6b]` | `#0d2d6b` | hero, seções de contraste |
| Tinta profunda | **novo** `--color-etec-ink` | `#081c3d` | base mais escura do hero, rodapé |
| Papel | **novo** `--color-etec-paper` | `#fbfcfe` | fundo base das seções claras |
| Tinta clara | **novo** `--color-etec-tint` | `#eef3fa` | seções alternadas |
| Confirmação / funcionário | `--color-etec-green` | `#22c55e` | nó de confirmação, perfil funcionário |
| Destaque / gamificação | `--color-etec-yellow` | `#f59e0b` | bônus, sequência |
| Coordenação | `--color-etec-orange` | `#f97316` | superfície do perfil coordenação |
| Professor | `purple-600` | `#9333ea` | perfil professor |
| Título (claro) | `slate-900` | `#0f172a` | h2/h3 sobre fundo claro |
| Corpo | `slate-600` | `#475569` | parágrafos sobre claro |
| Secundário | `slate-500` | `#64748b` | legendas ≥ 14px |
| Borda | `slate-200` | `#e2e8f0` | bordas de card |
| Borda suave | `#0d2d6b` a 10% | — | hairlines editoriais |
| Bronze | `amber-700` | `#b45309` | nível Bronze |
| Prata | `slate-400` | `#94a3b8` | nível Prata |
| Ouro | `#d4a017` | — | nível Ouro (preenchimento) |
| Diamante | `sky-400` | `#38bdf8` | nível Diamante |

**Contraste — pares aprovados**

| Texto | Fundo | Razão aprox. | Uso |
|---|---|---|---|
| `#ffffff` | `#1a4fa0` | 7,9:1 | CTA primária |
| `#ffffff` | `#0d2d6b` | 13,1:1 | texto sobre navy |
| `#dbeafe` (blue-100) | `#0d2d6b` | ~9:1 | corpo sobre navy |
| `#bfdbfe` (blue-200) | `#0d2d6b` | ~9,2:1 | texto secundário sobre navy (≥ 14px) |
| `#475569` (slate-600) | `#fbfcfe` | ~7,5:1 | corpo sobre papel |
| `#0d2d6b` | `#eef3fa` | ~12:1 | títulos sobre tinta clara |
| `#9a3412` (orange-800) | `#ffedd5` | ~6,3:1 | chip coordenação |
| `#c2410c` (orange-700) | `#ffffff` | ~4,8:1 | só texto ≥ 18px semibold |

**Proibições de cor:** texto laranja/roxo/verde abaixo de 18px sobre branco; texto `slate-400` sobre branco; texto branco sobre `#f97316`/`#f59e0b` em tamanho normal. Cores de perfil vão em **superfície** (barra, chip, nó), não na cor do texto.

### 2.2 Gradientes permitidos (somente estes)

1. **Fundo do hero:** `linear-gradient(160deg, #0d2d6b 0%, #0a2452 55%, #081c3d 100%)` + `radial-gradient` azul `#1a4fa0` a 28% no canto superior direito.
2. **Acento de perfil:** `ROLE_THEME[role].avatar` (`from-blue-500 to-blue-700`, `from-purple-500 to-purple-700`, `from-green-500 to-green-700`, `from-orange-500 to-red-600`) — barra superior, chip de ícone e avatar do mock.
3. **Progresso:** `bg-gradient-to-r from-blue-600 to-blue-500` em barras de nível (mecanismo real, nunca para enfeitar card).

Nada de gradiente em texto, em borda, em fundo de seção clara ou em botão.

### 2.3 Tipografia

Fontes já carregadas em `index.css` — **não reimportar**. `index.css` já aplica Nunito a `h1–h4`; portanto **não repetir `fontFamily` inline em headings**. Usar inline só em marca, números e CTAs fora de heading.

| Nível | Fonte | Classe Tailwind | Tamanho | Uso |
|---|---|---|---|---|
| h1 (hero) | Nunito 900 | `text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] tracking-[-0.02em]` | 36 → 64px | único h1 da página |
| h2 (seção) | Nunito 900 | `text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.12] tracking-[-0.015em]` | 28 → 40px | um por seção |
| h3 (card) | Nunito 800 | `text-lg md:text-xl leading-snug` | 18 → 20px | títulos de card/etapa |
| h4 (sub) | Nunito 800 | `text-base leading-snug` | 16px | subgrupos, colunas do rodapé |
| Lead | Inter 400 | `text-base md:text-lg leading-relaxed` | 16 → 18px | subtítulo da seção, máx. 2 linhas |
| Corpo | Inter 400 | `text-[15px] md:text-base leading-[1.7]` | 15 → 16px | parágrafos |
| Pequeno | Inter 400/500 | `text-sm leading-relaxed` | 14px | listas, legendas de card |
| Micro | Inter 600 | `text-xs` | 12px | chips, notas ilustrativas, rodapé |

**Regras**

- Medida de linha: **máx. 68ch** para corpo (`max-w-[68ch]`), 20–24 palavras por linha.
- Nunca centralizar parágrafo com mais de 2 linhas.
- Peso 900 reservado a h1/h2 e à marca; não usar `font-black` em corpo.
- Slogan **“Conectando o futuro.”**: Nunito 800, `text-sm md:text-base`, precedido de hairline de 24px + nó de 4px. Nunca em caixa alta.
- Sem itálico, sem caixa alta em labels, sem letter-spacing largo decorativo.

### 2.4 Espaçamento e ritmo

Escala base 4px (Tailwind).

| Contexto | Classe | px |
|---|---|---|
| Padding vertical de seção | `py-16 md:py-24 lg:py-28` | 64 / 96 / 112 |
| Hero | `pt-14 pb-16 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28` | — |
| Título → lead | `mt-4 md:mt-5` | 16 / 20 |
| Lead → conteúdo | `mt-10 md:mt-14` | 40 / 56 |
| Entre cards do mesmo grupo | `gap-5 md:gap-6` | 20 / 24 |
| Dentro do card | `p-6 lg:p-7` (grande) · `p-5` (compacto) | 24–28 |
| Entre blocos de texto | `space-y-4` | 16 |
| Ícone → título do card | `mb-4` | 16 |
| Rodapé | `pt-14 pb-8 md:pt-16` | — |

Ritmo narrativo das superfícies: **navy → papel → tinta clara → branco → navy → papel → tinta clara → branco → navy → papel → navy → tinta**. Duas seções claras consecutivas só se a segunda tiver forma visual distinta (ver §5).

### 2.5 Container e grid

- Container único: `mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8`.
- Grid desktop de 12 colunas / `gap-6`; tablet 8; mobile 4.
- Hero: texto nas colunas 1–6 e visual nas 7–12. Em `lg` o visual pode avançar 24px (`lg:-mr-6`) sem gerar scroll horizontal.
- Seções de conteúdo: título em ~7 colunas, lead em ~6; conteúdo alinhado à esquerda abaixo.
- Seções de largura total (Perfis, Contato) usam o mesmo container; apenas o **fundo** é full-bleed.

### 2.6 Raios, bordas, sombras

| Elemento | Raio | Borda | Sombra |
|---|---|---|---|
| Botão, chip de navegação | `rounded-xl` (12) | `border-slate-200` | nenhuma |
| Badge/etiqueta | `rounded-full` | — | — |
| Card de conteúdo | `rounded-2xl` (16) | `border-slate-200/80` (ou `white/10` em navy) | nenhuma |
| Painel do produto / moldura grande | `rounded-[28px]` | `border-[#0d2d6b]/10` | única sombra pesada |
| Header | — | `border-b border-slate-200` | `0 1px 0 rgba(13,45,107,.04)` |
| Card do Contato | `rounded-2xl` | `border-white/15` | nenhuma |

Sombras (apenas duas):

```
--landing-shadow-frame: 0 2px 4px rgba(13,45,107,.05), 0 28px 60px -28px rgba(13,45,107,.45);
--landing-shadow-float: 0 1px 2px rgba(13,45,107,.06), 0 12px 28px -20px rgba(13,45,107,.35);
```

Regra: **card não tem sombra**. Sombra indica “isto flutua sobre a página” (painel do hero). Hover em card só muda a borda (`hover:border-[#1a4fa0]/30`), nunca levanta o card.

### 2.7 Padrões gráficos

**Malha (fundo)**

- Pontos a cada 24px, diâmetro 1px, cor `var(--landing-grid-color)`.
- `:root { --landing-grid-color: rgba(13,45,107,.07) }` · `.dark { --landing-grid-color: rgba(148,163,184,.14) }`
- Aplicar só em: hero (sobre navy, branco a 6%), Problema (papel) e Desenvolvimento (tinta clara).
- Implementação: `style={{ backgroundImage: "radial-gradient(circle, var(--landing-grid-color) 1px, transparent 1px)", backgroundSize: "24px 24px" }}` em container `pointer-events-none aria-hidden`, como já é feito na `LoginPage` (linhas 40–47).

**Trilha (linha + nó)**

| Elemento | Classe |
|---|---|
| Linha horizontal | `h-px bg-[#0d2d6b]/15 dark:bg-white/15` |
| Linha vertical | `w-px bg-[#0d2d6b]/15 dark:bg-white/15` |
| Nó passivo | `w-2 h-2 rounded-full bg-[#1a4fa0] ring-4 ring-white dark:ring-slate-950` |
| Nó em destaque | `w-2.5 h-2.5 rounded-full bg-[#1a4fa0] ring-4 ring-[#1a4fa0]/15` |
| Nó numerado | `w-8 h-8 rounded-full bg-white border border-[#0d2d6b]/15 text-xs font-extrabold text-[#0d2d6b]` |

Sequências usam nó numerado; conexões (perfis) usam nó simples. Nunca numerar o que não é sequência.

**Anéis geométricos (só no hero):** dois `div` absolutos `rounded-full border border-white/10` (560px e 380px), `aria-hidden`. Nada de “bolhas” coloridas.

### 2.8 Estados e foco

- Foco global já definido em `index.css` (`outline: 2px solid var(--color-etec-blue); outline-offset: 2px`). Em superfícies navy: `focus-visible:outline-white`.
- Nunca remover `outline` sem substituto.
- Hover em link: sublinhado `decoration-2 underline-offset-4` + `#0d2d6b`.
- Hover em botão: apenas `hover:bg-…` já existente. **Sem** `scale`, **sem** `translateY` em cards.
- `disabled` não se aplica à landing (nenhum controle assíncrono).
- Loading/erro/vazio: não existem estados de dados na landing (conteúdo estático). O loading da aplicação continua sendo o `Spinner` do `App.tsx` durante `session === "loading"`.

### 2.9 Dark mode

O `.dark` é aplicado por classe no `<html>` (`PreferencesContext`) e **permanece após o logout**. A landing precisa ser legível nos dois modos.

| Superfície | Claro | Escuro |
|---|---|---|
| Papel | `bg-[#fbfcfe]` | `dark:bg-slate-950` |
| Tinta clara | `bg-[#eef3fa]` | `dark:bg-slate-900` |
| Card | `bg-white` | `dark:bg-slate-900` (em tint: `dark:bg-slate-900` + `dark:border-slate-700/60`) |
| Navy | `bg-[#0d2d6b]` | `dark:bg-[#081c3d]` |
| Texto corpo | `text-slate-600` | `dark:text-slate-300` |
| Título | `text-slate-900` | `dark:text-white` |
| Borda | `border-slate-200` | `dark:border-slate-800` |

Não adicionar botão de tema na landing (o toggle existe apenas no `Layout` autenticado). Apenas garantir contraste nos dois modos.

---

## 3. Breakpoints e reorganização

| Faixa | Largura | Comportamento |
|---|---|---|
| `base` | 320–639 | 1 coluna; menu compacto; CTAs do header em versão curta; mock empilhado; trilhas verticais |
| `sm` | 640–767 | 1 coluna com mais respiro; rótulos completos nos CTAs; 2 colunas só em listas curtas |
| `md` | 768–1023 | 2 colunas em funcionalidades/estado; header ainda com menu; hero com painel único central |
| `lg` | 1024–1279 | layout de 2 colunas; nav completa; perfis em 4 colunas; fluxo horizontal |
| `xl` | ≥ 1280 | container 1200; nada “estica” além disso |

Regras duras:

- Em 320px **não há scroll horizontal**: mock com `min-w-0 overflow-hidden`; nenhum elemento com largura fixa maior que `100%`; `figure` sempre `max-w-full`.
- CTAs de acesso permanecem visíveis e clicáveis em 320px (§4.3).
- Diagramas mudam de forma (vertical → horizontal), não apenas de escala.
- Texto não desce abaixo de 14px (12px só em chips/notas).

---

## 4. Header

### 4.1 Estrutura

```
<header> sticky top-0 z-50
  <div> container · h-16 lg:h-[72px] · flex items-center gap-4
    <a href="#inicio"> Wordmark </a>            ← foco visível
    <nav aria-label="Navegação principal">     ← hidden lg:flex
      6 links (≥ 44px de altura)
    </nav>
    <div class="ml-auto flex items-center gap-2">
      [Fazer login]      ← Button secondary (com borda)
      [Entrar na conta]  ← Button primary (azul)
      [Menu]             ← lg:hidden · aria-expanded
    </div>
  </div>
  <div id="menu-landing">                        ← painel mobile (disclosure)
</header>
```

- Fundo **sempre sólido**: `bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800`.
- Altura 64px no mobile e 72px em `lg`. O header **não** sobrepõe o hero (o hero começa abaixo).
- Ordem dos botões: secundário à esquerda, primário à direita (primário mais próximo da borda).
- Nav: `text-sm font-semibold text-slate-600 hover:text-[#1a4fa0]`. `aria-current` (scrollspy) é P2 e não bloqueia a entrega.
- Wordmark em §7.2: “Conecta” navy + “ETEC” azul; em dark, “Conecta” branco + “ETEC” `blue-300`.

### 4.2 Sticky e âncoras

- `scroll-margin-top` nas seções: `scroll-mt-[80px] lg:scroll-mt-[88px]`.
- `html { scroll-behavior: smooth }` já existe em `index.css` e já é desativado em `prefers-reduced-motion` — não reimplementar.
- O header **não** muda de altura, cor ou sombra durante o scroll (sem listener).
- O wordmark leva a `#inicio`.

### 4.3 Header no mobile (a partir de 320px)

Os dois acessos continuam no topo; o menu compacto é adicional, não substituto.

| Elemento | 320–399 | 400–639 | ≥ 640 |
|---|---|---|---|
| Marca | só o símbolo (28px) | símbolo + “ConectaETEC” | símbolo + texto |
| “Fazer login” | `text-xs px-2.5 min-h-10` | idem | `text-sm px-4 py-2.5` |
| “Entrar na conta” | rótulo “Entrar” + `aria-label="Entrar na conta"` | “Entrar” | rótulo completo |
| Menu | botão 40×40 com ícone `menu`/`close` | idem | oculto |

Cálculo para 320px: 28 (marca) + 8 + 86 (“Fazer login”) + 8 + 62 (“Entrar”) + 8 + 40 (menu) + 40 (padding) ≈ 280px → cabe.

### 4.4 Menu mobile

- Painel **não modal** (disclosure): `absolute left-0 right-0 top-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-[var(--landing-shadow-float)] max-h-[calc(100dvh-4rem)] overflow-y-auto`.
- Conteúdo: os 6 links (cada um `py-3.5` → ≥ 44px, `text-base font-semibold`), separador `border-t`, e então **as duas CTAs em largura total** (primária primeiro). Isso garante o acesso mesmo se o header ficar apertado.
- Interação: `aria-expanded` + `aria-controls="menu-landing"`; ao abrir, foco no primeiro link; `Escape` fecha e devolve o foco ao botão; clicar em link ou CTA fecha; **sem focus trap** (não é modal), mas o painel vem imediatamente após o botão no DOM.
- Sem backdrop preto: o painel não cobre o conteúdo.
- Ambos os botões do painel chamam `onRequestLogin`.

---

## 5. Seções (ordem e composição)

Menu e âncoras:

> A numeração interna deste documento difere da spec porque o Header é tratado no §4. Cada seção indica a referência correspondente (`spec §5.x`).

| Menu | Âncora | Seção | Spec |
|---|---|---|---|
| Início | `#inicio` | Hero (5.1) | §5.2 |
| Sobre o projeto | `#sobre` | Problema (5.2) | §5.3 |
| Funcionalidades | `#funcionalidades` | Funcionalidades (5.5) | §5.5 |
| Para quem | `#para-quem` | Perfis (5.6) | §5.6 |
| Desenvolvimento | `#desenvolvimento` | Trajetória (5.9) | §5.9 |
| Contato | `#contato` | Contato (5.12) | §5.12 |

`#solucao`, `#como-funciona`, `#gamificacao`, `#tecnologia` e `#estado-atual` existem como âncoras para links internos, mas não ocupam o menu (evita menu de 11 itens). Os `id`s seguem o mapa de `CONTENT.md` (“Mapa de seções e âncoras”).

---

### 5.1 HERO — `#inicio` · fundo navy (spec §5.2)

**Objetivo:** em 5 segundos, responder “o que é” e “para quem”, e provar que é um produto estruturado.

**Desktop (`lg`) — 12 colunas**

Esquerda (cols 1–6):
1. Sobretítulo `text-xs font-semibold tracking-wide text-blue-200`: “Projeto acadêmico — ETEC Cravinhos”.
2. `Wordmark tone="light" size="lg"` (símbolo 36px + texto 22px).
3. Slogan com hairline + nó (§2.3), `text-blue-200`.
4. `h1` branco: **“Uma escola mais conectada começa com a participação de todos.”** — sem destacar palavra em outra cor.
5. Lead `text-blue-100 max-w-[46ch]`: “O Conecta ETEC é uma plataforma que aproxima estudantes, professores, funcionários e coordenação, organizando atividades, estudos e reconhecimento em um único ambiente digital.”
6. CTAs: `Conhecer a plataforma` (`LinkButton variant="onDark"` → `#sobre`) e `Entrar na conta` (`Button variant="onDarkOutline"` → `onRequestLogin`). Primário = branco preenchido; secundário = contorno branco.
7. Microcopy abaixo dos CTAs (`text-xs text-blue-200 max-w-[48ch]`): “Projeto acadêmico em desenvolvimento. O acesso é feito com a conta criada pela coordenação da escola. Não há cadastro público.”

Direita (cols 7–12): `ProductPreview` (§6) deslocado 16px para baixo, com anel geométrico atrás e legenda visível abaixo: **“Demonstração visual. Interface ilustrativa, sem dados reais.”**

Fundo: gradiente do §2.2 + malha branca a 6% + dois anéis `border-white/10`.

**Tablet (`md`):** texto em cima, alinhamento à esquerda (não centralizar); painel único abaixo, `max-w-[560px] mx-auto`; anel reduzido (360px).

**Mobile:** coluna única; símbolo + slogan; h1 36–40px; lead 16px; CTAs empilhados `w-full` com 48px de altura (ordem: “Conhecer a plataforma”, “Entrar na conta”); painel abaixo sem sobreposição; legenda em 12px.

```
DESKTOP
┌────────────────────────────────────────────────────────────────────┐
│ ◯ ConectaETEC                    Início Sobre ... [Fazer login][Entrar] │
├────────────────────────────────────────────────────────────────────┤
│ · · · · malha · · · ·                   ╭──────────────────────╮   │
│ —• Conectando o futuro.                 │ painel “Início”      │   │
│ Uma escola mais conectada               │ saldo + nível        │   │
│ começa com a participação               │ atividade            │   │
│ de todos.                               ╰──────────────────────╯   │
│                                         ╭──────────────────────╮   │
│ O Conecta ETEC é uma plataforma…        │ painel “Validação”   │   │
│ [Conhecer a plataforma] [Entrar na conta]╰─────────────────────╯   │
│ Projeto acadêmico · ETEC Cravinhos 2026  Demonstração visual        │
└────────────────────────────────────────────────────────────────────┘
```

**Conteúdo:** real (nome, slogan, origem acadêmica, descrição). Ilustrativo: apenas o interior do painel (§6), rotulado.

---

### 5.2 PROBLEMA — `#sobre` · fundo papel + malha (spec §5.3)

**Objetivo:** explicar a origem real, sem alegar pesquisa estatística, e fechar com a pergunta que conduz à solução.

**Título (h2):** “Tudo começou com uma necessidade real.”
**Lead:** “O projeto nasceu da vivência escolar de estudantes do Curso Técnico em Administração da ETEC Cravinhos, ao observar tarefas que já aconteciam na escola, mas não estavam integradas em um único ambiente.”

**Composição (não usar 4 cards iguais):** duas colunas assimétricas.

- **Esquerda (cols 1–4, `lg:sticky lg:top-28`)**: h2 + lead + hairline. Abaixo, nota honesta: “Observação do cotidiano escolar — não é resultado de pesquisa estatística.” (`text-xs text-slate-500`).
- **Direita (cols 5–12)**: **lista editorial** de 4 itens, cada um com:
  - coluna de 40px: ícone SVG 24px em `text-[#1a4fa0]` sobre `bg-[#eef3fa] dark:bg-slate-800` `rounded-xl p-2`;
  - `h3` de 18px;
  - texto de 1–2 linhas `text-sm text-slate-600 dark:text-slate-300`;
  - `border-t border-slate-200/80 dark:border-slate-800` entre itens (sem borda no último).

Itens (textos literais da spec §5.3):

| Título | Texto |
|---|---|
| Informações dispersas | Atividades, prazos e comunicados podem ficar distribuídos em diferentes canais. |
| Falta de constância | Parte dos estudantes encontra dificuldades para manter uma rotina organizada de estudos e participação. |
| Acompanhamento manual | Professores e funcionários precisam acompanhar entregas, conferir atividades e registrar resultados. |
| Pouca visibilidade do progresso | Nem sempre o estudante consegue visualizar de maneira integrada sua participação e evolução. |

**Fecho:** painel `border-l-2 border-[#1a4fa0] bg-white/70 dark:bg-slate-900/60 pl-6 py-5` com a pergunta em Nunito 800, 20–24px:

> “Como a tecnologia poderia ajudar a organizar a rotina escolar e incentivar a participação dos estudantes sem aumentar a carga de trabalho da equipe?”

Abaixo, `32px` de linha vertical + nó apontando para a próxima seção.

---

### 5.3 SOLUÇÃO — `#solucao` · fundo tinta clara (spec §5.4)

**Objetivo:** apresentar o Conecta ETEC como resposta ao problema e mostrar que a plataforma não é só para o aluno.

**Título (h2):** “Uma plataforma. Diferentes possibilidades. Um objetivo em comum.”
**Lead:** “Atividades, entregas, validações, reforço, pontos, recompensas e acompanhamento deixam de viver em canais separados e passam a fazer parte do mesmo ciclo.”

**Composição:**
- Cabeçalho da seção alinhado à esquerda (7 colunas).
- **Fluxo de 5 etapas** em trilha:

```
ATIVIDADE ──●── ENTREGA ──●── VALIDAÇÃO ──●── PONTUAÇÃO ──●── RECOMPENSA
                                                              E ACOMPANHAMENTO
```

| Etapa | Descrição curta |
|---|---|
| Atividade | O professor ou funcionário publica a atividade com prazo, turma e pontuação. |
| Entrega | O estudante realiza a atividade e envia a entrega com evidência. |
| Validação | O responsável aprova, reprova ou solicita correção com feedback. |
| Pontuação | A aprovação registra os pontos e atualiza o saldo do estudante. |
| Recompensa e acompanhamento | O estudante acompanha níveis e recompensas; a equipe acompanha indicadores. |

- **Desktop:** 5 colunas iguais; a linha da trilha passa atrás dos títulos (`absolute top-8`), com um nó de 8px acima de cada card. Cards `bg-white rounded-2xl border p-5`, título `h3` 18px, descrição 14px.
- **Tablet:** 3 + 2 em grid, conectores horizontais desenhados por card (não tentar uma linha única atravessando a quebra).
- **Mobile:** coluna única com **trilha vertical** à esquerda (`w-px`), nós alinhados ao topo de cada card; cards sem sombra.
- **Fecho da seção:** faixa de 1 linha com os quatro perfis em texto (`Aluno · Professor · Funcionário · Coordenação`) em `text-sm text-slate-500`, reforçando que a plataforma não é só do aluno.

**Conteúdo:** real (fluxo do briefing). Sem números e sem ícones de “raio” ou “foguete”.

---

### 5.4 Nota de ritmo entre Solução e Funcionalidades (não é seção da spec)

A seção de Funcionalidades é **branca** e não repete cards do fluxo. Antes do grid, uma linha de contexto em `text-sm text-slate-500`: “Recursos presentes no protótipo funcional. O que ainda está em evolução aparece na seção de estado atual.”

---

### 5.5 FUNCIONALIDADES — `#funcionalidades` · fundo branco (spec §5.5)

**Título (h2):** “Tudo o que a rotina escolar precisa, conectado em um só lugar.”
**Lead:** “Os grupos abaixo reúnem recursos que já fazem parte do protótipo funcional. Itens previstos para as próximas etapas aparecem apenas na seção ‘Um projeto em evolução’.”

**Composição:** grid assimétrico de 6 grupos — **não** 6 cards idênticos.

```
lg:   [ Organização de atividades (span 7) ][ Entregas e validações (span 5) ]
      [ Reforço escolar (span 4) ][ Gamificação (span 4) ][ Recompensas (span 4) ]
      [ Comunicação e acompanhamento (span 12, em linha horizontal) ]
md:   2 colunas (o último grupo ocupa a linha inteira)
base: 1 coluna
```

Cada grupo:
- ícone 24px em `#1a4fa0` (sem caixa colorida — este bloco é sóbrio);
- `h3` 20px;
- **descrição curta** de 1 linha em `text-sm text-slate-500` (ex.: “Planejamento, publicação e acompanhamento das atividades de cada turma.”);
- lista de 4–6 itens com marcador `•` de 4px em `#1a4fa0/60`, texto `text-sm text-slate-600`;
- borda `rounded-2xl border` e `p-6`;
- os grupos largos (7 e 12 colunas) distribuem os itens em **duas colunas internas** para evitar linhas longas.

Conteúdo: usar **literalmente** `CONTENT.md` §5 (título, descrição curta e bullets de cada grupo). Resumo dos seis grupos:

| Grupo | Ênfase |
|---|---|
| Organização de atividades | publicação, prazos, tolerância, lista/calendário, exclusão lógica |
| Entregas e validações | comentário + evidência, até 3 anexos de 5 MB, reenvio, feedback |
| Reforço escolar | lição, questões de verificação, materiais, conclusão única |
| Gamificação | carteira, níveis, sequência com marcos, bônus, histórico |
| Recompensas | catálogo, saldo, resgate com validação, histórico |
| Comunicação e acompanhamento | notificações, avisos, indicadores, relatórios em CSV, auditoria |

**Regra de fidelidade:** não incluir item que não exista no código; não mover bullets entre grupos; não chamar evidência descritiva de “arquivo”. Em caso de dúvida, prevalece `CONTENT.md` §5 (verificado no código) sobre a spec e o README.

---

### 5.6 PERFIS — `#para-quem` · fundo navy (contraste) · spec §5.6

**Objetivo:** mostrar que existem quatro papéis com responsabilidades diferentes, ligados pelo mesmo sistema.

**Título (h2):** “Quatro perfis, uma mesma conexão.”
**Sobretítulo:** “Para quem é o Conecta ETEC?”
**Lead:** “Cada perfil tem um painel próprio, com as ferramentas e as permissões correspondentes ao seu papel na escola.”

**Composição — “hub” de 4 colunas (não 4 cards genéricos):**

```
        ┌────────────── linha de conexão (1px) ──────────────┐
        ●                  ●                   ●             ●
 ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
 │ ALUNO      │   │ PROFESSOR  │   │ FUNCIONÁRIO│   │ COORDENAÇÃO│
 │ aprende e  │   │ publica e  │   │ organiza e │   │ acompanha  │
 │ participa  │   │ valida     │   │ apoia      │   │ e decide   │
 │ [micro UI] │   │ [micro UI] │   │ [micro UI] │   │ [micro UI] │
 │ até 8      │   │ 6 a 8      │   │ 6 a 8      │   │ 6 a 8      │
 └────────────┘   └────────────┘   └────────────┘   └────────────┘
```

- Cada card: `bg-white/5 border border-white/10 rounded-2xl p-6` (não branco: o contraste vem da borda e do texto claro).
- **Barra de acento** de 3px no topo com o gradiente do papel (`ROLE_THEME[role].avatar`).
- Chip de ícone 40×40 com o mesmo gradiente + ícone SVG branco.
- Nome do papel: `h3` 20px em branco; rótulo de responsabilidade em `text-xs font-semibold text-blue-200`.
- Descrição: `text-sm text-blue-100`, 2–3 linhas (textos da spec, literais).
- **Micro-visual distinto por perfil** (a razão de não serem cards genéricos):
  - **Aluno** → barra de progresso de nível (Prata → Ouro) com rótulo “exemplo”;
  - **Professor** → duas linhas de validação com chips “Aprovada” e “Correção solicitada” (sem nomes);
  - **Funcionário** → três linhas de agenda (`Biblioteca`, `Evento`, `Apoio`) com marca de conclusão;
  - **Coordenação** → grade 2×2 de indicadores apenas com rótulos, sem números.
- Lista de possibilidades por perfil (6 a 8 itens, `CONTENT.md` §6), `text-sm text-blue-100`, marcador de 4px na cor do papel; exibir todos os itens — não colapsar com “ver mais”.
- A linha de conexão superior é `bg-white/15`; nós `bg-white` de 6px com `ring-4 ring-[#0d2d6b]`.

**Perfis (descrições literais de `CONTENT.md` §6; a lista completa de itens de cada perfil fica no dossiê, não neste brief):**

| Perfil | Acento | Descrição |
|---|---|---|
| Aluno | azul | O aluno acompanha suas atividades, organiza sua rotina de estudos e visualiza sua evolução dentro da plataforma. |
| Professor | roxo | O professor organiza as atividades de suas turmas, acompanha entregas e oferece suporte ao desenvolvimento dos estudantes. |
| Funcionário | verde | Os funcionários organizam ações escolares e participam do acompanhamento das atividades relacionadas às suas responsabilidades. |
| Coordenação | laranja/vermelho | A coordenação possui uma visão global da plataforma e gerencia os elementos que sustentam a rotina escolar. |

**Frase de conexão (fecho da seção, `text-sm text-blue-100`):** “Os quatro perfis compartilham o mesmo sistema: a atividade criada por um professor ou funcionário chega ao aluno, a validação gera o retorno e a pontuação, e a coordenação acompanha o conjunto — sem cadastros paralelos e sem controles separados.”

**Tablet:** 2×2 com a linha de conexão passando no topo de cada par.
**Mobile:** coluna única com **trilha vertical** à esquerda; o nó de cada card fica na cor do perfil; a linha de conexão horizontal desaparece.

**Nota:** a cor de perfil nunca é usada em texto pequeno; ela aparece em barra, chip, nó e marcador.

---

### 5.7 COMO FUNCIONA — `#como-funciona` · fundo papel (spec §5.7)

**Título (h2):** “Da atividade à conquista.”
**Lead:** “Seis etapas, sempre na mesma ordem. É a mesma jornada em qualquer perfil.”

**Composição — trilha de 6 etapas (sequência real, portanto numerada):**

```
DESKTOP
 ●1────────────●2────────────●3
 Publicação    Participação  Validação
 ●4────────────●5────────────●6
 Reconhecimento Evolução     Gestão
```

- Desktop `lg`: grid 3×2 com `gap-x-8 gap-y-10`; entre cards, um conector de 24px com linha de 1px e nó; números em círculo 32px (`bg-white border`).
- O grid é lido na ordem 1→2→3→4→5→6 (DOM linear; sem `order` que quebre a leitura).
- Tablet `md`: 2×3 (2 colunas).
- Mobile: trilha **vertical única** com números à esquerda e texto à direita; conector `w-px` de 16px.
- Cada etapa: `h3` 18px + texto `text-sm` (2 linhas). Sem ícone — o número já é o elemento gráfico.
- Alternância visual: as etapas 1–3 são “operação” (linha azul) e 4–6 são “resultado” (linha verde `#22c55e` no conector), reforçando a virada do ciclo; explicar a mudança com uma legenda de 12px (“Da operação ao reconhecimento”).

Etapas (textos da spec §5.7):

| # | Título | Texto |
|---|---|---|
| 1 | Publicação | O professor cria e publica uma atividade para determinada turma. |
| 2 | Participação | O estudante visualiza a atividade, realiza o que foi solicitado e envia sua entrega. |
| 3 | Validação | O professor ou funcionário responsável analisa a entrega e registra o resultado, podendo aprovar, reprovar ou solicitar correção. |
| 4 | Reconhecimento | Quando a entrega é aprovada, o sistema registra a pontuação correspondente e notifica o estudante. |
| 5 | Evolução | O estudante acompanha seus pontos, níveis, histórico e recompensas. |
| 6 | Gestão | A equipe escolar acompanha os indicadores e utiliza os recursos administrativos para monitorar as atividades. |

---

### 5.8 GAMIFICAÇÃO — `#gamificacao` · fundo tinta clara (spec §5.8)

**Título (h2):** “Participar também pode ser uma conquista.”
**Lead:** “A participação aprovada gera pontos. Os pontos mostram evolução e podem ser trocados por recompensas cadastradas pela coordenação.”

**Composição em 3 blocos (evitar “4 cards de nível” soltos):**

1. **Trilha de níveis** (largura total):
   - Linha horizontal com 4 nós + 4 rótulos: Bronze `0–99`, Prata `100+`, Ouro `300+`, Diamante `500+`.
   - Cada nó: círculo 16px com a cor do nível + `h3` 18px + `text-xs` com o limiar.
   - Os limiares vêm de `LEVEL_THRESHOLDS` (`@shared/types`) — **importar o helper** para não divergir do código; não digitar valores soltos.
   - Em mobile: trilha vertical com 4 linhas.

2. **Carteira ilustrativa** (card à esquerda, 5 colunas em `lg`):
   - Card `bg-white rounded-2xl border p-6`, header `text-xs font-semibold text-slate-500` “Exemplo de carteira”.
   - Saldo `120 pts` em Nunito 900 32px + chip de nível “Prata”.
   - Barra de progresso real: 120 pontos em [100, 300) = **10%** (`levelProgress(120)`), rótulo “Faltam 180 pts para Ouro”.
   - Micro-nota: “Valores ilustrativos, calculados com as faixas reais da plataforma.”
   - **Não** reutilizar `BarChart` com números inventados.

3. **Como os pontos acontecem + recompensas** (direita, 7 colunas):
   - Lista de 3 origens de pontos: aprovação de atividade; conclusão de reforço escolar; bônus de sequência de participação.
   - **Sequência:** exibir os marcos reais de `STREAK_MILESTONES` (3, 7, 12 e 20 dias → +10, +20, +40 e +80 pts) como 4 chips com ícone de chama discreto; se os marcos mudarem no código, a landing acompanha (importar o helper).
   - **Recompensas:** frase objetiva “O catálogo, o saldo e o histórico de resgates ficam na área do aluno; o gerenciamento é da coordenação.” + um `Badge` “Catálogo cadastrado pela escola”.
   - **Nunca** citar prêmios, valores, benefícios financeiros ou resultados pedagógicos.

**Mobile:** blocos empilhados (trilha → carteira → origens/recompensas).

---

### 5.9 DESENVOLVIMENTO — `#desenvolvimento` · fundo branco + malha (spec §5.9)

**Título (h2):** “Uma ideia construída a partir da realidade escolar.”
**Lead:** “O projeto começou pelo problema, não pelas telas. As etapas abaixo descrevem a trajetória de desenvolvimento.”

**Composição — trilha vertical editorial (sequência real, numerada):**

- Coluna única com largura máxima `max-w-[760px]`, trilha `w-px` à esquerda.
- Cada etapa: número 40px (`w-10 h-10 rounded-full bg-[#eef3fa] text-[#0d2d6b] font-extrabold`), `h3` 18–20px e texto de 2 linhas.
- Separador vertical de 24px entre etapas; nenhum card (evita “6 cards repetidos”).
- Em `lg`, o título da seção ocupa a esquerda (sticky) e a trilha a direita (7 colunas) — mesmo padrão da seção Problema, mas com a trilha em vez da lista.
- Ao final, uma nota em `text-xs text-slate-500`: “Projeto acadêmico desenvolvido na ETEC Cravinhos (Centro Paula Souza), no contexto do Projeto Integrador II. Não há datas de fase publicadas.”

Etapas (spec §5.9):

| # | Título | Texto |
|---|---|---|
| 1 | Identificação do problema | A partir da vivência escolar, o grupo percebeu dificuldades relacionadas à organização, à participação e ao acompanhamento das atividades. |
| 2 | Planejamento da solução | Foram definidos o público-alvo, as necessidades dos usuários, os objetivos, as personas e a proposta de valor. |
| 3 | Estruturação das funcionalidades | Foram planejados os diferentes perfis de acesso e os processos de atividades, entregas, validações, pontuação e recompensas. |
| 4 | Desenvolvimento da interface | Foram elaboradas as telas e os fluxos de navegação, considerando a experiência de alunos, professores, funcionários e coordenação. |
| 5 | Desenvolvimento tecnológico | O projeto evoluiu para uma implementação web com frontend, backend, autenticação, banco de dados e gerenciamento das funcionalidades. |
| 6 | Evolução do protótipo | A plataforma foi ampliada com funcionalidades de acompanhamento, relatórios, notificações, auditoria, gamificação e organização dos diferentes perfis. |

**Proibido:** datas por etapa, quantidade de testes, depoimentos, nomes de ferramentas não confirmadas, “resultados” de pesquisa.

---

### 5.10 TECNOLOGIA — `#tecnologia` · fundo navy (spec §5.10)

**Título (h2):** “Por trás de uma experiência integrada.”
**Lead:** “A interface, as regras de negócio e o armazenamento ficam em camadas separadas. É isso que permite evoluir a plataforma sem reescrever a experiência.”

**Composição — diagrama de 3 camadas empilhadas:**

```
┌────────────────────────────────────────────┐
│ 1 · Interface                              │
│    React 19 · TypeScript · Vite · Tailwind │
├────────────────────────────────────────────┤
│ 2 · API e regras                           │
│    Node.js · Express · Zod                 │
│    sessão · permissões por perfil          │
├────────────────────────────────────────────┤
│ 3 · Dados                                  │
│    SQLite · uploads · auditoria            │
└────────────────────────────────────────────┘
```

- Cada camada: `bg-white/5 border border-white/10 rounded-2xl p-5`, título em `h3` branco, chips de tecnologia em `bg-white/10 text-blue-100 text-xs rounded-full px-3 py-1`.
- Entre camadas, um conector vertical de 12px com nó central; seta só se apontar o fluxo real de requisição (Interface → API → Dados).
- Ao lado (ou abaixo, no mobile), bloco “Outros recursos” com 6 chips: autenticação por sessão; controle de permissões; gerenciamento de arquivos; relatórios; testes automatizados; auditoria.
- Fecho de 1 linha: “A arquitetura separa a interface da lógica de negócio e do armazenamento de dados.”
- **Não** transformar em documentação: sem trechos de código, sem nomes de bibliotecas não usadas, sem versões inventadas (usar apenas React 19, TypeScript, Vite, Tailwind CSS 4, Node.js, Express, SQLite, Zod).

**Mobile:** camadas empilhadas, chips quebram em 2 linhas; nenhum diagrama horizontal.

---

### 5.11 ESTADO ATUAL — `#estado-atual` · fundo papel (spec §5.11)

**Título (h2):** “Um projeto em evolução.”
**Lead:** “O Conecta ETEC é um protótipo funcional. Esta seção separa o que já existe do que ainda está previsto.”

**Chip de status (topo da seção):** `Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"` com “Protótipo funcional em evolução”.

**Composição — comparação em 2 painéis (não são cards de feature):**

| Painel “Já desenvolvido” | Painel “Em evolução” |
|---|---|
| `rounded-2xl border border-slate-200 bg-white p-6` | `rounded-2xl border border-dashed border-slate-300 bg-transparent p-6` |
| Marcador `check` 16px em `#1a4fa0` | Marcador `clock` 16px em `slate-400` |
| Lista de 14 itens, 2 colunas em `md` | Lista de 10 itens, 1 coluna |
| Título `h3` “O que já foi desenvolvido” | Título `h3` “O que ainda está em evolução” |

**Já desenvolvido (`CONTENT.md` §11, verificado no código — substitui a lista do README):** autenticação com e-mail e senha e perfis de acesso; gestão de usuários, turmas e disciplinas pela coordenação; criação, publicação, encerramento e exclusão lógica de atividades; visualização em lista e calendário; entregas com comentário, evidência e anexos de imagem/PDF; reenvio após correção; validação com feedback; pontos, níveis, sequência, bônus e ajustes; recompensas e resgates; reforço escolar; notificações e avisos; indicadores, relatórios em CSV e auditoria; **edição do próprio perfil (nome, foto e senha)**; modo escuro e recursos de acessibilidade nos painéis.

**Em evolução (`CONTENT.md` §11):** login único institucional e recuperação de senha; cadastro público de contas; publicação em infraestrutura oficial (HTTPS, backups, monitoramento); integração com sistemas acadêmicos institucionais; notificações por e-mail ou push; ampliação dos testes (incluindo ponta a ponta); reforço de segurança e privacidade; interface de manutenção da grade curricular; pesquisa formal com estudantes e equipe; endereço público de demonstração.

**Nota de transparência (obrigatória, `text-sm text-slate-600`):** “Não há implantação oficial na ETEC nem URL pública de demonstração. Este site apresenta um projeto acadêmico em desenvolvimento.”

**Proibido:** afirmar integração com SIGA, login institucional ativo, homologação, versão pública de demonstração, métricas de uso.

---

### 5.12 CONTATO — `#contato` · fundo navy profundo (spec §5.12)

**Título (h2):** “Vamos manter essa conexão?”
**Lead:** “O código e a documentação pública do projeto ficam no GitHub. É por lá que o desenvolvimento pode ser acompanhado.”

**Composição — 2 colunas:**

- **Esquerda (6 col):** h2 + lead + nota de transparência: “Os canais oficiais de contato ainda não foram publicados. Quando existirem, aparecerão nesta seção.” (`text-sm text-blue-200`).
- **Direita (6 col):** um único card `bg-white/5 border border-white/15 rounded-2xl p-6` com dois links:
  1. **Acompanhar o projeto no GitHub** — `https://github.com/nicolastrovoada/ConectaETEC` (texto exibido: “Acompanhar o projeto no GitHub”), ícone `github`, `target="_blank" rel="noopener noreferrer"`, com `sr-only` “(abre em nova aba)”.
  2. **Abrir uma issue no repositório** — link para `/issues` do repositório, **renderizado apenas se** `ISSUES_URL` estiver confirmado. Caso contrário, não renderizar.

- **Proibido:** formulário sem destino real; e-mail, telefone, Instagram, WhatsApp ou “fale com a coordenação”; qualquer dado institucional não publicado.
- **Config centralizada** (§7.5): `CONTACT_CHANNELS: ContactChannel[]` vazio por padrão; a UI renderiza os canais existentes e, se a lista estiver vazia, mostra a nota de transparência. Adicionar um canal no futuro = editar apenas o arquivo de conteúdo.
- Se houver mais de um canal no futuro, empilhar linhas com o mesmo padrão do card (ícone + rótulo + URL), sem criar um grid novo.

---

### 5.13 RODAPÉ · fundo tinta (`#081c3d`) · spec §5.13

**Estrutura:**

```
┌──────────────────────────────────────────────────────────────────┐
│ ◯ ConectaETEC     NAVEGAR            PROJETO        ACADÊMICO    │
│ Conectando o      Início             GitHub         ETEC Cravinhos│
│ futuro.           Sobre o projeto    Issues*        Centro Paula │
│ Descrição curta   Funcionalidades    (ver nota)     Souza        │
│ (2 linhas)        Para quem                         Curso Técnico│
│                   Desenvolvimento                   em ADM       │
│                   Contato                           2026         │
├──────────────────────────────────────────────────────────────────┤
│ © 2026 Conecta ETEC · Projeto acadêmico · Protótipo funcional    │
└──────────────────────────────────────────────────────────────────┘
  * "Issues" só aparece se a abertura de Issues for confirmada (§14).
```

- Grid: `1 col` no mobile, `2` em `sm`, `4` em `lg` (marca ocupando 2 colunas em `lg`).
- Marca: `Wordmark tone="light"`, slogan em `text-blue-200 text-sm`, descrição `text-sm text-blue-100 max-w-[42ch]`: “Plataforma de engajamento escolar que reúne atividades, entregas, validação, pontuação e acompanhamento em um único ambiente.”
- Colunas de links: título `h3` 14px `text-blue-200`, itens `text-sm text-blue-100 hover:text-white` com `py-1.5` (alvo ≥ 32px; em mobile `py-2`).
- Coluna “Acadêmico”: “ETEC Cravinhos”, “Centro Paula Souza”, “Curso Técnico em Administração”, “2026”. Sem e-mails, sem endereço.
- Barra inferior: `border-t border-white/10 pt-6 mt-10 text-xs text-blue-200/80` com:
  - “© 2026 Conecta ETEC · Projeto acadêmico”;
  - “Protótipo funcional, sem implantação oficial.” (mantém a transparência);
  - link “Voltar ao topo” (`href="#inicio"`), com `aria-label="Voltar ao topo da página"`.
- **Não** usar emojis, ícones de redes sociais inexistentes ou “feito com ❤”.

---

## 6. Representação do produto

### 6.1 Regras invioláveis

1. **Nenhuma imagem de `/uploads`.** A rota é protegida por sessão; a landing é pública. Também não usar URLs externas de imagem.
2. **Nada de dados de pessoas reais.** Sem nomes de alunos/professores, sem fotos, sem turmas identificáveis. O mock usa “Aluno” como papel, nunca um nome próprio.
3. **Tudo que é ilustrativo é rotulado.** Legenda visível abaixo do conjunto: “Demonstração visual. Interface ilustrativa, sem dados reais.”
4. **Mock não é controlável.** Nada dentro do painel recebe foco, `onClick` ou `role="button"`. Usar `<div>`/`<span>`; o conjunto inteiro leva `aria-hidden="true"` e a legenda fica fora dele.
5. **Sem números de adoção.** Nada de “+1.000 alunos”, “92% de aprovação”, “3 escolas”. Números só existem dentro do mecanismo (saldo, faixas, progresso) e sempre no mock rotulado.
6. **Fidelidade visual ao app real.** Reaproveitar as formas que já existem: card `rounded-2xl`, header com título da página, chip de saldo, barra de nível, badges de status, avatar em gradiente do papel.

### 6.2 Composição `ProductPreview`

Dois painéis, em perspectiva de “produto em uso” (sem chrome de navegador, sem três bolinhas):

**Painel A — “Início do aluno”** (principal, 100% da largura do bloco)
- Barra de topo do painel: símbolo `C` 24px + “Início” em Nunito 800 + chip “Aluno” (azul).
- Card interno com gradiente `from-blue-600 to-blue-800`: “Olá, Aluno” + saldo `120 pts` em chip translúcido; abaixo, “Nível Prata”.
- Barra de progresso: 10% (`levelProgress(120)`), rótulo “Faltam 180 pts para Ouro”.
- Uma linha de atividade: “Pesquisa sobre hábitos de estudo” + `20 pts` + `Badge` “Aprovada” (`bg-green-100 text-green-700`, como no app).
- Rodapé do painel: “Continua em: Atividades · Reforço · Recompensas” em 12px.

**Painel B — “Validação”** (secundário, menor, sobreposto no desktop)
- Barra de topo: “Validar entrega” + chip “Professor”.
- Linha: “Aluno · entrega com evidência” + `Badge` “Enviada”.
- Duas linhas de feedback (texto curto) e dois chips estáticos “Aprovar” (verde) e “Solicitar correção” (âmbar) — **não são botões**, são ilustração.
- Rodapé: “Aprovação registra pontos e notifica o estudante.”

**Desktop:** painel A à direita; painel B sobreposto no canto inferior esquerdo, deslocado `-ml-10 -mt-8`, com sombra `--landing-shadow-frame`. **Tablet/mobile:** apenas o painel A; o painel B vira uma faixa compacta de 1 linha abaixo (“Validação: aprovar · reprovar · solicitar correção”), sem sobreposição.

### 6.3 Onde cada representação aparece

| Seção | Representação | Dados |
|---|---|---|
| Hero | Painel A + B | ilustrativos, rotulados |
| Solução | Diagrama de fluxo (não é interface) | nenhum dado |
| Perfis | Micro-visuais por perfil | rótulos, sem números (exceto barra do aluno) |
| Gamificação | Carteira + trilha de níveis + marcos | ilustrativos/regras reais, rotulados |
| Tecnologia | Diagrama de camadas | nomes reais das tecnologias |
| Estado atual | Listas de status | `CONTENT.md` §11 (verificado no código) |

### 6.4 Texto da legenda (fixo)

> **Demonstração visual. Interface ilustrativa, sem dados reais.**

Em superfícies navy: `text-xs text-blue-200`; em superfícies claras: `text-xs text-slate-500`. Sempre visível (não só em `title`/tooltip).

---

## 7. Inventário de componentes

### 7.1 Reutilizados (sem alterar comportamento)

| Componente | Como usar na landing |
|---|---|
| `Button` (`components/ui/Button.tsx`) | CTAs de acesso (ações de estado, não links). Adicionar **duas variantes** `onDark` e `onDarkOutline` ao mapa `VARIANTS` — mudança aditiva, sem efeito nas telas atuais. |
| `Badge` (`components/ui/Badge.tsx`) | chips de status (“Protótipo funcional”, “Aprovada”, “Enviada”, “Exemplo”). |
| `Card` (`components/ui/Card.tsx`) | apenas onde a forma já coincide (cards neutros de funcionalidades/tecnologia). Não envolver seções inteiras. |
| `Spinner` (`components/ui/EmptyState.tsx`) | **não** usar na landing (conteúdo estático; o loading de sessão continua no `App.tsx`). |
| `BarChart` | **não** usar na landing (evita gráfico com dados inventados). |
| `Modal` | **não** usar (o menu mobile é disclosure, §4.4). |
| `UserAvatar` | **não** usar (depende de `SafeUser` e de `/uploads`). |
| `ROLE_THEME` (`lib/theme.ts`) | gradientes de acento por perfil. |
| `ROLE_LABELS` (`@shared/types`) | nomes dos perfis (nunca duplicar strings). |
| `LEVEL_THRESHOLDS`, `STREAK_MILESTONES`, `levelProgress` (`@shared/types`) | valores de níveis/sequência na seção de gamificação (evita divergência). |

**Não reutilizar `Layout`**: depende de `useUser()` autenticado e de notificações.

**Refatoração mínima recomendada em `Button.tsx`:** extrair `export function buttonClasses(variant, className)` e usar tanto no `Button` quanto no novo `LinkButton`. Sem mudança de comportamento.

### 7.2 Novos “landing primitives”

| Componente | Responsabilidade | Contrato |
|---|---|---|
| `Wordmark` | marca + texto; variantes de tom/tamanho | `{ size?: "sm" \| "md" \| "lg"; tone?: "dark" \| "light"; withText?: boolean; className?: string }` |
| `LinkButton` | âncora com a mesma aparência de `Button` | `AnchorHTMLAttributes & { variant?: ButtonVariant; className?: string }` |
| `Section` | fundo full-bleed + container + padding vertical + `scroll-mt` | `{ id: string; tone?: "paper" \| "tint" \| "white" \| "navy"; className?: string; children: ReactNode }` |
| `SectionIntro` | h2 + lead + hairline de marca | `{ titleId: string; title: ReactNode; lead?: ReactNode; align?: "left" \| "center"; tone?: "light" \| "dark" }` |
| `LandingIcon` | ícones SVG inline (24px, stroke 1.75, `currentColor`, `aria-hidden`) | `{ name: IconName; className?: string }` |
| `ProductPreview` | composição dos painéis A/B + legenda | `{ className?: string }` |

**Ícones necessários (`IconName`)** — todos desenhados à mão, sem biblioteca:
`cap`, `board`, `building`, `chart`, `flow`, `check`, `clock`, `book`, `star`, `layers`, `server`, `database`, `github`, `arrowRight`, `arrowUp`, `menu`, `close`.
Ícones decorativos sempre `aria-hidden="true" focusable="false"`; quando carregarem significado, o texto adjacente já nomeia a ação.

### 7.3 Seções (um arquivo por seção)

`LandingHeader`, `HeroSection`, `ProblemSection`, `SolutionSection`, `FeaturesSection`, `ProfilesSection`, `WorkflowSection`, `GamificationSection`, `DevelopmentSection`, `TechnologySection`, `ProjectStatusSection`, `ContactSection`, `LandingFooter`.

Regra: cada seção recebe apenas o que precisa; nenhuma seção importa `useUser`, `api` ou contexto de autenticação. `onRequestLogin` é a única prop repassada.

### 7.4 Estrutura de arquivos sugerida

```
app/client/src/
├─ pages/
│  └─ LandingPage.tsx                 ← composição + <main> + skip link
├─ components/
│  └─ landing/
│     ├─ content.ts                   ← TODO o texto/config (fonte única)
│     ├─ Section.tsx                  ← Section + SectionIntro
│     ├─ Wordmark.tsx
│     ├─ LinkButton.tsx
│     ├─ LandingIcon.tsx
│     ├─ LandingHeader.tsx
│     ├─ HeroSection.tsx
│     ├─ ProblemSection.tsx
│     ├─ SolutionSection.tsx
│     ├─ FeaturesSection.tsx
│     ├─ ProfilesSection.tsx
│     ├─ WorkflowSection.tsx
│     ├─ GamificationSection.tsx
│     ├─ DevelopmentSection.tsx
│     ├─ TechnologySection.tsx
│     ├─ ProjectStatusSection.tsx
│     ├─ ContactSection.tsx
│     ├─ LandingFooter.tsx
│     └─ ProductPreview.tsx
└─ ... (Button.tsx recebe as variantes onDark)
```

Sem pasta `landing/` dentro de `pages/` (a página é única). Sem CSS novo além de: 3 tokens `@theme`, `--landing-grid-color`, `--landing-shadow-*` e 1 keyframe (§9).

### 7.5 Conteúdo centralizado (`content.ts`)

Nenhum texto de marketing dentro de componente. Formato mínimo:

```ts
import type { Role } from "@shared/types"

export const GITHUB_URL = "https://github.com/nicolastrovoada/ConectaETEC"
/** `null` até a abertura de Issues ser confirmada no repositório (§14). */
export const ISSUES_URL: string | null = null

export interface ContactChannel {
  id: string
  label: string
  href: string
  icon: "github" | "arrowRight"
  external: boolean
}
export const CONTACT_CHANNELS: ContactChannel[] = []

export const NAV_LINKS: { id: string; label: string }[]
export const HERO: { slogan: string; title: string; lead: string; note: string }
export const PROBLEMS: { icon: IconName; title: string; text: string }[]
export const FLOW_STEPS: { title: string; text: string }[]
export const FEATURE_GROUPS: { icon: IconName; title: string; items: string[]; wide?: boolean }[]
export const PROFILES: { role: Role; functionLabel: string; description: string; bullets: string[] }[]
export const WORKFLOW_STEPS: { title: string; text: string }[]
export const DEV_STAGES: { title: string; text: string }[]
export const TECH_LAYERS: { title: string; subtitle: string; items: string[] }[]
export const TECH_EXTRAS: string[]
export const STATUS_DONE: string[]
export const STATUS_PLANNED: string[]
```

Regras:
- Todas as strings são **copiadas** de `CONTENT.md` (texto final), sem reescrita nem “melhorias” de estilo.
- `CONTACT_CHANNELS` vazio → renderiza a nota “canais ainda não publicados”; nunca esconder a seção.
- `ISSUES_URL` só é exibido se não for `null`.
- `status` de cada item pode ser derivado: textos já são separados em `STATUS_DONE` / `STATUS_PLANNED`, sem promessas.
- Sem datas, nomes de usuários, e-mails ou números de impacto em `content.ts`.

### 7.6 Contrato de integração (resumo para `web-frontend`)

```tsx
// pages/LandingPage.tsx
export interface LandingPageProps {
  /** Abre o LoginPage existente (mesma ação dos dois botões do header). */
  onRequestLogin: () => void
}
export function LandingPage({ onRequestLogin }: LandingPageProps)
```

No `App.tsx`, o estado público passa a ter duas views: `session === null` + `loginRequested === false` → `LandingPage`; `loginRequested === true` → `LoginPage`. Nenhuma rota, nenhum novo estado de autenticação, nenhuma chamada de API na landing.

**Opcional (recomendado):** `LoginPage` ganha `onBack?: () => void` e um link “Voltar para a apresentação” acima do card. Se não for implementado, nenhum critério desta especificação é violado.

---

## 8. Conteúdo: real × planejado × ilustrativo

| Categoria | O que entra | Como sinalizar na UI |
|---|---|---|
| **Implementado** | Autenticação por perfil; gestão de usuários/turmas/disciplinas; atividades (lista e calendário); entregas com evidência e anexos; validação com feedback; pontuação, níveis e sequência; recompensas; reforço; notificações; avisos; relatórios CSV; auditoria; edição do próprio perfil; modo escuro e acessibilidade nos painéis | presente, sem selo (é o padrão) |
| **Planejado** | Login único institucional; recuperação de senha; cadastro público de contas; infraestrutura oficial (HTTPS, backups, monitoramento); integração com sistemas acadêmicos; notificações por e-mail/push; ampliação de testes; segurança/privacidade; grade curricular editável; pesquisa com usuários; URL pública de demonstração | painel tracejado + marcador de relógio + “em evolução” |
| **Ilustrativo** | Interior dos painéis do produto: “Aluno”, “120 pts”, “Prata”, “Pesquisa sobre hábitos de estudo”, chips de status | `Badge` “Exemplo” **dentro** do mock + legenda “Interface ilustrativa, sem dados reais” |
| **Nunca** | Estatísticas de adoção, depoimentos, prêmios, parceiros, datas de fase, e-mails, telefones, credenciais, URL pública de demonstração | — |

Regras de redação:
- Falar do que a plataforma **faz**, não do que “vai revolucionar”.
- “Protótipo funcional” é o termo oficial; “sistema oficial” é proibido.
- Não citar SIGA nem qualquer integração nominal não implementada.
- Não usar as credenciais de teste em nenhum texto, link ou tooltip.

---

## 9. Movimento

**Princípio:** o movimento confirma uma ação ou apresenta a página uma vez. Nada de animação contínua, parallax, contadores ou reveals em cascata por seção.

| Momento | Efeito | Duração/easing |
|---|---|---|
| Entrada do hero (uma vez, no load) | texto: `opacity 0→1` + `translateY(12px→0)`; painel: `opacity 0→1` + `translateY(20px→0)` com atraso de 120ms | 420ms / `cubic-bezier(.22,.61,.36,1)`, `animation-fill-mode: both` |
| Hover em link/botão | mudança de cor/borda (transição de `colors`) | 150ms |
| Foco | outline instantâneo (sem transição) | 0ms |
| Menu mobile | aparece/some por `opacity` + `translateY(-4px)` opcional | 160ms |
| Nível/barra do mock | **estático** (sem animação) | — |

Regras:
- `animation-fill-mode: both` garante que, com `prefers-reduced-motion`, o conteúdo termine visível (o `index.css` já zera as durações globalmente, linhas 74–83). **Nunca** iniciar conteúdo em `opacity: 0` sem fallback visível.
- Não usar `IntersectionObserver` para revelar seções. Se o time insistir, o estado padrão deve ser visível (a animação só pode “melhorar”, nunca esconder).
- Nada que dependa de hover para transmitir informação. Hover é apenas confirmação.
- Sem `scroll-jacking`, sem `parallax`, sem `marquee`.

```css
@keyframes landing-rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
.landing-rise { animation: landing-rise .42s cubic-bezier(.22,.61,.36,1) both; }
.landing-rise-late { animation-delay: 120ms; }
```

Aplicar somente no hero. O `prefers-reduced-motion` global já resolve o resto.

---

## 10. Acessibilidade

### 10.1 Estrutura e semântica

```
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header role="banner"> ... <nav aria-label="Navegação principal"> ... </header>
<main id="conteudo" tabIndex={-1} class="outline-none">
  <section id="inicio" aria-labelledby="hero-title">  <h1 id="hero-title">
  <section id="sobre" aria-labelledby="sobre-title">   <h2 id="sobre-title">
  ... (um h2 por seção)
</main>
<footer role="contentinfo"> ... <nav aria-label="Navegação do rodapé"> ... </footer>
```

- **Um único `h1`** (hero). Um `h2` por seção; `h3` para cards/etapas; `h4` apenas dentro de card com subgrupo. Nunca pular níveis.
- Landmarks: `header`, `nav`, `main`, `footer`. O rodapé recebe um `h2` visualmente oculto (“Informações do Conecta ETEC”) para não quebrar a hierarquia das colunas (`h3`).
- Skip link: usar a classe `.skip-link` já existente em `index.css` (linhas 42–57).
- O título de cada seção é referenciado por `aria-labelledby`; o `id` do título é único e estável.
- Links externos: `target="_blank" rel="noopener noreferrer"` + texto “(abre em nova aba)” em `sr-only`.
- Âncoras internas: texto que descreve o destino (“Conhecer a plataforma”, “Voltar ao topo”), nunca “clique aqui”.

### 10.2 Teclado e foco

- Ordem de foco = ordem visual (DOM na ordem: header → main → footer; menus mobile imediatamente após o botão).
- Foco sempre visível: `outline: 2px solid var(--color-etec-blue); outline-offset: 2px` (global). Em navy, `focus-visible:outline-white`.
- Menu mobile: `Escape` fecha, foco volta ao botão; ao abrir, foco no primeiro link; `aria-expanded` sincronizado.
- Nenhum elemento dentro do `ProductPreview` é focável (§6.1).
- Alvos de toque: links de nav ≥ 44px de altura; CTAs ≥ 44px; botões compactos do header ≥ 40px; links do rodapé ≥ 32px com espaçamento vertical.
- Não usar `tabIndex` positivo em nenhum elemento.

### 10.3 Contraste e legibilidade

- Corpo ≥ 4,5:1; texto grande (≥ 24px ou ≥ 18,66px bold) ≥ 3:1. Pares aprovados em §2.1.
- Nunca transmitir informação **apenas** por cor: status sempre tem rótulo textual (“Aprovada”, “Em evolução”) além do marcador.
- Não usar `text-slate-400` sobre branco; em navy, mínimo `blue-200`.
- Texto sobre gradiente de perfil: usar apenas branco em chips com fundo sólido do papel; nunca texto pequeno sobre `orange-500`.

### 10.4 Conteúdo e mídia

- A landing não tem `<img>` de conteúdo; se algum dia tiver, `alt` descritivo e `width/height` para evitar CLS.
- SVGs decorativos: `aria-hidden="true" focusable="false"`; SVGs com significado: `<title>` + `role="img"` e `aria-labelledby`.
- Textos de ícones/chips: o rótulo textual sempre acompanha o ícone (nunca ícone sozinho em ação).
- `lang="pt-BR"` já está em `index.html`.
- Não usar texto em imagem (o logo é o único caso, e é um SVG com texto real).

### 10.5 Movimento e preferências

- `prefers-reduced-motion` já tratado globalmente; nenhuma animação é pré-requisito para ler conteúdo (§9).
- Sem elementos piscando, sem autoplay.
- Zoom até 200% sem quebra de layout: nada com `overflow: hidden` cortando texto; testar em 320px com fonte em 200%.

---

## 11. SEO, metadados e assets

### 11.1 `index.html` (arquivo compartilhado por landing/login/painéis)

```html
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Conecta ETEC — Conectando o futuro</title>
    <meta name="description" content="Plataforma de engajamento escolar que conecta alunos, professores, funcionários e coordenação em atividades, entregas, validação, pontos e recompensas." />
    <meta name="theme-color" content="#0d2d6b" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="Conecta ETEC" />
    <meta property="og:title" content="Conecta ETEC — Conectando o futuro" />
    <meta property="og:description" content="Plataforma de engajamento escolar que aproxima estudantes, professores, funcionários e coordenação, organizando atividades, estudos e reconhecimento em um único ambiente digital." />
    <!-- og:image apenas quando o asset final existir (§11.3) -->
  </head>
```

- **Não** incluir `og:url`, `canonical` ou `twitter:site` até existir domínio público oficial.
- **Não** incluir JSON-LD de `Organization`/`EducationalOrganization` (não há vínculo institucional oficial publicado).
- `robots`: deixar o padrão (indexável). Não criar `sitemap.xml` fictício.
- O título atual (“Conecta ETEC — V2”) deve ser substituído. Como o `index.html` é único para a SPA, o título passa a descrever o produto, não a versão.
- Título e descrição acima são os de `CONTENT.md` §14 (prevalece sobre este resumo). A meta description deve ficar entre ~120 e 160 caracteres.
- `theme-color`: usar `#0d2d6b` (`--color-etec-navy`), coerente com o hero. `CONTENT.md` sugere `#172554`; qualquer um dos dois atende à WCAG — o importante é ser o mesmo navy do topo.

### 11.2 Favicon

- `app/client/public/favicon.svg` (a pasta `public/` ainda não existe; criar).
- Desenho: quadrado `#0d2d6b` com cantos `rx="8"` (viewBox 32×32), “C” em branco como **arco aberto** (mesma geometria do símbolo da marca, §7.2) e um nó `#22c55e` de 3px no vão do arco.
- Sem letra em fonte externa: desenhar o “C” com `<path>` para não depender de Nunito no favicon.
- Opcional (não bloqueia): `apple-touch-icon.png` 180×180 e `favicon.ico` derivados do SVG.

### 11.3 Open Graph / imagem social

- Arquivo: `app/client/public/og-conecta-etec.png`, **1200×630**.
- Composição aprovada (para exportação):
  - fundo `#0d2d6b` com malha de pontos brancos a 6% e um anel `border-white/10`;
  - símbolo + “ConectaETEC” no topo esquerdo (marca em branco);
  - título “Conectando o futuro.” em Nunito 900, branco, 72px;
  - linha de apoio: “Atividades, entregas, validação, pontos e acompanhamento em um só ambiente.”;
  - rodapé: “Projeto acadêmico · ETEC Cravinhos — Centro Paula Souza · 2026”.
- **Não** publicar `og:image` antes do arquivo existir. Placeholder genérico ou banco de imagens é proibido.
- Após criar, adicionar `og:image` + `og:image:alt` + `twitter:card=summary_large_image` e `twitter:image`.

### 11.4 Assets e performance

- Nenhuma dependência nova, nenhuma fonte nova, nenhum ícone de biblioteca (SVG inline).
- Ilustrações = CSS/div (malha, anéis, trilhas, painéis). Zero requisições de imagem na landing.
- O SVG do favicon é o único asset obrigatório.
- Não usar `loading="lazy"` (não há imagens); não usar `preload` de fontes (já importadas via Google Fonts no `index.css`).

---

## 12. Ordem de implementação sugerida

1. `content.ts` com todo o texto aprovado (revisar §5 e §8 antes de codar).
2. Primitives: `Section`/`SectionIntro`, `Wordmark`, `LandingIcon`, `LinkButton` + variantes `onDark` no `Button`.
3. Header + menu mobile + skip link.
4. Hero + `ProductPreview` (validar legenda e `aria-hidden`).
5. Problema → Solução → Funcionalidades.
6. Perfis (hub) → Como funciona (trilha).
7. Gamificação → Desenvolvimento → Tecnologia.
8. Estado atual → Contato → Rodapé.
9. Integração no `App.tsx` + `index.html` (título, meta, favicon).
10. Revisão de contraste em light/dark, teclado e 320/768/1024/1440.

---

## 13. Critérios visuais de aceite

Marcar todos antes de considerar a landing pronta.

**Direção e composição**
- [ ] O hero é o único bloco navy de impacto no topo; o restante alterna papel/tinta/branco/navy conforme §2.4.
- [ ] Existem no máximo 3 tipos de gradiente em toda a página (§2.2).
- [ ] Nenhuma seção é composta por 4+ cards idênticos com o mesmo ícone.
- [ ] “Perfis” tem 4 micro-visuais distintos e uma linha de conexão; “Como funciona” e “Desenvolvimento” usam trilha numerada (são sequências reais).
- [ ] Nenhuma etiqueta em caixa alta acima de títulos; nenhum título com uma palavra em outra cor.
- [ ] Azul `#1a4fa0` é a cor de ação/identidade; navy `#0d2d6b` é profundidade; Nunito em títulos e Inter no corpo, sem reimportar fontes.

**Header e navegação**
- [ ] “Fazer login” e “Entrar na conta” existem, estão no canto superior direito e ambos chamam `onRequestLogin`.
- [ ] Os dois CTAs são visíveis e clicáveis em 320px, 768px e 1440px.
- [ ] Header sticky, sólido, sem mudança de cor no scroll; âncoras não ficam sob o header (`scroll-margin-top`).
- [ ] Menu mobile abre/fecha por teclado, fecha com `Escape` e devolve o foco; links têm ≥ 44px de altura.
- [ ] Skip link visível no foco e leva ao conteúdo.

**Produto e conteúdo**
- [ ] Todos os textos públicos conferem com `docs/landing/CONTENT.md` (títulos, leads, bullets, microcopy, legenda do mock, metadados).
- [ ] Nenhuma referência a `/uploads`, nenhuma imagem externa, nenhum avatar de usuário.
- [ ] Painéis do produto têm legenda “Demonstração visual. Interface ilustrativa, sem dados reais.” e nenhum elemento focável.
- [ ] Nenhum número de adoção/impacto; “120 pts” e “Prata” só aparecem dentro do mock rotulado.
- [ ] Nenhuma credencial de teste, e-mail, telefone, rede social, prêmio, depoimento ou data de fase.
- [ ] “Estado atual” reproduz exatamente as listas de `CONTENT.md` §11 (14 itens já desenvolvidos, 10 em evolução), sem mover “edição de perfil” para o futuro.
- [ ] A frase “sem implantação oficial” e a nota de canais não publicados estão presentes.
- [ ] Links externos abrem com `rel="noopener noreferrer"` e aviso de nova aba.

**Acessibilidade**
- [ ] Um `h1`, `h2` por seção, sem saltos de nível.
- [ ] Contraste: corpo ≥ 4,5:1; texto grande ≥ 3:1; nenhum texto de perfil colorido em tamanho pequeno.
- [ ] Foco visível em todos os links/botões, inclusive sobre navy (outline branco).
- [ ] Navegação completa por teclado, sem armadilha de foco, sem `tabIndex` positivo.
- [ ] `aria-hidden` em todos os elementos decorativos (malha, anéis, ícones, mock).
- [ ] Com `prefers-reduced-motion`, todo o conteúdo continua visível e legível.

**Responsividade e tema**
- [ ] Sem scroll horizontal em 320, 375, 768, 1024 e 1440px.
- [ ] Em 320px os CTAs do hero são `w-full` e os do header continuam visíveis.
- [ ] Fluxos e trilhas mudam de horizontal para vertical de forma real (não apenas `scale`).
- [ ] Todas as seções são legíveis no modo escuro (`.dark`), inclusive após logout.
- [ ] Nenhum texto abaixo de 14px fora de chips/notas (12px).

**Código (verificação cruzada com `web-qa`)**
- [ ] Nenhuma dependência nova; nenhuma fonte nova; nenhum ícone de biblioteca.
- [ ] Textos centralizados em `content.ts`; nenhuma string de marketing solta em componente.
- [ ] `npm run typecheck` e `npm run build` passam; nenhum teste existente quebra.
- [ ] Nenhuma chamada de API na landing; nenhum acesso a `localStorage` além do que o `PreferencesProvider` já faz.

---

## 14. Decisões abertas e pendências (não bloqueiam o design)

| Item | Situação | Encaminhamento |
|---|---|---|
| `ISSUES_URL` | A abertura de Issues não foi confirmada | Renderizar só se confirmado; caso contrário, manter `null` |
| Imagem OG | Depende de exportação gráfica | Publicar `og:image` somente com o PNG final |
| `favicon.ico` / `apple-touch-icon` | Opcionais | Derivar do SVG se houver ferramenta disponível |
| Scrollspy no header | Desejável, não obrigatório | P2, com `aria-current` e `IntersectionObserver` |
| Link “Voltar para a apresentação” no login | Recomendado | Adicionar `onBack?` à `LoginPage` se o escopo permitir |
| Texto de “documentação” no rodapé | Só se houver página pública | Hoje, apontar para o repositório (README/docs) |
| Nomes dos autores no rodapé | Conteúdo real do README | Opcional; se entrar, em linha secundária e sem sugerir vínculo institucional |

**O que este brief não autoriza:** criar rota, alterar autenticação/cookies, criar tabela/usuário, mudar regras de negócio, duplicar `LoginPage`, instalar dependências, publicar dados fictícios de pessoas, usar `/uploads`, prometer funcionalidades futuras como existentes, ou afirmar implantação/homologação oficial.

