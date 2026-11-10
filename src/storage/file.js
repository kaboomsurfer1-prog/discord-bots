'use strict';

const fs = require('fs');
const path = require('path');

class FileAdapter {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, 'cayo-db.json');
    this.data = { guilds: {} };
    this.nume = `fișier JSON (${this.file})`;
  }

  async init() {
    await fs.promises.mkdir(this.dir, { recursive: true });
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.guilds) this.data = parsed;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // fișier corupt: păstrăm o copie și pornim curat
        const bak = `${this.file}.corupt-${Date.now()}`;
        await fs.promises.copyFile(this.file, bak).catch(() => {});
        console.error(`[storage] Fișierul de date era corupt, copie salvată în ${bak}`);
      }
    }
    if (!process.env.DATA_DIR) {
      console.warn(
        '[storage] ATENȚIE: nu folosești PostgreSQL (DATABASE_URL) și nici DATA_DIR. ' +
          'Pe Railway datele se pierd la fiecare redeploy dacă nu adaugi un Volume sau Postgres!'
      );
    }
  }

  async loadAll() {
    return this.data.guilds || {};
  }

  async save(gid, data) {
    this.data.guilds[gid] = data;
    const tmp = `${this.file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(this.data), 'utf8');
    await fs.promises.rename(tmp, this.file);
  }
}

module.exports = FileAdapter;
