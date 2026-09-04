-- ============================================================
-- Correção da hierarquia do organograma — contrato para a API
-- externa (banco avhub_prd_db, schemas core / core_organograma).
--
-- Resolve 4 problemas confirmados em produção em 2026-09-03:
--
--   1. Setor/funcionário criado sem node correspondente fica
--      invisível no organograma, silenciosamente (confirmado ao
--      vivo: setor "Vendas" e funcionário "Diego Arantes" sem
--      node). Causa raiz: a criação do node depende de código de
--      aplicação (services/rh/organogramaNodes.ts no av-hub)
--      lembrar de chamar a rotina certa; não há garantia no banco.
--
--   2. Funcionário desligado (data_desligamento preenchida)
--      continua aparecendo no organograma pra sempre — a view
--      atual nunca checa esse campo.
--
--   3. Nível 12 (Aprendiz) é cortado pra 11 na view (LEAST(11,…))
--      — mistura visualmente com nível 11 (Auxiliar/Estagiário).
--
--   4. "Quem é o diretor principal" (quando há 2+ pessoas de
--      nível 0 ao mesmo tempo) é decidido por ordem de UUID —
--      determinístico, mas é acidente de quem foi cadastrado
--      primeiro, não uma decisão de negócio real.
--
-- Desenho: em vez de depender de uma tabela preenchida à mão pra
-- TUDO, o parent_id passa a ser CALCULADO por padrão (mesma regra
-- que já existe em av-hub/services/rh/organogramaNodes.ts:
-- recomputeSectorHierarchy — nível mais alto do setor reporta ao
-- setor, os demais reportam ao nível imediatamente acima, round-
-- robin em caso de empate). A tabela `core_organograma.node`
-- continua existindo e funcionando exatamente como hoje — só
-- passa a ser tratada como OVERRIDE opcional (a função "Reporta a"
-- já usa e vai continuar usando essa tabela do jeito que é hoje,
-- nenhum endpoint de escrita muda). Sem override, o valor
-- calculado é usado. Sem dado nenhum some — o padrão sempre existe.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

-- ============================================================
-- 1) Campo explícito pra decidir quem é o diretor "principal"
--    (o que fica sozinho no centro; os demais viram co-diretor,
--    mesclados pelo frontend). Substitui a inferência por UUID.
-- ============================================================
ALTER TABLE core.funcionarios
  ADD COLUMN IF NOT EXISTS diretor_principal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN core.funcionarios.diretor_principal IS
  'Marca explicitamente qual diretor (cargo nível 0) fica como raiz única do organograma quando há mais de um ao mesmo tempo. No máximo um funcionário pode ter true (ver índice único abaixo). Se nenhum tiver true, a view cai de volta no critério antigo (mais antigo por id) — nunca fica sem raiz.';

-- Garante no máximo 1 diretor principal por vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_diretor_principal
  ON core.funcionarios (diretor_principal)
  WHERE diretor_principal;

