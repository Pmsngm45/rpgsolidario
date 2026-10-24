
-- RPG Nexus: rode este arquivo uma vez no SQL Editor do Neon (ou psql).

-- A API também cria a tabela sozinha se ela não existir; rodar aqui só adianta.

CREATE TABLE IF NOT EXISTS records (
    kind        text        NOT NULL,              -- characters | npcs | markers | combatants | placements
    id          text        NOT NULL,
    name        text,
    universe    text,
    data        jsonb       NOT NULL DEFAULT '{}', -- ficha completa (poderes, técnicas, atributos...)
    image       text,                              -- imagem JPEG em data URL (base64)
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS records_kind_updated_idx
ON records (kind, updated_at);

-- Visões opcionais para consultar os dados com facilidade

CREATE OR REPLACE VIEW personagens AS
SELECT
    id,
    name AS nome,
    universe AS universo,
    data->>'origin' AS origem,
    (data->>'level')::int AS nivel,
    (data->>'hp')::int AS vitalidade,
    (data->>'energy')::int AS energia,
    data->'powers' AS poderes,
    data->'techniques' AS tecnicas,
    (image IS NOT NULL) AS tem_imagem,
    updated_at
FROM records
WHERE kind = 'characters';

CREATE OR REPLACE VIEW npcs AS
SELECT
    id,
    name AS nome,
    universe AS universo,
    data->>'role' AS papel,
    (data->>'level')::int AS nivel,
    (data->>'hp')::int AS vitalidade,
    data->'tags' AS tags,
    data->>'secret' AS segredo,
    (image IS NOT NULL) AS tem_imagem,
    updated_at
FROM records
WHERE kind = 'npcs';

CREATE OR REPLACE VIEW posicoes_3d AS
SELECT
    id,
    data->>'place' AS local,
    data->>'k' AS tipo,
    data->>'ref' AS ref_id,
    (data->>'x')::numeric AS x,
    (data->>'z')::numeric AS z,
    updated_at
FROM records
WHERE kind = 'placements';

-- Conferir o que foi salvo:

-- SELECT kind, count(*) FROM records GROUP BY kind;

-- SELECT * FROM personagens;