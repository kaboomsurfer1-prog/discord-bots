'use strict';

const { DEFAULT_CONFIG } = require('../config/defaults');

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function esteObiect(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Completează obj cu cheile lipsă din defaults (recursiv pe obiecte; array-urile nu se amestecă). */
function completeaza(defaults, obj) {
  if (!esteObiect(obj)) return clone(defaults);
  const out = {};
  for (const k of Object.keys(defaults)) {
    if (obj[k] === undefined) out[k] = clone(defaults[k]);
    else if (esteObiect(defaults[k]) && esteObiect(obj[k])) out[k] = completeaza(defaults[k], obj[k]);
    else out[k] = obj[k];
  }
  for (const k of Object.keys(obj)) if (out[k] === undefined) out[k] = obj[k];
  return out;
}

const TAXA_SABLON = {
  id: null,
  nume: 'Taxă',
  comanda: null,
  emoji: '💰',
  suma: 0,
  durata: 0,
  descriere: '',
  culoare: '#F1C40F',
  rolId: null,
  activa: true,
  inPanou: true,
};

function normalizeaza(data) {
  const d = esteObiect(data) ? data : {};
  const config = completeaza(DEFAULT_CONFIG, d.config);
  if (!Array.isArray(config.taxe)) config.taxe = clone(DEFAULT_CONFIG.taxe);
  config.taxe = config.taxe.filter((t) => esteObiect(t) && t.id).map((t) => ({ ...TAXA_SABLON, ...t }));
  for (const k of ['reduceri', 'panouri']) if (!Array.isArray(config[k])) config[k] = [];
  for (const k of ['admin', 'staff']) if (!Array.isArray(config.roluri[k])) config.roluri[k] = [];
  return {
    config,
    plati: Array.isArray(d.plati) ? d.plati : [],
    cereri: Array.isArray(d.cereri) ? d.cereri : [],
    contor: {
      plata: Number(d.contor && d.contor.plata) || 0,
      cerere: Number(d.contor && d.contor.cerere) || 0,
    },
  };
}

/**
 * Datele fiecărui server stau în memorie și se salvează (cu debounce) prin adaptor:
 * PostgreSQL dacă există DATABASE_URL, altfel fișier JSON (folosește un Volume pe Railway).
 */
class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.guilds = new Map();
    this.dirty = new Set();
    this.timer = null;
    this.salvare = Promise.resolve();
  }

  async init() {
    await this.adapter.init();
    const toate = await this.adapter.loadAll();
    for (const [gid, data] of Object.entries(toate)) this.guilds.set(gid, normalizeaza(data));
  }

  get(gid) {
    if (!this.guilds.has(gid)) this.guilds.set(gid, normalizeaza({}));
    return this.guilds.get(gid);
  }

  config(gid) {
    return this.get(gid).config;
  }

  nextId(gid, tip) {
    const d = this.get(gid);
    d.contor[tip] = (d.contor[tip] || 0) + 1;
    return d.contor[tip];
  }

  /** Marchează serverul ca modificat; salvarea se face după 1,5 secunde. */
  save(gid) {
    this.dirty.add(gid);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((e) => console.error('[storage] Eroare la salvare:', e));
    }, 1500);
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ids = [...this.dirty];
    this.dirty.clear();
    this.salvare = this.salvare.then(async () => {
      for (const gid of ids) {
        try {
          await this.adapter.save(gid, this.guilds.get(gid));
        } catch (e) {
          this.dirty.add(gid);
          console.error(`[storage] Nu am putut salva serverul ${gid}:`, e.message);
        }
      }
    });
    return this.salvare;
  }

  reset(gid) {
    this.guilds.set(gid, normalizeaza({}));
    this.save(gid);
  }
}

function creeazaStore() {
  let adapter;
  if (process.env.DATABASE_URL) {
    const PostgresAdapter = require('./postgres');
    adapter = new PostgresAdapter(process.env.DATABASE_URL);
  } else {
    const FileAdapter = require('./file');
    adapter = new FileAdapter(process.env.DATA_DIR || './data');
  }
  return new Store(adapter);
}

module.exports = { Store, creeazaStore, normalizeaza, completeaza, clone };
