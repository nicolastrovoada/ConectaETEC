# Documentação técnica — Conecta ETEC

Este diretório reúne a documentação publicada do Conecta ETEC. O [README raiz](../README.md) apresenta o projeto, o problema, o público, o contexto acadêmico e as instruções básicas de execução. A referência técnica detalhada fica neste diretório.

## Documentos publicados

| Documento | Caminho | O que cobre | Quando consultar |
| --- | --- | --- | --- |
| Referência técnica | [TECNICO.md](TECNICO.md) | Stack, arquitetura, estrutura de pastas, requisitos funcionais, regras de negócio, variáveis de ambiente, funcionamento do boot, segurança, migrações e limitações. | Para entender como o protótipo foi construído e conferir o comportamento técnico. |
| Contrato da API | [api-contract.md](../app/docs/api-contract.md) | Base `/api`, autenticação por cookie de sessão, convenções de resposta, rotas por domínio, permissões, códigos de erro e códigos de auditoria. | Para integrar com a API, implementar ou revisar telas, conferir permissões e atualizar o contrato após mudanças em rotas. |
| Roadmap técnico | [ROADMAP.md](ROADMAP.md) | Visão, escopo, fases, mudanças no modelo de dados, critérios de verificação, riscos e limitações e próximos passos da evolução do protótipo. | Para entender o histórico de evolução, o estado atual do protótipo e as pendências previstas. |

O `TECNICO.md` é a referência técnica corrente do monorepo. O `api-contract.md` é mantido como contrato corrente da API. O `ROADMAP.md` é um documento vivo: a situação das fases e as pendências podem mudar ao longo do desenvolvimento, e a seção de fases do próprio documento deve ser consultada antes de assumir que uma entrega está concluída.

## Ordem de leitura sugerida

1. **README raiz** — apresentação do projeto, problema, público e como executar.
2. **Referência técnica** — stack, arquitetura, requisitos, regras, configuração e limitações.
3. **Contrato da API** — necessário para qualquer trabalho de integração, frontend ou backend.
4. **Roadmap técnico** — contexto das decisões, fases e mudanças estruturais que levaram ao estado atual.

Para avaliadores do TCC, a leitura do README raiz seguida da referência técnica e do roadmap oferece a visão de produto, a base técnica e o histórico de evolução. Para desenvolvedores, o contrato da API deve ser consultado em conjunto com o código de `app/server/src/routes/` e o contrato de tipos em `app/shared/types.ts`.

## Escopo da publicação

Este índice lista apenas os documentos que fazem parte do repositório público. O texto do TCC, os documentos internos de planejamento, os arquivos-fonte originais e os relatórios não são publicados e não devem ser incluídos em pull requests.

## Manutenção

- Ao alterar a apresentação do projeto, atualize o [README raiz](../README.md).
- Ao alterar stack, requisitos, regras de negócio, variáveis de ambiente ou comportamento de boot, atualize a [referência técnica](TECNICO.md).
- Ao alterar rotas, payloads, códigos de erro ou códigos de auditoria, atualize o [contrato da API](../app/docs/api-contract.md) no mesmo pull request.
- Ao concluir uma fase ou tomar uma decisão que altere o escopo, atualize o [roadmap técnico](ROADMAP.md).
- Ao alterar entidades, enums ou regras compartilhadas, atualize `app/shared/types.ts` e verifique cliente e servidor em conjunto.
- Mantenha os links relativos deste índice válidos ao mover ou renomear documentos.
