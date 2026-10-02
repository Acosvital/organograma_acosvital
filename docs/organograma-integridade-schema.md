# Regras de integridade do organograma — contrato para a API externa

**Banco:** `avhub_prd_db`, schemas `core` / `core_organograma`
**Data:** 2026-09-03
**Testado:** consultado ao vivo (somente leitura, nenhuma escrita) contra o banco real pra confirmar que os dados de hoje já passam em todas as regras novas — ver seção "Verificações" no final. O item 6 (sub-nível) foi testado dentro de `BEGIN...ROLLBACK` com dados sintéticos — nada persistido.

## O que este contrato resolve

Lacunas encontradas inspecionando o schema real e o código do av-hub: coisas que hoje só funcionam "por disciplina" da aplicação, sem nenhuma garantia do banco.

| #   | Lacuna                                                                                                                                                                | Onde                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Nome/cor/categoria de cada nível hierárquico estão hardcoded no frontend, não no banco                                                                                | `src/data/orgData.ts` do organograma                                                                |
| 2   | `core.setores.parent_id` não tem foreign key nenhuma                                                                                                                  | `core.setores`                                                                                      |
| 3   | Nada impede um sub-setor pertencer a uma unidade diferente da do seu pai                                                                                              | `core.setores`                                                                                      |
| 4   | `cor_setor` é texto livre, sem validação de formato (diferente de `cpf`/`cep` em `funcionarios`, que já têm CHECK nesse mesmo banco)                                  | `core.setores`                                                                                      |
| 5   | `cargos.nvl_permissao` não tem faixa validada — nada impede um cargo com nível inexistente                                                                            | `core.cargos`                                                                                       |
| 6   | Um setor não consegue ter sub-níveis de senioridade (ex.: Analista Júnior 1/2/3, Pleno, Sênior) reportando entre si como mentoria — hoje só existe um nível por faixa | `core.cargos`, `fn_default_parent_pessoa`, **e** `av-hub/services/rh/organogramaNodes.ts` (ver 6.1) |

Nenhuma dessas mudanças altera o comportamento de escrita hoje — são travas que só rejeitam dado que já seria um bug se existisse. Todas foram checadas contra o banco real antes: **zero violação encontrada nos dados atuais** (detalhes no final).

---

## 1. Tabela: dicionário de níveis hierárquicos

Hoje nome, cor e categoria de cada nível (0 a 12) estão hardcoded no frontend do organograma. Se a empresa cria um nível novo em `core.cargos.nvl_permissao`, o organograma não sabe o nome nem a cor dele até alguém editar código e fazer deploy — mesmo o cargo já existindo e funcionando normalmente no HUB.

```sql
CREATE TABLE IF NOT EXISTS core_organograma.nivel_hierarquico (
  nivel      integer PRIMARY KEY,
  nome       text NOT NULL,
  cor        text NOT NULL,
  categoria  text NOT NULL CHECK (categoria IN ('estrutural', 'pessoa')),
  ativo      boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE core_organograma.nivel_hierarquico IS
  'Dicionário dos níveis hierárquicos exibidos no organograma. Fonte única de verdade para nome/cor/categoria de cada nível — substitui o dicionário hardcoded que existia no frontend. nivel corresponde a core.cargos.nvl_permissao.';
COMMENT ON COLUMN core_organograma.nivel_hierarquico.categoria IS
  '"estrutural" = nó de Setor/Sub-setor (níveis 2 e 3, sem pessoa associada). "pessoa" = cargo ocupado por funcionário (níveis 0, 1, 4-12).';
COMMENT ON COLUMN core_organograma.nivel_hierarquico.ativo IS
  'Permite desativar um nível sem apagar histórico — nenhum cargo em uso deveria referenciar um nível ativo=false.';

INSERT INTO core_organograma.nivel_hierarquico (nivel, nome, cor, categoria) VALUES
  (0,  'Diretoria',              '#f59e0b', 'pessoa'),
  (1,  'Gerência Geral',         '#3b82f6', 'pessoa'),
  (2,  'Setor',                  '#a78bfa', 'estrutural'),
  (3,  'Sub-setor',              '#7c3aed', 'estrutural'),
  (4,  'Diretor de Setor',       '#f59e0b', 'pessoa'),
  (5,  'Gerência de Setor',      '#6366f1', 'pessoa'),
  (6,  'Coordenação',            '#8b5cf6', 'pessoa'),
  (7,  'Supervisão',             '#d946ef', 'pessoa'),
  (8,  'Líder de Equipe',        '#ec4899', 'pessoa'),
  (9,  'Analista / Técnico',     '#10b981', 'pessoa'),
  (10, 'Assistente / Auxiliar',  '#14b8a6', 'pessoa'),
  (11, 'Auxiliar / Estagiário',  '#06b6d4', 'pessoa'),
  (12, 'Aprendiz',               '#94a3b8', 'pessoa')
ON CONFLICT (nivel) DO NOTHING;
```

