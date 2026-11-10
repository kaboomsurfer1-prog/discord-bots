'use strict';

const MIN = 60 * 1000;
const ORA = 60 * MIN;
const ZI = 24 * ORA;
const SAPT = 7 * ZI;

/* ------------------------------------------------------------------ */
/* Bani                                                                 */
/* ------------------------------------------------------------------ */

function separaMii(n, sep) {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  const cu = sep === undefined ? '.' : sep;
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, cu);
  return (neg ? '-' : '') + out;
}

/** Formatează o sumă după setările monedei din config. */
function suma(n, cfg) {
  const m = (cfg && cfg.moneda) || { simbol: '$', pozitie: 'inainte', separator: '.' };
  const nr = separaMii(Number(n) || 0, m.separator);
  if (!m.simbol) return nr;
  return m.pozitie === 'dupa' ? `${nr}${m.simbol}` : `${m.simbol}${nr}`;
}

/**
 * Transformă text în sumă: "30000", "30.000", "30,000", "30 000", "30k", "1.5m", "2kk".
 * Returnează null dacă nu e valid.
 */
function parseSuma(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  let s = String(input).trim().toLowerCase().replace(/[$€£]|lei|ron/g, '').trim();
  if (!s) return null;
  const m = s.match(/^([\d.,\s]+?)\s*(kk|k|m|mil|mln)?$/);
  if (!m) return null;
  let num = m[1].replace(/\s/g, '');
  const suf = m[2];
  let val;
  if (suf) {
    val = parseFloat(num.replace(',', '.'));
    const mult = suf === 'k' ? 1e3 : 1e6;
    val *= mult;
  } else {
    val = parseInt(num.replace(/[.,]/g, ''), 10);
  }
  if (!Number.isFinite(val) || val < 0) return null;
  return Math.round(val);
}

/* ------------------------------------------------------------------ */
/* Durate                                                               */
/* ------------------------------------------------------------------ */

function plural(n, sg, pl) {
  if (n === 1) return `1 ${sg}`;
  const r = n % 100;
  const de = n >= 20 && (r === 0 || r >= 20) ? 'de ' : '';
  return `${n} ${de}${pl}`;
}

/**
 * "24h", "1d", "1z12h", "30m", "2w", "1 sapt", "permanent", "0".
 * Număr simplu fără unitate = ore. Returnează ms (0 = fără expirare) sau null dacă e invalid.
 */
function parseDurata(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (['0', 'permanent', 'permanenta', 'nu', 'off', 'niciodata', 'never', 'none', '-'].includes(s)) return 0;
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return Math.round(parseFloat(s.replace(',', '.')) * ORA);
  const re = /(\d+(?:[.,]\d+)?)\s*(săptămâni|saptamani|săptămână|saptamana|sapt|w|zile|zi|z|d|ore|ora|oră|h|o|minute|minut|min|m)/g;
  let total = 0;
  let matched = '';
  let m;
  while ((m = re.exec(s)) !== null) {
    const v = parseFloat(m[1].replace(',', '.'));
    const u = m[2];
    let mult;
    if (/^(săptămâni|saptamani|săptămână|saptamana|sapt|w)$/.test(u)) mult = SAPT;
    else if (/^(zile|zi|z|d)$/.test(u)) mult = ZI;
    else if (/^(ore|ora|oră|h|o)$/.test(u)) mult = ORA;
    else mult = MIN;
    total += v * mult;
    matched += m[0];
  }
  if (!matched || matched.replace(/\s/g, '') !== s.replace(/\s/g, '')) return null;
  return Math.round(total);
}

function durata(ms) {
  if (!ms || ms <= 0) return 'Permanent';
  const parti = [];
  let rest = ms;
  const z = Math.floor(rest / ZI);
  rest -= z * ZI;
  const h = Math.floor(rest / ORA);
  rest -= h * ORA;
  const mi = Math.round(rest / MIN);
  if (z) parti.push(plural(z, 'zi', 'zile'));
  if (h) parti.push(plural(h, 'oră', 'ore'));
  if (mi) parti.push(plural(mi, 'minut', 'minute'));
  return parti.length ? parti.join(' ') : 'sub un minut';
}

/* ------------------------------------------------------------------ */
/* Texte                                                                */
/* ------------------------------------------------------------------ */

/** Înlocuiește {cheie} cu valori. Acceptă și "\n" scris literal. */
function render(template, vars) {
  return String(template || '')
    .replace(/\\n/g, '\n')
    .replace(/\{(\w+)\}/g, (full, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : full));
}

