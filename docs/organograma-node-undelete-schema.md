# `DELETE /organograma_nodes/{id}` sem caminho de volta — contrato para a API externa

**Banco:** `avhub_prd_db`, schema `core_organograma`, tabela `node`
**Data:** 2026-09-11
**Testado:** sim, ao vivo contra a API real (`GET`/`PUT`/`POST` num id já soft-deletado) — nenhuma escrita destrutiva nova, só reproduzi o erro que o usuário já tinha encontrado.

Complementa [`organograma-hierarquia-schema.md`](./organograma-hierarquia-schema.md) (contrato já implementado, que tornou `core_organograma.node` um override opcional lido via `LEFT JOIN ... AND ov.deleted_at IS NULL`).

## Problema

`DELETE /organograma_nodes/{id}` faz **soft delete** (marca `deleted_at`, não remove a linha). Isso é transparente pra `vw_org_nodes` — a view já ignora linhas com `deleted_at IS NOT NULL` no `LEFT JOIN`, então a pessoa cai de volta no cálculo automático (`fn_default_parent_pessoa`) corretamente.

O problema é só no CRUD do recurso:

| Verbo | Comportamento hoje num id soft-deletado |
|---|---|
| `GET /organograma_nodes/{id}` | `404 Nó não encontrado` |
| `PUT /organograma_nodes/{id}` | `404 Nó não encontrado` |
| `POST /organograma_nodes` (mesmo `id`) | `400 ID de nó já cadastrado` |

O `id` fica **irrecuperável**: não aparece pra leitura/edição, mas também não pode ser recriado, porque a linha ainda existe fisicamente (só marcada como apagada). Confirmado ao vivo nos três verbos, no mesmo `id`, em sequência.

### Por que isso importa agora

O av-hub (`services/rh/organogramaNodes.ts`) segue o padrão "buscar, então decidir POST ou PUT" (`upsertNode`) — e usa `DELETE` quando o usuário limpa manualmente o campo "Reporta a" (volta pro automático) ou quando um funcionário é excluído e colegas apontavam pra ele. Isso significa que **qualquer pessoa cujo override seja apagado uma vez fica travada pra sempre** — ninguém mais consegue definir um "Reporta a" manual pra ela, porque o `POST` subsequente sempre vai bater nesse `400`.

Hoje isso afeta pelo menos os **26 ids abaixo**, apagados numa limpeza de dado legado no setor Expedição (residual do bug antigo de recálculo automático, já corrigido):

```
f9cd7700-833e-4d6d-beec-63871879649c
dc6e3d69-09b1-4965-ab35-e82ade846006
8d085b45-8158-407a-b437-1dafa4ee593c
33509a8a-26da-4bcc-8e43-358c357b464c
0cea3ec5-9718-4ca4-acb0-753bae7347c1
3524bc5a-3e39-43a2-99eb-ad14a106e410
fe426a44-278c-42a5-8d2b-6d37716b9f22
ec8d659a-2c3f-474a-afd1-c1934e24a6d9
92191dd2-1d48-4643-99ec-7294b78e4709
2f55f0c1-27b4-4f6d-b08a-e7d70b72acd6
39265f14-164d-4454-b418-71dcff8f81de
c2b2a7b6-a598-460c-a6dd-857a70aaff8e
a45378d6-4de9-4cbe-b737-b81d82b8345d
1970d9fb-bd0d-45a3-a93a-1609ffeb25f4
b764d75b-d31e-40f3-8c75-3022cd53a05b
250a53fb-84bb-43f1-873c-2f3f22229abf
87483ec1-bd6d-4784-acf4-7087e9040863
dbc78911-3d9f-4086-b02d-37d7bf47dda3
08b5aa58-063c-48e4-9a37-b0fc79e73640
a5278460-c279-4051-99cc-fe2752752898
18f80914-554d-4bb5-b504-78c1d185bce9
0882bded-45f3-40ee-96fd-6ca7396e4556
84c2365b-a747-4036-9756-b8b823e1b6d3
ba29ea06-855d-4852-bb58-d855acdb89ea
b5bc4c22-f327-4f2a-b69a-5bb287d78ac1
e1de3bbe-2aea-463c-9ace-b497b3c9bf29
2665f4a8-3abf-446e-a313-04d9f4f99ad0
```

Um deles (`87483ec1-...`, Peterson Clayton Marques) já foi reportado em produção: usuário tentou definir "Reporta a" pra ele no av-hub e recebeu `500` no `POST /api/organograma_nodes` (o av-hub repassa o erro da API externa — no teste direto contra a API o mesmo `id` retornou `400`, a diferença de status provavelmente é só como o av-hub trata o corpo do erro, a causa é a mesma).

---

## 1. Remediação imediata — destravar os 26 ids acima