**O que fica de fora, de propósito:** o tamanho visual do card (raio) não precisa de coluna aqui. Ele já é calculado no frontend por progressão geométrica entre o maior nível de pessoa e o menor (`SECTOR_NODE_RADIUS` em `src/utils/radialLayout.ts`) — com N níveis nesta tabela, a progressão se redistribui sozinha.

---

## 2. `core.setores.parent_id` sem FK

Confirmado no schema real: essa coluna não tem nenhuma constraint hoje. Um `parent_id` apontando pra um setor apagado, ou pra si mesmo, quebraria a árvore do organograma silenciosamente — e o banco deixaria.

```sql
ALTER TABLE core.setores
  ADD CONSTRAINT ck_core_setores_parent_not_self
  CHECK (parent_id IS NULL OR parent_id <> id);

ALTER TABLE core.setores
  ADD CONSTRAINT fk_core_setores_parent
  FOREIGN KEY (parent_id) REFERENCES core.setores (id);
```

---

## 3. Sub-setor de unidade diferente do pai

Nada impede hoje um setor de "Aços Vital" virar filho de um setor da "HRM Caldeiraria". Como não dá pra expressar "colunas de duas linhas diferentes precisam bater" com um CHECK simples, isso vira um trigger:

```sql
CREATE OR REPLACE FUNCTION core.fn_check_setor_parent_empresa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM core.setores p
    WHERE p.id = NEW.parent_id AND p.codigo_empresa = NEW.codigo_empresa
  ) THEN
    RAISE EXCEPTION 'Setor % não pode ter como pai um setor de outra unidade (codigo_empresa deve ser igual ao do pai)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_core_setores_check_parent_empresa
  BEFORE INSERT OR UPDATE OF parent_id, codigo_empresa ON core.setores
  FOR EACH ROW EXECUTE FUNCTION core.fn_check_setor_parent_empresa();
```

---

## 4. `cor_setor` sem validação de formato

`core.funcionarios.cpf` e `.cep` já têm CHECK de formato nesse mesmo banco — `cor_setor` não, apesar de todo valor em uso hoje já ser um hex válido (`#rrggbb`).

```sql
ALTER TABLE core.setores
  ADD CONSTRAINT ck_core_setores_cor_setor
  CHECK (cor_setor IS NULL OR cor_setor ~ '^#[0-9a-fA-F]{6}$');
```

---

## 5. `cargos.nvl_permissao` sem faixa validada

Hoje é `smallint NOT NULL` sem CHECK nem FK — nada impede cadastrar um cargo com nível `99`, negativo, ou com nível `2`/`3` (reservados para nó estrutural de Setor/Sub-setor, sem pessoa associada). Com a tabela do item 1 criada, a trava vira uma FK — de quebra, garante que todo cargo aponte pra um nível que o organograma sabe exibir:

```sql
ALTER TABLE core.cargos
  ADD CONSTRAINT fk_cargos_nivel_hierarquico
  FOREIGN KEY (nvl_permissao) REFERENCES core_organograma.nivel_hierarquico (nivel);
```

---

## 6. Sub-nível: mentoria dentro do mesmo nível

Um setor pode querer subdividir um nível em faixas de senioridade que reportam entre si — ex.: TI com Analista Júnior 1 → Júnior 2 → Júnior 3 → Pleno → Sênior → Coordenador, todos com o mesmo `nvl_permissao=9` hoje, mas devendo aparecer em anéis diferentes e reportar em cadeia (mentoria real, não só visual).

**Por que não mexer na escala de `nvl_permissao` pra isso:** ela é compartilhada com o resto do HUB e não tem espaço livre entre os níveis hoje. Rescalar tudo pra múltiplos de 10 resolveria, mas exigiria migrar os ~107 cargos existentes e atualizar `vw_org_nodes`, `fn_default_parent_pessoa` e qualquer lógica equivalente no av-hub, tudo num deploy só. Uma coluna nova, isolada, resolve o mesmo problema sem tocar em nada que já existe.

