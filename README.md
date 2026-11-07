# Conecta ETEC

**Plataforma de engajamento escolar — ETEC Cravinhos, Centro Paula Souza — TCC 2026**

> **Status:** protótipo funcional em evolução, base do futuro site oficial do Conecta ETEC. Ainda não há URL pública de demonstração.

## Sobre o projeto

O Conecta ETEC reúne, em uma única plataforma, atividades escolares, entregas, validação por responsáveis, pontuação, recompensas, reforço de conteúdo, notificações e acompanhamento. A proposta é tornar a participação do estudante mais visível e significativa e, ao mesmo tempo, oferecer à equipe escolar uma visão centralizada da rotina acadêmica.

O projeto parte de um problema recorrente no ensino médio técnico: parte dos estudantes apresenta baixa motivação para participar das atividades, dificuldade de manter uma rotina constante de estudo e esquecimento de prazos. Ao mesmo tempo, professores e funcionários acumulam tarefas manuais de cobrança, conferência e registro. A hipótese de solução é integrar o ciclo **atividade → entrega → validação → pontos → recompensa/acompanhamento**, reduzindo a fragmentação do processo sem transferir ainda mais carga operacional à equipe.

## Para quem

### Aluno

- Acompanha atividades, prazos e retornos de validação.
- Entrega atividades e consulta o próprio histórico.
- Acumula pontos e níveis, troca pontos por recompensas e acessa reforço escolar.
- Recebe notificações e consulta o próprio perfil.

### Professor

- Cria, publica e gerencia atividades das próprias turmas.
- Valida entregas com feedback e solicita correção quando necessário.
- Acompanha indicadores da turma e o desempenho nas próprias atividades.
- Organiza reforço escolar para as turmas em que leciona.

### Funcionário

- Organiza ações escolares, como eventos, biblioteca e suporte.
- Valida as entregas relacionadas às próprias ações.
- Consulta o histórico de entregas e validações.
- Recebe notificações e consulta o próprio perfil.

### Coordenação

- Acompanha a visão global da escola, com indicadores de participação.
- Gerencia usuários, turmas, disciplinas, pontos e recompensas.
- Publica avisos para toda a escola ou para turmas específicas.
- Consulta relatórios consolidados e registros de auditoria.

## Contexto acadêmico

Trabalho de Conclusão de Curso desenvolvido na ETEC Cravinhos, Centro Paula Souza, em 2026.

- **Autores:** Caio Silva Mota Cardim, Daniel Cardoso Ramalho, Guilherme Guedes Leandro, João Silvério Neto e Nicolas Magalhães Santos.
- **Orientador:** Prof. Lucas Juliano Reche.

O texto do TCC e os documentos internos de planejamento não são publicados neste repositório. A documentação disponível é a que consta na seção [Documentação](#documentação).

## Como executar

Pré-requisitos: Node.js 24 ou superior e npm.

```bash
git clone https://github.com/nicolastrovoada/ConectaETEC.git
cd ConectaETEC/app
npm install
npm run dev
```

Abra `http://localhost:5173`. A API responde em `http://localhost:4000`.

O banco nasce vazio. Antes do primeiro acesso, defina `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` no ambiente ou em um arquivo `.env`; quando não há usuários, o servidor cria o primeiro coordenador com esses dados. Não há credenciais de demonstração. Os detalhes de configuração, variáveis e funcionamento do boot estão na [referência técnica](docs/TECNICO.md).

## Documentação

- [Referência técnica](docs/TECNICO.md) — aprofundamento técnico do protótipo, com requisitos, regras, configuração, segurança e limitações.
- [Contrato da API](app/docs/api-contract.md) — endpoints, autenticação, permissões e códigos de erro.
- [Roadmap](docs/ROADMAP.md) — fases, decisões de produto e próximos passos.
- [Índice da documentação](docs/README.md) — visão geral dos documentos publicados e ordem de leitura.

## Status e próximos passos

O protótipo já cobre o ciclo principal: autenticação por perfil, criação e publicação de atividades, entregas com evidência, validação com feedback, pontuação, recompensas, reforço escolar, notificações, avisos, relatórios em CSV, auditoria e upload de anexos.

Ainda estão previstos:

- login único institucional e recuperação de senha;
- edição de perfil pelo próprio usuário;
- publicação em infraestrutura oficial, com HTTPS, backups e monitoramento;
- integração com sistemas acadêmicos institucionais;
- pesquisa formal com estudantes e equipe escolar;
- ampliação dos testes de frontend e testes ponta a ponta;
- endurecimento de segurança, com token CSRF dedicado e políticas formais de privacidade.

## Licença

A licença de uso do projeto ainda não foi definida pelos autores. Enquanto não houver uma licença formal, o código é disponibilizado para avaliação acadêmica e consulta técnica, sem autorização implícita de reutilização ou redistribuição.