function trunc(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

function faraDiacritice(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Text -> identificator valid pentru comenzi Discord (a-z, 0-9, -, _ ; max 32). */
function slug(s, max = 32) {
  return faraDiacritice(s)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, max);
}

/** Timestamp Discord (se afișează în ora fiecărui utilizator). */
function ts(ms, stil = 'f') {
  return `<t:${Math.floor(ms / 1000)}:${stil}>`;
}

/* ------------------------------------------------------------------ */
/* Culori / emoji / URL                                                 */
/* ------------------------------------------------------------------ */

const CULORI_NUME = {
  rosu: '#E74C3C',
  verde: '#2ECC71',
  albastru: '#3498DB',
  galben: '#F1C40F',
  portocaliu: '#E67E22',
  mov: '#9B59B6',
  roz: '#FF6B9D',
  negru: '#23272A',
  alb: '#FFFFFF',
  gri: '#95A5A6',
  auriu: '#D4AF37',
  turcoaz: '#1ABC9C',
};

/** Returnează "#RRGGBB" sau null. */
function parseCuloare(input) {
  if (!input) return null;
  const s = faraDiacritice(String(input).trim().toLowerCase());
  if (CULORI_NUME[s]) return CULORI_NUME[s];
  const m = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h.toUpperCase();
}

function culoareInt(hex, fallback = 0xf1c40f) {
  const c = parseCuloare(hex);
  return c ? parseInt(c.slice(1), 16) : fallback;
}

function esteEmoji(s) {
  if (!s) return false;
  const t = String(s).trim();
  if (/^<a?:\w{2,32}:\d{15,25}>$/.test(t)) return true;
  if (t.length > 16 || /\s/.test(t)) return false;
  return /^\p{Extended_Pictographic}/u.test(t) || /^\p{Regional_Indicator}{2}$/u.test(t) || /^[0-9#*]️?⃣$/u.test(t);
}

function esteUrl(s) {
  return /^https?:\/\/[^\s]+$/i.test(String(s || '').trim());
}

/* ------------------------------------------------------------------ */
/* Fus orar & perioade                                                  */
/* ------------------------------------------------------------------ */

function fusValid(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const ZILE_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Componentele datei în fusul orar dat. */
function partiTz(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return {
    an: Number(o.year),
    luna: Number(o.month),
    zi: Number(o.day),
    ora: Number(o.hour) % 24,
    minut: Number(o.minute),
    secunda: Number(o.second),
    ziSapt: ZILE_EN[o.weekday],
  };
}

function offsetTz(ms, tz) {
  const p = partiTz(ms, tz);
  const caUtc = Date.UTC(p.an, p.luna - 1, p.zi, p.ora, p.minut, p.secunda);
  return caUtc - Math.floor(ms / 1000) * 1000;
}

/** Timestamp UTC pentru o dată/oră locală în fusul tz. */
function dinLocal(an, luna, zi, ora, minut, tz) {
  const guess = Date.UTC(an, luna - 1, zi, ora, minut, 0);
  let off = offsetTz(guess, tz);
  let t = guess - off;
  const off2 = offsetTz(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

function inceputZi(ms, tz) {
  const p = partiTz(ms, tz);
  return dinLocal(p.an, p.luna, p.zi, 0, 0, tz);
}

const PERIOADE = {
  azi: 'Azi',
  ieri: 'Ieri',
  saptamana: 'Săptămâna aceasta',
  saptamana_trecuta: 'Săptămâna trecută',
  luna: 'Luna aceasta',
  luna_trecuta: 'Luna trecută',
  '7z': 'Ultimele 7 zile',
  '30z': 'Ultimele 30 de zile',
  tot: 'Tot timpul',
};

/** Returnează { de, pana, eticheta } pentru o cheie de perioadă. */
function perioada(cheie, tz, acum = Date.now()) {
  const k = PERIOADE[cheie] ? cheie : 'tot';
  const p = partiTz(acum, tz);
  const azi = dinLocal(p.an, p.luna, p.zi, 0, 0, tz);
  const zileDinLuni = (p.ziSapt + 6) % 7;
  const scadeZile = (zile) => {
    const d = new Date(Date.UTC(p.an, p.luna - 1, p.zi - zile));
    return dinLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
  };
  let de = 0;
  let pana = acum;
  switch (k) {
    case 'azi':
      de = azi;
      break;
    case 'ieri':
      de = scadeZile(1);
      pana = azi;
      break;
    case 'saptamana':
      de = scadeZile(zileDinLuni);
      break;
    case 'saptamana_trecuta':
      de = scadeZile(zileDinLuni + 7);
      pana = scadeZile(zileDinLuni);
      break;
    case 'luna':
      de = dinLocal(p.an, p.luna, 1, 0, 0, tz);
      break;
    case 'luna_trecuta': {
      const an = p.luna === 1 ? p.an - 1 : p.an;
      const luna = p.luna === 1 ? 12 : p.luna - 1;
      de = dinLocal(an, luna, 1, 0, 0, tz);
      pana = dinLocal(p.an, p.luna, 1, 0, 0, tz);
      break;
    }
    case '7z':
      de = acum - 7 * ZI;
      break;
    case '30z':
      de = acum - 30 * ZI;
      break;
    default:
      de = 0;
  }
  return { de, pana, eticheta: PERIOADE[k], cheie: k };
}

function dataLocala(ms, tz) {
  const p = partiTz(ms, tz);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(p.zi)}.${z(p.luna)}.${p.an} ${z(p.ora)}:${z(p.minut)}`;
}

module.exports = {
  MIN,
  ORA,
  ZI,
  SAPT,
  separaMii,
  suma,
  parseSuma,
  parseDurata,
  durata,
  plural,
  render,
  trunc,
  slug,
  faraDiacritice,
  ts,
  parseCuloare,
  culoareInt,
  esteEmoji,
  esteUrl,
  fusValid,
  partiTz,
  dinLocal,
  inceputZi,
  perioada,
  PERIOADE,
  dataLocala,
  CULORI_NUME,
};