**Boa notícia confirmada no frontend:** o algoritmo de anéis do organograma (`radialLayout.ts`) já não decide o raio pelo nível bruto — ele usa a profundidade real na cadeia de `parent_id` (`effLevel`), só usando o nível bruto como piso de segurança pra um filho nunca cair no mesmo anel do pai. Ou seja: uma vez que a cadeia de mentoria existir via `parent_id`, cada sub-nível já cai automaticamente num anel mais interno que o anterior — **nenhuma mudança de frontend é necessária.**

```sql
ALTER TABLE core.cargos
  ADD COLUMN IF NOT EXISTS sub_nivel smallint NOT NULL DEFAULT 0
  CHECK (sub_nivel BETWEEN 0 AND 9);

COMMENT ON COLUMN core.cargos.sub_nivel IS
  'Desempate de senioridade DENTRO do mesmo nvl_permissao — usado quando um setor subdivide um nível em mentoria (ex.: Analista Júnior 1/2/3, Pleno, Sênior, todos nvl_permissao=9). Convenção igual ao resto da escala: número menor = mais sênior. 0 = padrão (cargo sem subdivisão, ou o mais sênior da faixa se ela vier a ser subdividida). Cargos que não usam sub-níveis nunca precisam tocar nessa coluna.';
```

`fn_default_parent_pessoa` passa a comparar o par `(nvl_permissao, sub_nivel)` em vez de só `nvl_permissao`, tanto pra achar o grupo imediatamente superior quanto pra agrupar o round-robin. Com `sub_nivel=0` pra todo mundo (estado de hoje), o comportamento fica **idêntico** ao atual — testado por regressão abaixo.

```sql
CREATE OR REPLACE FUNCTION core_organograma.fn_default_parent_pessoa(p_funcionario_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id_setor        uuid;
  v_nivel           integer;
  v_sub_nivel       smallint;
  v_sup_nivel       integer;
  v_sup_sub_nivel   smallint;
  v_superiores      uuid[];
  v_pos             integer;
BEGIN
  SELECT f.id_setor, c.nvl_permissao, c.sub_nivel
  INTO v_id_setor, v_nivel, v_sub_nivel
  FROM core.funcionarios f
  JOIN core.cargos c ON c.id = f.id_cargo
  WHERE f.id = p_funcionario_id AND f.data_desligamento IS NULL;

  IF v_id_setor IS NULL OR v_nivel < 4 THEN
    RETURN NULL; -- diretoria/gerência geral não têm "setor pai" por essa regra
  END IF;

  -- par (nível, sub-nível) elegível mais próximo ACIMA desta pessoa, no
  -- mesmo setor. Compara como par ordenado — não só nvl_permissao — pra
  -- sub-níveis de mentoria (ex.: Júnior 1→2→3→Pleno→Sênior) encadearem
  -- entre si em vez de todos caírem juntos no mesmo grupo.
  SELECT c2.nvl_permissao, c2.sub_nivel
  INTO v_sup_nivel, v_sup_sub_nivel
  FROM core.funcionarios f2
  JOIN core.cargos c2 ON c2.id = f2.id_cargo
  WHERE f2.id_setor = v_id_setor
    AND f2.data_desligamento IS NULL
    AND c2.nvl_permissao >= 4
    AND (c2.nvl_permissao, c2.sub_nivel) < (v_nivel, v_sub_nivel)
  ORDER BY c2.nvl_permissao DESC, c2.sub_nivel DESC
  LIMIT 1;

  IF v_sup_nivel IS NULL THEN
    RETURN v_id_setor::text; -- é o par mais alto do setor
  END IF;

  SELECT array_agg(f3.id ORDER BY f3.id) INTO v_superiores
  FROM core.funcionarios f3
  JOIN core.cargos c3 ON c3.id = f3.id_cargo
  WHERE f3.id_setor = v_id_setor
    AND f3.data_desligamento IS NULL
    AND c3.nvl_permissao = v_sup_nivel
    AND c3.sub_nivel = v_sup_sub_nivel;

  SELECT count(*) INTO v_pos
  FROM core.funcionarios f4
  JOIN core.cargos c4 ON c4.id = f4.id_cargo
  WHERE f4.id_setor = v_id_setor
    AND f4.data_desligamento IS NULL
    AND c4.nvl_permissao = v_nivel
    AND c4.sub_nivel = v_sub_nivel
    AND f4.id < p_funcionario_id; -- posição determinística dentro do próprio grupo

  RETURN v_superiores[(v_pos % array_length(v_superiores, 1)) + 1]::text; -- array é 1-based
END;
$$;
```

