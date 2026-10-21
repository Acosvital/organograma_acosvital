# Contrato: coluna `ordem` no dicionário de níveis + nível 13 (Diretoria Executiva)

Pedido ao DBA / dono da API externa. Complementa `organograma-integridade-schema.md`, item 1 (`core_organograma.nivel_hierarquico`).

## Por que

O organograma precisa de um anel entre a **Diretoria** (centro) e a **Gerência Geral**, ocupado por pessoas que valem para todas as empresas: a **Diretoria Executiva** (hoje: Everaldo Oliveira de Souza e Sérgio Vital).

Os níveis 0 a 12 já estão todos em uso, e `nivel` é compartilhado com o av-hub (`core.cargos.nvl_permissao`). Renumerar tudo para abrir um espaço entre 0 e 1 mexeria em ~107 cargos, no nível dos setores, na view, em `fn_default_parent_pessoa` e em constantes dos dois frontends, num deploy só.

A saída é separar as duas coisas:

- `nivel` continua sendo **só o identificador** estável do nível (e o valor de `nvl_permissao`). A Diretoria Executiva entra como **`nivel = 13`**.
- **`ordem`** (coluna nova) define a posição do nível na hierarquia, para qualquer tela que liste ou ordene níveis (selects, legendas, listas). A Diretoria Executiva tem `ordem = 5`, entre a Diretoria (0) e a Gerência Geral (10).

Sem isso, a API devolve os níveis ordenados por `nivel` e a Diretoria Executiva apareceria **depois de Aprendiz** em qualquer lista.

---

## 1. Coluna `ordem` e nível 13

`ordem` é um inteiro com folga (múltiplos de 10), para um nível futuro entrar entre dois existentes sem renumerar nada. Número menor = mais alto na hierarquia.

```sql
ALTER TABLE core_organograma.nivel_hierarquico
  ADD COLUMN IF NOT EXISTS ordem integer;

-- Níveis existentes: ordem = nivel * 10 (0, 10, 20, ... 120).
UPDATE core_organograma.nivel_hierarquico
   SET ordem = nivel * 10
 WHERE ordem IS NULL;

-- Nível novo: Diretoria Executiva, entre a Diretoria (0) e a Gerência Geral (10).
INSERT INTO core_organograma.nivel_hierarquico (nivel, nome, cor, categoria, ordem) VALUES
  (13, 'Diretoria Executiva', '#f43f5e', 'pessoa', 5)
ON CONFLICT (nivel) DO NOTHING;

ALTER TABLE core_organograma.nivel_hierarquico
  ALTER COLUMN ordem SET NOT NULL,
  ADD CONSTRAINT uq_nivel_hierarquico_ordem UNIQUE (ordem);

COMMENT ON COLUMN core_organograma.nivel_hierarquico.ordem IS
  'Posição do nível na hierarquia (menor = mais alto). Separada de "nivel", que é só o identificador (= core.cargos.nvl_permissao) e não muda. Dá pra encaixar um nível novo entre dois existentes escolhendo uma ordem intermediária, sem renumerar cargos. Telas devem ordenar por esta coluna.';
```

A cor `#f43f5e` é só uma sugestão (rosa, que nenhum outro nível usa); o RH pode trocar depois por `PUT /niveis_hierarquicos/13`.

## 2. `core.cargos.nvl_permissao` aceita o 13

Se o item 5 do contrato de integridade (FK `nvl_permissao → nivel_hierarquico.nivel`) já estiver aplicado, o 13 passa a valer assim que a linha do item 1 existir. Se houver um `CHECK` de faixa (por exemplo `BETWEEN 0 AND 12`), ele precisa ser ampliado.

## 3. View `core_organograma.vw_org_nodes`

Duas mudanças, as duas dentro de `pessoas_nodes`:

**3.1. Teto do nível.** Hoje o nível da pessoa é limitado em 12 (`LEAST(12, c.nivel::integer)`); um cargo 13 apareceria como Aprendiz. Passa a:

```sql
ELSE GREATEST(0, LEAST(13, c.nivel::integer))
```

(nos dois lugares onde essa expressão aparece: o `level` e o `CASE` do `sector_director_of`).

**3.2. Pai de quem é nível 13.** A Diretoria Executiva é global: não pertence a setor nenhum. Sem tratamento, a pessoa cai em `fn_default_parent_pessoa(f.id)` e fica pendurada no setor onde está cadastrada, aparecendo dentro da tela desse setor. O pai passa a ser a Diretoria principal, igual ao que já é feito para o nível 1:

```sql
WHEN c.nivel = 13 THEN
  CASE WHEN (SELECT id FROM primary_director) IS NOT NULL
       THEN 'rh-' || (SELECT id::text FROM primary_director)
       ELSE NULL::text END
```

(entra no `CASE` de `parent_id`, ao lado do `WHEN c.nivel = 1`).

## 4. API

| Rota | Mudança |
| --- | --- |
| `GET /niveis_hierarquicos` | Ganha o campo `ordem` em cada item e passa a vir **ordenada por `ordem`**. Shape: `{ nivel, nome, cor, categoria, ordem, ativo }[]`. |
| `POST /niveis_hierarquicos` | Aceita `ordem` (obrigatório, único). |
| `PUT /niveis_hierarquicos/{nivel}` | Aceita editar `ordem`. |

Compatibilidade: os dois frontends tratam `ordem` ausente como `ordem = nivel * 10`, então o deploy dos frontends pode ir antes ou depois da API sem quebrar.

## 5. Cadastro depois do banco pronto

1. No Hub, em Cadastros → Auxiliares → Cargos, criar **um cargo por empresa** (o nome só é único dentro de uma `codigo_empresa`), por exemplo "Diretor de Área", com Nível Hierárquico **Diretoria Executiva**. Um na Aços Vital (Everaldo) e outro na HRM (Sérgio).
2. Trocar o cargo de cada pessoa. Um gatilho propaga o nível do cargo, exceto para quem tem `nvl_manual = true`.
3. O organograma passa a mostrar o anel sozinho, em **todas** as empresas, não importa onde a pessoa está cadastrada.

## Validação sugerida

```sql
-- Ordem única e níveis em sequência hierárquica esperada
SELECT nivel, nome, ordem FROM core_organograma.nivel_hierarquico ORDER BY ordem;
-- Esperado: 0 Diretoria (0), 13 Diretoria Executiva (5), 1 Gerência Geral (10), 2 Setor (20) ... 12 Aprendiz (120)

-- Quem deve estar no anel depois do cadastro
SELECT id, name, role, level, parent_id FROM core_organograma.vw_org_nodes WHERE level = 13;
-- Esperado: parent_id = 'rh-<id da Diretoria principal>' para todos
```