-- ============================================================
-- 2) Função: parent_id PADRÃO de uma pessoa de nível de setor
--    (nível ≥ 4), quando não há override em core_organograma.node.
--    Mesma regra do av-hub (recomputeSectorHierarchy):
--      - nível mais alto do setor → reporta ao setor
--      - demais → reportam ao nível imediatamente acima,
--        distribuído em round-robin se houver mais de uma pessoa
--        nesse nível superior
-- ============================================================
CREATE OR REPLACE FUNCTION core_organograma.fn_default_parent_pessoa(p_funcionario_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id_setor        uuid;
  v_nivel           integer;
  v_nivel_superior  integer;
  v_superiores      uuid[];
  v_pos             integer;
BEGIN
  SELECT f.id_setor, c.nvl_permissao
  INTO v_id_setor, v_nivel
  FROM core.funcionarios f
  JOIN core.cargos c ON c.id = f.id_cargo
  WHERE f.id = p_funcionario_id AND f.data_desligamento IS NULL;

  IF v_id_setor IS NULL OR v_nivel < 4 THEN
    RETURN NULL; -- diretoria/gerência geral não têm "setor pai" por essa regra
  END IF;

  -- nível elegível mais próximo ACIMA desta pessoa, no mesmo setor
  -- (MAX, não MIN: queremos o grupo imediatamente anterior na ordem
  -- ascendente de níveis presentes, não o nível mais alto do setor)
  SELECT MAX(c2.nvl_permissao) INTO v_nivel_superior
  FROM core.funcionarios f2
  JOIN core.cargos c2 ON c2.id = f2.id_cargo
  WHERE f2.id_setor = v_id_setor
    AND f2.data_desligamento IS NULL
    AND c2.nvl_permissao >= 4
    AND c2.nvl_permissao < v_nivel;

  IF v_nivel_superior IS NULL THEN
    RETURN v_id_setor::text; -- é o nível mais alto do setor
  END IF;

  SELECT array_agg(f3.id ORDER BY f3.id) INTO v_superiores
  FROM core.funcionarios f3
  JOIN core.cargos c3 ON c3.id = f3.id_cargo
  WHERE f3.id_setor = v_id_setor
    AND f3.data_desligamento IS NULL
    AND c3.nvl_permissao = v_nivel_superior;

  SELECT count(*) INTO v_pos
  FROM core.funcionarios f4
  JOIN core.cargos c4 ON c4.id = f4.id_cargo
  WHERE f4.id_setor = v_id_setor
    AND f4.data_desligamento IS NULL
    AND c4.nvl_permissao = v_nivel
    AND f4.id < p_funcionario_id; -- posição determinística dentro do próprio grupo

  RETURN v_superiores[(v_pos % array_length(v_superiores, 1)) + 1]::text; -- array é 1-based
END;
$$;

-- ============================================================
-- 3) View corrigida — substitui core_organograma.vw_org_nodes.
--    Mudanças em relação à atual:
--      - filtra f.data_desligamento IS NULL (item 2)
--      - LEAST(12, …) em vez de LEAST(11, …) (item 3)
--      - primary_director prioriza diretor_principal = true,
--        cai pro critério antigo (menor id) só se ninguém marcou
--        (item 4 — nunca fica sem raiz)
--      - parent_id de pessoa nível ≥ 4 vira
--        COALESCE(override, fn_default_parent_pessoa(...)) em vez
--        de exigir uma linha em core_organograma.node (item 1)
--      - node continua existindo e sendo usado — agora como
--        override opcional, via LEFT JOIN em vez de JOIN
-- ============================================================
CREATE OR REPLACE VIEW core_organograma.vw_org_nodes AS
WITH cargos_data AS (
  SELECT id, nome, nvl_permissao AS nivel FROM core.cargos
),
primary_director AS (
  SELECT f.id
  FROM core.funcionarios f
  JOIN cargos_data c ON f.id_cargo = c.id
  WHERE c.nivel = 0 AND f.data_desligamento IS NULL
  ORDER BY f.diretor_principal DESC, f.id ASC
  LIMIT 1
),
gm_unique AS (
  SELECT f.id
  FROM core.funcionarios f
  JOIN cargos_data c ON f.id_cargo = c.id
  WHERE c.nivel = 1 AND f.data_desligamento IS NULL
  LIMIT 1
),
pessoas_nodes AS (
  SELECT
    f.id::text AS id,
    f.nome_completo AS name,
    c.nome AS role,
    CASE
      WHEN c.nivel = 0 AND f.id = (SELECT id FROM primary_director) THEN 0
      WHEN c.nivel = 0 THEN 4
      ELSE GREATEST(0, LEAST(12, c.nivel::integer))
    END AS level,
    COALESCE(
      ov.parent_id,
      CASE
        WHEN c.nivel = 0 AND f.id = (SELECT id FROM primary_director) THEN NULL::text
        WHEN c.nivel = 0 THEN f.id_setor::text  -- co-diretor sem override: cai no próprio setor até alguém setar "Reporta a"
        WHEN c.nivel = 1 THEN
          CASE WHEN (SELECT id FROM primary_director) IS NOT NULL
               THEN 'rh-' || (SELECT id::text FROM primary_director)
               ELSE NULL::text END
        ELSE core_organograma.fn_default_parent_pessoa(f.id)
      END
    ) AS parent_id,
    false AS is_sector,
    f.photo_url,
    NULL::text AS sector_color,
    CASE
      WHEN (CASE WHEN c.nivel = 0 AND f.id = (SELECT id FROM primary_director) THEN 0
                 WHEN c.nivel = 0 THEN 4
                 ELSE GREATEST(0, LEAST(12, c.nivel::integer)) END) = 4
      THEN COALESCE(ov.parent_id, core_organograma.fn_default_parent_pessoa(f.id))
      ELSE NULL::text
    END AS sector_director_of,
    f.id::text AS id_ent
  FROM core.funcionarios f
  JOIN cargos_data c ON c.id = f.id_cargo
  LEFT JOIN core_organograma.node ov
    ON ov.id_ent = f.id::text AND ov.is_sector = false AND ov.deleted_at IS NULL
  WHERE f.data_desligamento IS NULL
),
setores_nodes AS (
  SELECT
    s.id::text AS id,
    s.nome AS name,
    COALESCE(s.sigla, '') AS role,
    s.nivel AS level,
    COALESCE(
      ov.parent_id,
      s.parent_id::text,
      'rh-' || COALESCE((SELECT id::text FROM gm_unique), (SELECT id::text FROM primary_director))
    ) AS parent_id,
    true AS is_sector,
    NULL::text AS photo_url,
    s.cor_setor AS sector_color,
    NULL::text AS sector_director_of,
    s.id::text AS id_ent
  FROM core.setores s
  LEFT JOIN core_organograma.node ov
    ON ov.id_ent = s.id::text AND ov.is_sector = true AND ov.deleted_at IS NULL
  WHERE s.ativo = true
)
SELECT * FROM pessoas_nodes
UNION ALL
SELECT * FROM setores_nodes
ORDER BY level, is_sector DESC, name;

-- ============================================================
-- CONTRATO REST — o que muda pra quem consome a API
-- ============================================================
--
-- GET /vw_organograma_nodes (ou como a rota que expõe essa view
--   for chamada) — mesmo shape de sempre, SEM mudança de contrato.
--   Só o CONTEÚDO muda: desligados somem, nível 12 aparece
--   corretamente, setor/funcionário novo aparece mesmo sem
--   ninguém ter criado node manualmente.
--
-- POST/PUT/DELETE /organograma_nodes — SEM MUDANÇA NENHUMA. A
--   função "Reporta a" do av-hub continua gravando ali do jeito
--   que já grava hoje; a tabela agora é lida como override
--   opcional em vez de obrigatória, mas o formato e o comportamento
--   de escrita são idênticos.
--
-- PUT /funcionarios/{id} — aceita o novo campo `diretor_principal`
--   (boolean, opcional) no body. REGRA DE NEGÓCIO IMPORTANTE pro
--   backend: setar diretor_principal=true precisa, na mesma
--   transação, desmarcar quem tinha true antes (senão o índice
--   único abaixo rejeita a escrita) — não é responsabilidade do
--   banco fazer esse "swap" sozinho.
-- ============================================================
