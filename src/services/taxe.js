'use strict';

/**
 * Logica de bază pentru taxe/plăți/cereri (fără dependențe de Discord).
 */

const f = require('../utils/format');

function gasesteTaxa(cfg, q) {
  if (q === null || q === undefined || q === '') return null;
  const s = String(q).toLowerCase().trim();
  return (
    cfg.taxe.find((t) => t.id === q) ||
    cfg.taxe.find(
      (t) =>
        t.id.toLowerCase() === s ||
        (t.comanda && t.comanda.toLowerCase() === s) ||
        t.nume.toLowerCase() === s ||
        f.slug(t.nume) === f.slug(s)
    ) ||
    null
  );
}

function acelasiPlatitor(p, cine) {
  if (cine.membruId && p.membruId) return p.membruId === cine.membruId;
  if (cine.numeIC && p.numeIC) return p.numeIC.toLowerCase() === cine.numeIC.toLowerCase();
  return false;
}

function cheiePlatitor(p) {
  return p.membruId ? `m:${p.membruId}` : `n:${String(p.numeIC || '').toLowerCase()}`;
}

function eticheta(p) {
  if (p.membruId) return `<@${p.membruId}>${p.numeIC ? ` (${p.numeIC})` : ''}`;
  return `**${p.numeIC || 'Necunoscut'}**`;
}

/** Cea mai mare reducere dintre rolurile membrului. */
function reducere(cfg, roluri = []) {
  let max = 0;
  for (const r of cfg.reduceri || []) if (roluri.includes(r.rolId) && r.procent > max) max = r.procent;
  return Math.min(100, Math.max(0, max));
}

function calculeaza(cfg, taxa, { roluri = [], cantitate = 1, sumaOverride = null } = {}) {
  const pct = sumaOverride !== null && sumaOverride !== undefined ? 0 : reducere(cfg, roluri);
  const brut = taxa.suma * cantitate;
  const total = sumaOverride !== null && sumaOverride !== undefined ? sumaOverride : Math.round((brut * (100 - pct)) / 100);
  return { sumaUnitara: taxa.suma, reducere: pct, total, brut };
}

function ultimaExpirare(data, taxaId, cine, acum = Date.now()) {
  let max = 0;
  for (const p of data.plati) {
    if (p.status !== 'activ' || p.taxaId !== taxaId || !p.expira || p.expira <= acum) continue;
    if (acelasiPlatitor(p, cine) && p.expira > max) max = p.expira;
  }
  return max;
}

function calculeazaExpirare(data, cfg, taxa, cine, cantitate, acum = Date.now()) {
  if (!taxa.durata || taxa.durata <= 0) return null;
  let baza = acum;
  if (cfg.optiuni.cumulareDurata) {
    const ult = ultimaExpirare(data, taxa.id, cine, acum);
    if (ult > baza) baza = ult;
  }
  return baza + taxa.durata * cantitate;
}

/** Înregistrează o plată și o returnează. */
function inregistreazaPlata(store, gid, o) {
  const data = store.get(gid);
  const cfg = data.config;
  const acum = o.acum || Date.now();
  const cantitate = Math.max(1, Math.floor(o.cantitate || 1));
  const cine = { membruId: o.membruId || null, numeIC: o.numeIC || null };
  const calc = calculeaza(cfg, o.taxa, { roluri: o.roluri || [], cantitate, sumaOverride: o.sumaOverride });
  const plata = {
    id: store.nextId(gid, 'plata'),
    taxaId: o.taxa.id,
    taxaNume: o.taxa.nume,
    emoji: o.taxa.emoji,
    sumaUnitara: calc.sumaUnitara,
    cantitate,
    reducere: calc.reducere,
    total: calc.total,
    membruId: cine.membruId,
    numeIC: cine.numeIC,
    idJoc: o.idJoc || null,
    colectorId: o.colectorId,
    nota: o.nota || null,
    dovada: o.dovada || null,
    creat: acum,
    expira: calculeazaExpirare(data, cfg, o.taxa, cine, cantitate, acum),
    status: 'activ',
    reminderTrimis: false,
    expirareProcesata: false,
    sursa: o.sursa || 'comanda',
    cerereId: o.cerereId || null,
  };
  data.plati.push(plata);
  store.save(gid);
  return plata;
}

function gasestePlata(data, id) {
  return data.plati.find((p) => p.id === Number(id)) || null;
}

function anuleazaPlata(store, gid, id, deCine, motiv) {
  const data = store.get(gid);
  const p = gasestePlata(data, id);
  if (!p) return { eroare: `Plata #${id} nu există.` };
  if (p.status === 'anulat') return { eroare: `Plata #${id} este deja anulată.` };
  p.status = 'anulat';
  p.anulatDe = deCine;
  p.anulatLa = Date.now();
  p.motivAnulare = motiv || null;
  store.save(gid);
  return { plata: p };
}

/** Are plătitorul încă o plată activă (neexpirată) pentru taxa respectivă? */
function areActiva(data, taxaId, cine, acum = Date.now(), exceptId = null) {
  return data.plati.some(
    (p) =>
      p.id !== exceptId &&
      p.status === 'activ' &&
      p.taxaId === taxaId &&
      (!p.expira || p.expira > acum) &&
      acelasiPlatitor(p, cine)
  );
}