**Como usar:** o nome específico ("Analista Júnior 1") continua vindo de `cargos.nome`, como qualquer outro cargo — `sub_nivel` não precisa de linha própria no dicionário de níveis (item 1), só reaproveita nome/cor da faixa "Analista / Técnico" inteira.

### Testes realizados (dentro de `BEGIN...ROLLBACK`, nada persistido)

| Cenário                                                                                       | Resultado                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regressão — Financeiro (Elisa, Camila, Analistas, Assistentes), todos com `sub_nivel=0`       | Resultado idêntico ao da função anterior — nenhuma mudança de comportamento                                                                          |
| Setor sintético: Coordenador(6,0) → Sênior(9,0) → Pleno(9,1) → Jr3(9,2) → Jr2(9,3) → Jr1(9,4) | Cadeia resolvida corretamente: Jr1→Jr2→Jr3→Pleno→Sênior→Coordenador→setor, cada um reportando exatamente ao nível de mentoria imediatamente acima ✅ |

## Verificações realizadas (somente leitura, contra o banco real)

| Checagem                                                            | Resultado                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sub-setor com `parent_id` inexistente ou igual ao próprio `id`      | 0 encontrados                                                             |
| Sub-setor com `codigo_empresa` diferente do pai                     | 0 encontrados                                                             |
| Valores de `cor_setor` em uso que não batem com `^#[0-9a-fA-F]{6}$` | 0 encontrados (19 cores distintas, todas hex válido)                      |
| Valores de `nvl_permissao` em uso hoje                              | `0, 1, 4, 5, 6, 8, 9, 10, 11, 12` — todos já cobertos pelo seed do item 1 |

Ou seja: as 5 constraints podem ser aplicadas hoje sem quebrar nenhum dado existente.

---

## Contrato REST — o que muda pra quem consome a API

