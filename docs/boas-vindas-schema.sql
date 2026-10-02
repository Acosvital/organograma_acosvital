-- ============================================================
-- Tela de boas-vindas pós-login — schema para o banco da API
-- externa (api-test.acosvital.com.br).
--
-- Todo dado de negócio deste projeto mora nesse banco (Postgres),
-- atrás da API — não há mais banco/serviço Supabase envolvido.
-- Rode isso no banco que alimenta a API, e implemente lá os
-- endpoints REST descritos no final deste arquivo.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLE: welcome_presets
-- Um preset por empresa visitante (nome + logo + gradiente de
-- fundo nas cores da marca do visitante). Cadastrados e editados
-- pelo admin em /admin/boas-vindas; nenhum é exibido diretamente
-- — welcome_settings.active_preset_id decide qual (se algum)
-- está em exibição no momento.
-- ============================================================
CREATE TABLE IF NOT EXISTS welcome_presets (
  id           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  nome_cliente varchar(100)             NOT NULL,
  logo_url     text,
  cor_inicio   char(7),
  cor_fim      char(7),
  created_at   timestamptz              NOT NULL DEFAULT now(),
  updated_at   timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT pk_welcome_presets PRIMARY KEY (id),
  CONSTRAINT ck_welcome_presets_cor_inicio CHECK (cor_inicio IS NULL OR cor_inicio ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_welcome_presets_cor_fim    CHECK (cor_fim    IS NULL OR cor_fim    ~ '^#[0-9A-Fa-f]{6}$')
);

-- ============================================================
-- TABLE: welcome_settings
-- Linha única (singleton, id sempre = 1). Controla se a tela de
-- boas-vindas intercepta o login (`enabled`) e, se sim, qual
-- preset está ativo (`active_preset_id` = null → mostra "Bem-
-- vindo" genérico, sem nome/logo de empresa).
-- ============================================================
CREATE TABLE IF NOT EXISTS welcome_settings (
  id               smallint                 NOT NULL DEFAULT 1,
  enabled          boolean                  NOT NULL DEFAULT true,
  active_preset_id uuid                     REFERENCES welcome_presets(id) ON DELETE SET NULL,
  updated_at       timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT pk_welcome_settings PRIMARY KEY (id),
  CONSTRAINT ck_welcome_settings_singleton CHECK (id = 1)
);

INSERT INTO welcome_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CONTRATO REST esperado pelo app Next.js (src/lib/apiClient.ts)
-- Base: https://api-test.acosvital.com.br  (header x-api-key já
-- é enviado pelo apiClient — nada extra a configurar do lado do app)
--
-- GET /welcome-presets
--   → 200 [{ id, nome_cliente, logo_url, cor_inicio, cor_fim, created_at, updated_at }, ...]
--   (sem paginação — lista pequena, poucas dezenas no máximo)
--   (cor_inicio/cor_fim no formato hex "#RRGGBB", podem vir null)
--
-- POST /welcome-presets
--   body: { nome_cliente, logo_url?, cor_inicio?, cor_fim? }
--   → 201 { id, nome_cliente, logo_url, cor_inicio, cor_fim, created_at, updated_at }
--   → 422 se cor_inicio ou cor_fim vierem fora do formato "#RRGGBB"
--
-- PUT /welcome-presets/:id
--   body: { nome_cliente?, logo_url?, cor_inicio?, cor_fim? }   (campos omitidos não mudam)
--   → 200 { id, nome_cliente, logo_url, cor_inicio, cor_fim, created_at, updated_at }
--   → 404 se id não existir
--   → 422 se cor_inicio ou cor_fim vierem fora do formato "#RRGGBB"
--
-- DELETE /welcome-presets/:id
--   → 200 { ok: true }  (ou 204)
--   → 404 se id não existir
--   → se este preset estava ativo em welcome_settings, o backend
--      deve zerar active_preset_id (ON DELETE SET NULL já cobre
--      isso automaticamente via FK)
--
-- GET /welcome-settings
--   → 200 { enabled, active_preset_id, updated_at }
--
-- PUT /welcome-settings
--   body: { enabled?, active_preset_id? }   (campos omitidos não mudam)
--   → 200 { enabled, active_preset_id, updated_at }
--   → 422 se active_preset_id for informado e não existir em welcome_presets
-- ============================================================