function filtreaza(data, flt = {}) {
  const out = data.plati.filter((p) => {
    if (!flt.anulate && p.status === 'anulat') return false;
    if (flt.taxaId && p.taxaId !== flt.taxaId) return false;
    if (flt.colectorId && p.colectorId !== flt.colectorId) return false;
    if (flt.de && p.creat < flt.de) return false;
    if (flt.pana && p.creat >= flt.pana) return false;
    if ((flt.membruId || flt.numeIC) && !acelasiPlatitor(p, { membruId: flt.membruId, numeIC: flt.numeIC })) return false;
    return true;
  });
  return out.sort((a, b) => b.creat - a.creat || b.id - a.id);
}

function statistici(plati) {
  const s = { total: 0, numar: 0, cantitate: 0, perTaxa: {}, perColector: {}, perPlatitor: {} };
  for (const p of plati) {
    if (p.status === 'anulat') continue;
    s.total += p.total;
    s.numar += 1;
    s.cantitate += p.cantitate;
    const t = (s.perTaxa[p.taxaId] ||= { nume: p.taxaNume, emoji: p.emoji, total: 0, numar: 0, cantitate: 0 });
    t.total += p.total;
    t.numar += 1;
    t.cantitate += p.cantitate;
    const c = (s.perColector[p.colectorId] ||= { id: p.colectorId, total: 0, numar: 0 });
    c.total += p.total;
    c.numar += 1;
    const k = cheiePlatitor(p);
    const pl = (s.perPlatitor[k] ||= { eticheta: eticheta(p), total: 0, numar: 0 });
    pl.total += p.total;
    pl.numar += 1;
  }
  return s;
}

/** Lista plătitorilor cu taxe active (doar taxe cu durată). */
function activi(data, cfg, taxaId = null, acum = Date.now()) {
  const harta = new Map();
  for (const p of data.plati) {
    if (p.status !== 'activ' || !p.expira || p.expira <= acum) continue;
    if (taxaId && p.taxaId !== taxaId) continue;
    const k = `${p.taxaId}|${cheiePlatitor(p)}`;
    const ex = harta.get(k);
    if (!ex || p.expira > ex.expira) harta.set(k, p);
  }
  return [...harta.values()].sort((a, b) => a.expira - b.expira);
}

/** Situația unui plătitor pe fiecare taxă. */
function stare(data, cfg, cine, acum = Date.now()) {
  const plati = data.plati.filter((p) => p.status === 'activ' && acelasiPlatitor(p, cine));
  const rez = [];
  const ids = new Set(cfg.taxe.map((t) => t.id));
  for (const p of plati) ids.add(p.taxaId);
  for (const id of ids) {
    const taxa = cfg.taxe.find((t) => t.id === id);
    const ale = plati.filter((p) => p.taxaId === id).sort((a, b) => b.creat - a.creat);
    if (!taxa && !ale.length) continue;
    const expira = ale.reduce((m, p) => (p.expira && p.expira > m ? p.expira : m), 0);
    rez.push({
      taxa: taxa || { id, nume: ale[0].taxaNume, emoji: ale[0].emoji, durata: 0, sters: true },
      plati: ale,
      numar: ale.length,
      total: ale.reduce((s, p) => s + p.total, 0),
      ultima: ale[0] || null,
      expira: expira || null,
      activa: expira > acum,
    });
  }
  return { rezultate: rez, totalGeneral: plati.reduce((s, p) => s + p.total, 0), plati };
}

/* ----------------------------- Cereri ----------------------------- */

function creeazaCerere(store, gid, o) {
  const data = store.get(gid);
  const c = {
    id: store.nextId(gid, 'cerere'),
    taxaId: o.taxa.id,
    membruId: o.membruId,
    numeIC: o.numeIC || null,
    idJoc: o.idJoc || null,
    cantitate: Math.max(1, Math.floor(o.cantitate || 1)),
    dovada: o.dovada || null,
    nota: o.nota || null,
    roluri: o.roluri || [],
    status: 'asteptare',
    creat: Date.now(),
    canalId: null,
    mesajId: null,
    procesatDe: null,
    procesatLa: null,
    motiv: null,
    plataId: null,
  };
  data.cereri.push(c);
  // păstrăm doar ultimele 2000 de cereri procesate
  if (data.cereri.length > 2500) {
    const asteptare = data.cereri.filter((x) => x.status === 'asteptare');
    const procesate = data.cereri.filter((x) => x.status !== 'asteptare').slice(-2000);
    data.cereri = [...procesate, ...asteptare].sort((a, b) => a.id - b.id);
  }
  store.save(gid);
  return c;
}

function gasesteCerere(data, id) {
  return data.cereri.find((c) => c.id === Number(id)) || null;
}

module.exports = {
  gasesteTaxa,
  acelasiPlatitor,
  cheiePlatitor,
  eticheta,
  reducere,
  calculeaza,
  ultimaExpirare,
  calculeazaExpirare,
  inregistreazaPlata,
  gasestePlata,
  anuleazaPlata,
  areActiva,
  filtreaza,
  statistici,
  activi,
  stare,
  creeazaCerere,
  gasesteCerere,
};