| Rota                               | Mudança                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /niveis_hierarquicos`         | **Nova.** Retorna o dicionário completo (item 1), ordenado por `nivel`. Sem paginação — tabela pequena, lida inteira de uma vez. Shape: `{ nivel, nome, cor, categoria, ativo }[]`.                                                                            |
| `POST /niveis_hierarquicos`        | Nova, opcional. Cria um nível: `{ nivel, nome, cor, categoria }`.                                                                                                                                                                                              |
| `PUT /niveis_hierarquicos/{nivel}` | Nova, opcional. Edita `nome`/`cor`/`categoria`/`ativo`.                                                                                                                                                                                                        |
| `POST` / `PUT /setores`            | **Sem mudança de shape.** Passa a poder rejeitar a escrita (erro do banco) se `parent_id` for inválido, autorreferente, ou de outra unidade, ou se `cor_setor` não for hex válido — a aplicação deve tratar esses erros e devolver mensagem clara pro usuário. |
| `POST` / `PUT /cargos`             | Ganha o campo opcional `sub_nivel` (smallint, 0-9, default 0). Sem mudança de shape além disso. Passa a rejeitar `nvl_permissao` que não exista no dicionário do item 1.                                                                                       |
| `GET /vw_organograma_nodes`        | Sem mudança nenhuma — `sub_nivel` é só um detalhe de cálculo do `parent_id` calculado, não precisa aparecer na view.                                                                                                                                           |

---

## Trabalho pendente no frontend (depois que `GET /niveis_hierarquicos` existir)

Não faz parte deste contrato de banco, mas fica registrado:

### No organograma

1. `src/data/orgData.ts` deixa de exportar `levelNames`/`levelColors` fixos — passam a vir da API (com cache, já que o dicionário muda raramente).
2. `src/utils/radialLayout.ts` deixa de assumir "Diretor de Setor = nível 4" e "Aprendiz = nível 12" como constantes fixas — passa a descobrir o menor e o maior nível de categoria `pessoa` presentes no dicionário e monta a progressão geométrica entre eles dinamicamente.

### No av-hub

O av-hub tem o mesmo problema (dicionário duplicado, ver 6.1) e deveria migrar junto, não só o organograma:

3. `app/(protected)/cadastros/auxiliares/cargos/types.ts` — `NIVEIS_HIERARQUICOS` hardcoded é substituído por um fetch em `GET /niveis_hierarquicos` (com cache).
4. `app/(protected)/cadastros/auxiliares/cargos/page.tsx` usa esse dicionário em dois lugares: o `<Select>` de "Nível Hierárquico" no formulário e a exibição de nome do nível na tabela/lista. Os dois passam a ler do dicionário vindo da API.
5. O `<Select>` do formulário passa a **filtrar explicitamente `categoria === 'pessoa'`** — hoje níveis 2/3 (Setor/Sub-setor) simplesmente não aparecem por estarem ausentes do dicionário hardcoded (omissão manual); com a tabela, isso vira um filtro de verdade, não um "esquecimento que por acaso está certo".
6. O mesmo formulário ganha o campo `sub_nivel` (ver 6.1) — só relevante pra quem for cadastrar um cargo de mentoria.

---

## 7. Divergências entre o OpenAPI oficial (v5.0.0) e a realidade

Comparando o spec OpenAPI real da API (`API Interna — Aços Vital`, versão `5.0.0`) com o banco e com o código dos dois frontends. Não são lacunas de banco como os itens 1-6 — são pontos de desalinhamento entre **documentação, API e aplicações**, registrados aqui porque afetam diretamente como organograma e av-hub se comunicam com a API (e entre si, indiretamente).

### 7.1 `id_setor` em `Cargo` — confirmado, não é problema

Investigação inicial usou um export desatualizado do spec (sem `id_setor` em `CargoCreate`), o que sugeria que o campo "Setor" no formulário de Cargo do av-hub não persistia nada. **Corrigido**: no spec atual (v5.0.0), `CargoCreate` exige `id_setor` junto com `codigo_empresa`, com a regra de negócio documentada: _"Cargo com id_setor nulo (legado) é invisível para usuário restrito por setor."_ Cargo é escopado por setor de verdade — a tela do av-hub está certa. Fica registrado só pra não reabrir essa dúvida depois.

### 7.2 `cargos.nvl_permissao` documentado como 1-10, mas dados reais usam 0-12

O schema `CargoBase.nvl_permissao` declara `minimum: 1, maximum: 10` — e isso **não é doc velha**: confirmado presente na versão atual (5.0.0) também. Só que a Diretoria usa nível `0` e o Aprendiz usa nível `12`, ambos fora da faixa documentada, e ambos já em produção. Ou a doc nunca foi atualizada quando os níveis 0 e 11/12 entraram em uso, ou a API nunca validou esse campo de acordo com o que documenta.

**Por que isso importa pro item 5 deste contrato:** reforça que a faixa válida não deve ficar hardcoded em lugar nenhum (nem `1-10`, nem `0-12`) — a FK pra `nivel_hierarquico` (item 5) já resolve isso corretamente, validando contra o dicionário real em vez de um número mágico que, como este achado mostra, já está desatualizado na própria doc oficial.

### 7.3 `GET /cargos` não documenta os filtros `id_setor` e `nome`

O spec só lista `ativo` e `codigo_empresa` como parâmetros aceitos em `GET /cargos`. O av-hub (`app/api/cargos/route.ts`) encaminha também `nome` e `id_setor` como filtros pra API externa. Com `id_setor` confirmado como campo real (7.1), o mais provável é que a API já aceite esses filtros e a documentação é que ficou incompleta — mas vale uma confirmação rápida com quem mantém a API, porque se não forem aceitos de verdade, os filtros de "Setor" e a busca por nome na tela de Cargos do av-hub não fazem nada server-side (a paginação viria sem filtro nenhum aplicado).

### 7.4 `PUT /cargos/{id}` diz "propaga nvl_permissao para usuários do cargo"

O resumo da rota no spec (v5.0.0) é literalmente: _"Atualiza um cargo (propaga nvl_permissao para usuários do cargo)"_. Isso sugere que `nvl_permissao` tem algum efeito sobre registros de `usuarios` ao editar um cargo — possivelmente ligado a controle de acesso, possivelmente só a um campo de exibição. Não foi investigado mais a fundo (fora do escopo deste contrato) — fica registrado pra quem for mexer em `nvl_permissao` no futuro confirmar se esse efeito colateral existe e o que ele faz antes de assumir que o campo é de uso exclusivo do organograma.