```sql
UPDATE core_organograma.node
SET deleted_at = NULL
WHERE id IN (
  'f9cd7700-833e-4d6d-beec-63871879649c',
  'dc6e3d69-09b1-4965-ab35-e82ade846006',
  '8d085b45-8158-407a-b437-1dafa4ee593c',
  '33509a8a-26da-4bcc-8e43-358c357b464c',
  '0cea3ec5-9718-4ca4-acb0-753bae7347c1',
  '3524bc5a-3e39-43a2-99eb-ad14a106e410',
  'fe426a44-278c-42a5-8d2b-6d37716b9f22',
  'ec8d659a-2c3f-474a-afd1-c1934e24a6d9',
  '92191dd2-1d48-4643-99ec-7294b78e4709',
  '2f55f0c1-27b4-4f6d-b08a-e7d70b72acd6',
  '39265f14-164d-4454-b418-71dcff8f81de',
  'c2b2a7b6-a598-460c-a6dd-857a70aaff8e',
  'a45378d6-4de9-4cbe-b737-b81d82b8345d',
  '1970d9fb-bd0d-45a3-a93a-1609ffeb25f4',
  'b764d75b-d31e-40f3-8c75-3022cd53a05b',
  '250a53fb-84bb-43f1-873c-2f3f22229abf',
  '87483ec1-bd6d-4784-acf4-7087e9040863',
  'dbc78911-3d9f-4086-b02d-37d7bf47dda3',
  '08b5aa58-063c-48e4-9a37-b0fc79e73640',
  'a5278460-c279-4051-99cc-fe2752752898',
  '18f80914-554d-4bb5-b504-78c1d185bce9',
  '0882bded-45f3-40ee-96fd-6ca7396e4556',
  '84c2365b-a747-4036-9756-b8b823e1b6d3',
  'ba29ea06-855d-4852-bb58-d855acdb89ea',
  'b5bc4c22-f327-4f2a-b69a-5bb287d78ac1',
  'e1de3bbe-2aea-463c-9ace-b497b3c9bf29',
  '2665f4a8-3abf-446e-a313-04d9f4f99ad0'
);
```

**Efeito colateral esperado: nenhum.** Como a view já ignora linhas com `deleted_at` preenchido, essas 26 pessoas já estão caindo no cálculo automático agora mesmo — limpar `deleted_at` só as tira do estado "travado", não muda o `parent_id` efetivo delas em nada (a próxima pessoa que definir um "Reporta a" pra alguma delas é que vai efetivamente sobrescrever o valor).

---

## 2. Correção definitiva — impedir que isso aconteça de novo

**Recomendado:** fazer `POST /organograma_nodes` reviver a linha em vez de rejeitar, quando o `id` já existe mas está soft-deletado (`deleted_at IS NOT NULL`) — equivalente a um `UPSERT` que também limpa `deleted_at`:

```sql
-- Pseudocódigo do comportamento esperado no handler do POST:
-- INSERT ... ON CONFLICT (id) DO UPDATE
--   SET parent_id = EXCLUDED.parent_id,
--       is_sector = EXCLUDED.is_sector,
--       id_ent    = EXCLUDED.id_ent,
--       deleted_at = NULL,
--       updated_at = now()
--   WHERE core_organograma.node.deleted_at IS NOT NULL;
-- (se deleted_at já for NULL, mantém o 400 atual — não sobrescreve
-- silenciosamente um override que já está ativo)
```

Essa opção foi escolhida em vez de "fazer o `DELETE` virar hard delete" porque preserva o histórico de auditoria (`deleted_at`/`updated_at`) que a tabela já foi desenhada pra ter — só fecha a lacuna de CRUD, sem mudar a semântica de soft delete que já existe.

**Alternativa equivalente**, se for mais simples de implementar no código atual: fazer `PUT /organograma_nodes/{id}` também revivar quando encontrar o `id` soft-deletado (hoje o `PUT` usa a mesma busca filtrada do `GET`, por isso dá 404). Qualquer uma das duas resolve — não precisam ser feitas as duas.

**Nenhuma mudança é necessária no av-hub** pra essa correção: `upsertNode` (`services/rh/organogramaNodes.ts`) já faz `GET` → decide `POST` (se não achou) ou `PUT` (se achou) — com o `POST` revivendo linhas soft-deletadas, o fluxo existente passa a funcionar sem nenhum ajuste de código.

---

## Contrato REST — o que muda pra quem consome a API

| Rota | Mudança |
|---|---|
| `GET` / `PUT /organograma_nodes/{id}` | Sem mudança de shape. Continuam 404 pra id soft-deletado (comportamento correto — a linha "não existe" do ponto de vista de quem lê). |
| `POST /organograma_nodes` | Deixa de retornar `400 ID de nó já cadastrado` quando o `id` já existe **e está soft-deletado** — nesse caso específico, revive a linha com os dados do corpo da requisição. Continua rejeitando normalmente se o `id` já existe **ativo** (`deleted_at IS NULL`) — isso não muda. |
