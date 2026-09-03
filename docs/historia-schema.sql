-- ============================================================
-- História da Empresa — schema para o banco da API externa
-- (api-test.acosvital.com.br).
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
-- TABLE: historia
-- Linha única (singleton, id sempre = 1) com o texto/vídeo
-- principais da página "Nossa História".
-- ============================================================
CREATE TABLE IF NOT EXISTS historia (
  id         smallint                 NOT NULL DEFAULT 1,
  titulo     varchar(200)             NOT NULL DEFAULT 'Nossa História',
  texto      text                     NOT NULL DEFAULT '',
  video_url  text,
  updated_at timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT pk_historia PRIMARY KEY (id),
  CONSTRAINT ck_historia_singleton CHECK (id = 1)
);

INSERT INTO historia (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TABLE: historia_imagens
-- Galeria de imagens da página (N imagens).
-- `ordem` é só para a API devolver a lista sempre na mesma
-- ordem em que o admin cadastrou — não é exposta pra fora.
-- ============================================================
CREATE TABLE IF NOT EXISTS historia_imagens (
  id         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  url        text                     NOT NULL,
  legenda    varchar(255),
  ordem      integer                  NOT NULL DEFAULT 0,
  created_at timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT pk_historia_imagens PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_historia_imagens_ordem ON historia_imagens (ordem);

-- ============================================================
-- TABLE: historia_timeline
-- Marcos da linha do tempo (N eventos, um por ano/título).
-- ============================================================
CREATE TABLE IF NOT EXISTS historia_timeline (
  id         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  ano        smallint                 NOT NULL,
  titulo     varchar(200)             NOT NULL,
  descricao  text,
  imagem_url text,
  created_at timestamptz              NOT NULL DEFAULT now(),
  updated_at timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT pk_historia_timeline PRIMARY KEY (id),
  CONSTRAINT ck_historia_timeline_ano CHECK (ano > 1000 AND ano < 3000)
);

CREATE INDEX IF NOT EXISTS idx_historia_timeline_ano ON historia_timeline (ano);

-- ============================================================
-- CONTRATO REST esperado pelo app Next.js (src/lib/apiClient.ts)
-- Base: https://api-test.acosvital.com.br  (header x-api-key já
-- é enviado pelo apiClient — nada extra a configurar do lado do app)
--
-- GET /historia
--   → 200 { titulo, texto, video_url, updated_at,
--            imagens:  [{ id, url, legenda }],
--            timeline: [{ id, ano, titulo, descricao, imagem_url }] }
--   (imagens ordenadas por `ordem`; timeline ordenada por `ano`)
--
-- PUT /historia
--   body: { titulo, texto, video_url,
--            imagens:  [{ url, legenda }],
--            timeline: [{ ano, titulo, descricao, imagem_url }] }
--   → substitui historia (linha id=1) + apaga e recria todas as
--      linhas de historia_imagens / historia_timeline a partir
--      dos arrays recebidos (mesma ideia de "replace all" já
--      usada em outros cadastros simples desta API).
--   → 200 com o mesmo shape do GET, já atualizado.
-- ============================================================
