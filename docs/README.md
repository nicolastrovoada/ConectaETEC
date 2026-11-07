# Documentação técnica — Conecta ETEC

Este diretório reúne a documentação técnica publicada do Conecta ETEC. O [README raiz](../README.md) apresenta o produto, as funcionalidades por perfil, a stack, a estrutura do monorepo e as instruções de execução local.

## Documentos publicados

| Documento | Caminho | O que cobre | Quando consultar |
| --- | --- | --- | --- |
| Roadmap técnico | [ROADMAP.md](ROADMAP.md) | Visão, escopo, fases, mudanças no modelo de dados, critérios de verificação, riscos e limitações e próximos passos da evolução do protótipo. | Para entender o histórico de evolução, o estado atual do protótipo e as pendências previstas. |
| Contrato da API | [api-contract.md](../app/docs/api-contract.md) | Base `/api`, autenticação por cookie de sessão, convenções de resposta, rotas por domínio, permissões, códigos de erro e códigos de auditoria. | Para integrar com a API, implementar ou revisar telas, conferir permissões e atualizar o contrato após mudanças em rotas. |

O documento `api-contract.md` é mantido como contrato corrente da API do monorepo. O `ROADMAP.md` é um documento vivo: a situação das fases e as pendências podem mudar ao longo do desenvolvimento, e a seção de fases do próprio documento deve ser consultada antes de assumir que uma entrega está concluída.

## Ordem de leitura sugerida

1. **README raiz** — visão do produto, perfis, requisitos, stack e como executar o projeto.
2. **Contrato da API** — necessário para qualquer trabalho de integração, frontend ou backend.
3. **Roadmap técnico** — contexto das decisões, fases e mudanças estruturais que levaram ao estado atual.

Para avaliadores do TCC, a leitura do README raiz seguida do roadmap técnico oferece a visão de produto e o histórico de evolução. Para desenvolvedores, o contrato da API deve ser consultado em conjunto com o código de `app/server/src/routes/` e o contrato de tipos em `app/shared/types.ts`.

## Escopo da publicação

Este índice lista apenas os documentos técnicos que fazem parte do repositório público. O texto do TCC, o briefing interno, os arquivos-fonte originais e os relatórios de planejamento não são publicados e não devem ser incluídos em pull requests.

## Manutenção

- Ao alterar rotas, payloads, códigos de erro ou códigos de auditoria, atualize o [contrato da API](../app/docs/api-contract.md) no mesmo pull request.
- Ao concluir uma fase ou tomar uma decisão que altere o escopo, atualize o [roadmap técnico](ROADMAP.md).
- Ao alterar entidades, enums ou regras compartilhadas, atualize `app/shared/types.ts` e verifique cliente e servidor em conjunto.
- Mantenha os links relativos deste índice válidos ao mover ou renomear documentos.
