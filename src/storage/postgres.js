'use strict';

class PostgresAdapter {
  constructor(url) {
    const { Pool } = require('pg');
    const mod = String(process.env.PGSSL || 'auto').toLowerCase();
    let ssl;
    if (mod === 'true') ssl = { rejectUnauthorized: false };
    else if (mod === 'false') ssl = false;
    else ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
    this.pool = new Pool({ connectionString: url, ssl, max: 3 });
    this.pool.on('error', (e) => console.error('[postgres] Eroare conexiune:', e.message));
    this.nume = 'PostgreSQL';
  }

  async init() {
    let ultima;
    // Pe Railway baza de date poate porni după bot: reîncercăm câteva secunde.
    for (let i = 0; i < 10; i++) {
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS cayo_guilds (
            guild_id   TEXT PRIMARY KEY,
            data       JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        return;
      } catch (e) {
        ultima = e;
        console.warn(`[postgres] Conectare eșuată (${i + 1}/10): ${e.message}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw ultima;
  }

  async loadAll() {
    const { rows } = await this.pool.query('SELECT guild_id, data FROM cayo_guilds');
    const out = {};
    for (const r of rows) out[r.guild_id] = r.data;
    return out;
  }

  async save(gid, data) {
    await this.pool.query(
      `INSERT INTO cayo_guilds (guild_id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (guild_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [gid, JSON.stringify(data)]
    );
  }

  async close() {
    await this.pool.end().catch(() => {});
  }
}

module.exports = PostgresAdapter;
