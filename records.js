// RPG Nexus — API compartilhada (Vercel + Neon)
// Cria a tabela e as visões sozinha na primeira chamada. Não precisa rodar SQL.
import { neon } from "@neondatabase/serverless";

const KINDS = ["characters", "npcs", "markers", "combatants", "placements", "groups"];
const sql = neon(process.env.DATABASE_URL);

let ready = null;
function ensureSchema() {
  if (ready) return ready;
  ready = (async () => {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS records (
        kind        text        NOT NULL,
        id          text        NOT NULL,
        name        text,
        universe    text,
        data        jsonb       NOT NULL DEFAULT '{}',
        image       text,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, id)
      )`);
    await sql.query(
      `CREATE INDEX IF NOT EXISTS records_kind_updated_idx ON records (kind, updated_at)`
    );

    // Visões opcionais (só para consultar no painel do Neon). Falhas aqui não importam.
    const views = [
      `CREATE OR REPLACE VIEW personagens AS
         SELECT id, name AS nome, universe AS universo, data->>'owner' AS jogador,
                data->>'origin' AS origem, data->>'level' AS nivel,
                data->'powers' AS poderes, (image IS NOT NULL) AS tem_imagem, updated_at
         FROM records WHERE kind = 'characters'`,
      `CREATE OR REPLACE VIEW npcs AS
         SELECT id, name AS nome, universe AS universo, data->>'owner' AS jogador,
                data->>'role' AS papel, data->>'level' AS nivel,
                (image IS NOT NULL) AS tem_imagem, updated_at
         FROM records WHERE kind = 'npcs'`,
      `CREATE OR REPLACE VIEW posicoes_3d AS
         SELECT id, data->>'place' AS local, data->>'k' AS tipo,
                data->>'ref' AS ref_id, data->>'x' AS x, data->>'z' AS z, updated_at
         FROM records WHERE kind = 'placements'`,
    ];
    for (const v of views) {
      try { await sql.query(v); } catch (e) { console.warn("view ignorada:", e.message); }
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "DATABASE_URL não configurada na Vercel." });
    }
    await ensureSchema();

    if (req.method === "GET") {
      const since = typeof req.query.since === "string" && req.query.since ? req.query.since : null;
      const rows = since
        ? await sql.query(
            `SELECT kind, id, data, image, updated_at::text AS ts
               FROM records WHERE updated_at > $1::timestamptz ORDER BY updated_at`,
            [since]
          )
        : await sql.query(
            `SELECT kind, id, data, image, updated_at::text AS ts
               FROM records ORDER BY updated_at`
          );
      const idRows = await sql.query(`SELECT kind, id FROM records`);
      const ids = {};
      for (const r of idRows) (ids[r.kind] ||= []).push(r.id);
      const last = rows.length ? rows[rows.length - 1].ts : since;
      return res.status(200).json({ rows, ids, last });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      body = body || {};

      const upserts = (Array.isArray(body.upserts) ? body.upserts : [])
        .filter((r) => r && KINDS.includes(r.kind) && r.id != null)
        .map((r) => ({
          kind: r.kind,
          id: String(r.id),
          name: r.name ? String(r.name).slice(0, 200) : null,
          universe: r.universe ? String(r.universe).slice(0, 100) : null,
          data: r.data && typeof r.data === "object" ? r.data : {},
          image: typeof r.image === "string" && r.image.startsWith("data:image/") ? r.image : null,
        }));

      const deletes = (Array.isArray(body.deletes) ? body.deletes : [])
        .filter((r) => r && KINDS.includes(r.kind) && r.id != null)
        .map((r) => ({ kind: r.kind, id: String(r.id) }));

      if (upserts.length) {
        await sql.query(
          `INSERT INTO records (kind, id, name, universe, data, image, updated_at)
           SELECT x.kind, x.id, x.name, x.universe, COALESCE(x.data, '{}'::jsonb), x.image, now()
             FROM jsonb_to_recordset($1::jsonb)
               AS x(kind text, id text, name text, universe text, data jsonb, image text)
           ON CONFLICT (kind, id) DO UPDATE SET
             name = EXCLUDED.name, universe = EXCLUDED.universe,
             data = EXCLUDED.data, image = EXCLUDED.image, updated_at = now()`,
          [JSON.stringify(upserts)]
        );
      }
      if (deletes.length) {
        await sql.query(
          `DELETE FROM records r
            USING jsonb_to_recordset($1::jsonb) AS x(kind text, id text)
            WHERE r.kind = x.kind AND r.id = x.id`,
          [JSON.stringify(deletes)]
        );
      }
      return res.status(200).json({ ok: true, saved: upserts.length, deleted: deletes.length });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("API /records:", error);
    return res.status(500).json({ error: error.message || "Erro interno." });
  }
}
