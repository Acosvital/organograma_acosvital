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
-- CONTRATO REST — usado hoje só para leitura pelo app Next.js
-- (src/lib/apiClient.ts, GET apenas) e, a partir de agora, para
-- leitura E escrita por uma tela de cadastro externa (outro app,
-- mantido por outro dev). Base: https://api-test.acosvital.com.br
-- — autenticação via header x-api-key em toda chamada.
--
-- Até este refactor, título/texto/vídeo/timeline eram validados
-- numa rota interna do Next.js (PUT /api/historia) antes de repassar
-- pra cá com PUT /historia. Essa rota foi removida (gestão passou
-- a ser externa), então as validações abaixo — que só existiam lá —
-- precisam passar a ser responsabilidade desta API.
--
-- GET /historia
--   → 200 { titulo, texto, video_url, updated_at,
--            imagens:  [{ id, url, legenda }],
--            timeline: [{ id, ano, titulo, descricao, imagem_url }] }
--   (imagens ordenadas por `ordem`; timeline ordenada por `ano`)
--   Observação para a tela externa: não existe campo dedicado de
--   "imagem de fundo" — por convenção esta API reaproveita a 1ª
--   posição do array `imagens` (imagens[0].url) como foto de fundo
--   da página pública. As demais posições do array não são usadas
--   hoje (galeria antiga, removida da tela pública).
--
-- PUT /historia
--   body: { titulo, texto, video_url,
--            imagens:  [{ url, legenda }],
--            timeline: [{ ano, titulo, descricao, imagem_url }] }
--   → substitui historia (linha id=1) + apaga e recria todas as
--      linhas de historia_imagens / historia_timeline a partir
--      dos arrays recebidos (mesma ideia de "replace all" já
--      usada em outros cadastros simples desta API — a tela sempre
--      reenvia o objeto completo, não só o campo alterado).
--   → 200 com o mesmo shape do GET, já atualizado.
--   Validações a implementar (antes feitas no Next.js, hoje sem dono):
--     - titulo: obrigatório, não-vazio depois de trim → 422 se faltar
--     - video_url: opcional; se vier preenchido, deve ser uma URL de
--        vídeo do YouTube (watch?v=, youtu.be/, /shorts/, /embed/) ou
--        Vimeo (vimeo.com/<id numérico> ou player.vimeo.com/video/<id>)
--        → 422 "Link de vídeo inválido" se não reconhecer o formato
--     - imagens[].url: se presente, deve ser uma URL já existente no
--        bucket organograma-prd-historia (isto é, devolvida por um
--        POST /historia/upload anterior) — a tela nunca deve poder
--        gravar uma URL arbitrária de fora deste bucket
--     - timeline[].titulo: obrigatório por item → 422 se algum vier vazio
--     - timeline[].ano: obrigatório, inteiro, 1001–2999 → 422 se fora da
--        faixa (mesmo intervalo já garantido pela CHECK da tabela)
--
-- POST /historia/upload   (multipart/form-data, campo "file")
--   Sobe a imagem de fundo ou a de um card da timeline. Antes disso
--   era feito por uma rota interna do Next.js falando direto com o
--   S3/SeaweedFS; a tela agora é externa e não deve receber
--   credenciais de infraestrutura, então o upload passa a viver
--   aqui, escrevendo no mesmo bucket já usado pelas imagens
--   existentes de história.
--   Validações (mesmas usadas antes internamente):
--     - Content-Type do arquivo: image/png, image/jpeg ou image/webp
--        → 400 "Formato de imagem não suportado" nos demais casos
--     - Tamanho máximo: 8MB → 413 se maior
--     - Conteúdo real do arquivo deve bater com o Content-Type
--        declarado (checar magic bytes, não confiar só na extensão
--        ou no header enviado pelo cliente) → 400 se não bater
--   → 201 { url }
--      url = <endpoint S3>/organograma-prd-historia/uploads/<uuid>.<ext>
--      (bucket "organograma-prd-historia" já existente — mesmo lugar
--       onde já estão as imagens atuais de história; gera um novo
--       objeto a cada upload, nunca sobrescreve um existente)
--
-- DELETE /historia/upload
--   body: { url }
--   → remove do S3 uma imagem que a tela trocou/removeu antes de
--      salvar, pra não acumular objeto órfão no bucket
--   → 200 { ok: true } (idempotente: 200 mesmo se o objeto já não existir)
--   → 400 se a url não pertencer ao bucket "organograma-prd-historia"
--      ou não seguir o formato "uploads/<uuid>.<ext>" gerado por este
--      próprio endpoint (nunca aceitar excluir por chave arbitrária)
-- ============================================================
