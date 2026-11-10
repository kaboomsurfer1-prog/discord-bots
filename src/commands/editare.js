'use strict';

const { MessageFlags, EmbedBuilder } = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('../services/taxe');
const UI = require('../services/ui');

const norm = (s) => String(s || '').trim().toLowerCase();

function poateEdita(i, cfg) {
  return d.esteAdmin(i, cfg) || (cfg.optiuni.staffPoateAnula && d.esteStaff(i, cfg));
}

/** Dă / scoate rolul automat al unei taxe după cum membrul mai are sau nu o plată activă. */
async function sincronizeazaRol(guild, data, cfg, taxaId, membruId) {
  const taxa = cfg.taxe.find((t) => t.id === taxaId);
  if (!taxa || !taxa.rolId || !membruId) return;
  const activ = T.areActiva(data, taxaId, { membruId });
  await d.modificaRol(guild, membruId, taxa.rolId, activ);
}

function embedModificare(i, titlu, linii, culoare = 0x3498db) {
  return new EmbedBuilder()
    .setColor(culoare)
    .setAuthor({ name: f.trunc(i.user.username, 256), iconURL: i.user.displayAvatarURL() })
    .setTitle(f.trunc(titlu, 256))
    .setDescription(f.trunc(linii.join('\n') || '—', 4000))
    .setTimestamp();
}

function textNul(v) {
  if (v === null || v === undefined) return undefined; // opțiunea nu a fost folosită
  const t = String(v).trim();
  return t === '-' || t === '' ? null : t;
}

/* ------------------------- /editeaza plata ------------------------- */

async function editeazaPlata(i, ctx) {
  const { store } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  const p = T.gasestePlata(data, i.options.getInteger('plata', true));
  if (!p) return d.eroare(i, 'Plata nu există. Caut-o cu `/lista`.');
  const o = i.options;
  const vechi = { ...p };
  const sch = [];
  const acum = Date.now();

  const idNou = textNul(o.getString('id'));
  if (idNou === null) return d.eroare(i, 'ID-ul jucătorului nu poate fi gol.');
  if (idNou !== undefined && idNou !== p.idJoc) {
    sch.push(`🎮 **ID:** ${p.idJoc || '—'} → **${idNou}**`);
    p.idJoc = idNou;
  }

  const user = o.getUser('membru');
  if (user && user.bot) return d.eroare(i, 'Nu poți lega o plată de un bot.');
  if (user && user.id !== p.membruId) {
    sch.push(`👤 **Membru:** ${p.membruId ? `<@${p.membruId}>` : '—'} → <@${user.id}>`);
    p.membruId = user.id;
  } else if (!user && o.getBoolean('scoate_membru') && p.membruId) {
    sch.push(`👤 **Membru:** <@${p.membruId}> → —`);
    p.membruId = null;
  }

  const nume = textNul(o.getString('nume'));
  if (nume !== undefined && nume !== p.numeIC) {
    sch.push(`🪪 **Nume IC:** ${p.numeIC || '—'} → **${nume || '—'}**`);
    p.numeIC = nume;
  }

  const tipQ = o.getString('tip');
  const taxaNoua = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxaNoua) return d.eroare(i, 'Taxa aleasă nu există.');
  const cant = o.getInteger('cantitate');
  if (cant !== null && cant > cfg.optiuni.cantitateMaxima) return d.eroare(i, `Cantitatea maximă este ${cfg.optiuni.cantitateMaxima}.`);
  const sumaStr = o.getString('suma');
  const sumaNoua = sumaStr ? f.parseSuma(sumaStr) : null;
  if (sumaStr && sumaNoua === null) return d.eroare(i, `Suma „${sumaStr}” nu este validă. Exemple: \`30000\`, \`30k\`.`);

  const taxaVeche = cfg.taxe.find((t) => t.id === p.taxaId);
  const durataVeche = p.expira && taxaVeche ? taxaVeche.durata : 0;
  const cantVeche = p.cantitate;
  let schimbatCalcul = false;

  if (taxaNoua && taxaNoua.id !== p.taxaId) {
    sch.push(`🏷️ **Taxă:** ${p.emoji} ${p.taxaNume} → ${taxaNoua.emoji} **${taxaNoua.nume}**`);
    p.taxaId = taxaNoua.id;
    p.taxaNume = taxaNoua.nume;
    p.emoji = taxaNoua.emoji;
    p.sumaUnitara = taxaNoua.suma;
    schimbatCalcul = true;
  }
  if (cant !== null && cant !== p.cantitate) {
    sch.push(`🔢 **Cantitate:** ×${p.cantitate} → **×${cant}**`);
    p.cantitate = cant;
    schimbatCalcul = true;
  }

  const totalVechi = p.total;
  if (sumaNoua !== null) p.total = sumaNoua;
  else if (schimbatCalcul) p.total = Math.round((p.sumaUnitara * p.cantitate * (100 - (p.reducere || 0))) / 100);
  if (p.total !== totalVechi) sch.push(`💰 **Total:** ${f.suma(totalVechi, cfg)} → **${f.suma(p.total, cfg)}**`);

  if (schimbatCalcul) {
    const taxaCur = cfg.taxe.find((t) => t.id === p.taxaId);
    const baza = p.expira ? p.expira - durataVeche * cantVeche : p.creat;
    const exp = taxaCur && taxaCur.durata > 0 ? baza + taxaCur.durata * p.cantitate : null;
    if (exp !== p.expira) {
      sch.push(`⏳ **Expiră:** ${p.expira ? f.ts(p.expira, 'f') : '—'} → **${exp ? f.ts(exp, 'f') : 'nu expiră'}**`);
      p.expira = exp;
      p.reminderTrimis = !!exp && exp - (cfg.optiuni.reminderInainte || 0) <= acum;
      p.expirareProcesata = !!exp && exp <= acum;
    }
  }

  const nota = textNul(o.getString('nota'));
  if (nota !== undefined && nota !== p.nota) {
    sch.push(`📝 **Notă:** ${p.nota || '—'} → ${nota || '—'}`);
    p.nota = nota;
  }

  if (!sch.length) return d.eroare(i, 'Nu ai modificat nimic. Alege cel puțin un câmp (id, membru, nume, cantitate, suma...).');
  p.modificari = [...(p.modificari || []), { de: i.user.id, la: acum, schimbari: sch }].slice(-10);
  store.save(i.guildId);

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await sincronizeazaRol(i.guild, data, cfg, vechi.taxaId, vechi.membruId);
  if (p.membruId !== vechi.membruId || p.taxaId !== vechi.taxaId) await sincronizeazaRol(i.guild, data, cfg, p.taxaId, p.membruId);

  const e = embedModificare(i, `✏️ Plata #${p.id} a fost modificată`, sch);
  const embeds = [e, UI.embedPlata(cfg, p, i.guild)];
  await d.log(i.guild, cfg, { embeds });
  await i.editReply({ embeds, allowedMentions: d.FARA_PING });
}

/* ------------------------ /editeaza jucator ------------------------ */

async function editeazaJucator(i, ctx) {
  const { store } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  const id = i.options.getString('id', true).trim();
  const plati = data.plati.filter((p) => p.idJoc && norm(p.idJoc) === norm(id));
  if (!plati.length) return d.eroare(i, `Nu există plăți pentru ID-ul **${id}**.`);

  const idNou = textNul(i.options.getString('id_nou'));
  if (idNou === null) return d.eroare(i, 'ID-ul nou nu poate fi gol.');
  const nume = textNul(i.options.getString('nume'));
  const user = i.options.getUser('membru');
  if (user && user.bot) return d.eroare(i, 'Nu poți lega plăți de un bot.');
  const scoate = !user && i.options.getBoolean('scoate_membru');
  if (idNou === undefined && nume === undefined && !user && !scoate) {
    return d.eroare(i, 'Alege ce modifici: `id_nou`, `nume`, `membru` sau `scoate_membru`.');
  }

  const acum = Date.now();
  const sch = [];
  if (idNou !== undefined) sch.push(`🎮 **ID:** ${id} → **${idNou}**`);
  if (nume !== undefined) sch.push(`🪪 **Nume IC:** → **${nume || '—'}**`);
  if (user) sch.push(`👤 **Membru:** → <@${user.id}>`);
  if (scoate) sch.push('👤 **Membru:** → —');

  const vechi = plati.map((p) => ({ taxaId: p.taxaId, membruId: p.membruId }));
  for (const p of plati) {
    const s = [];
    if (idNou !== undefined && p.idJoc !== idNou) {
      s.push(`🎮 ID: ${p.idJoc} → ${idNou}`);
      p.idJoc = idNou;
    }
    if (nume !== undefined && p.numeIC !== nume) {
      s.push(`🪪 Nume: ${p.numeIC || '—'} → ${nume || '—'}`);
      p.numeIC = nume;
    }
    if (user && p.membruId !== user.id) {
      s.push(`👤 Membru: ${p.membruId ? `<@${p.membruId}>` : '—'} → <@${user.id}>`);
      p.membruId = user.id;
    }
    if (scoate && p.membruId) {
      s.push(`👤 Membru: <@${p.membruId}> → —`);
      p.membruId = null;
    }
    if (s.length) p.modificari = [...(p.modificari || []), { de: i.user.id, la: acum, schimbari: s }].slice(-10);
  }
  for (const c of data.cereri) {
    if (idNou !== undefined && c.idJoc && norm(c.idJoc) === norm(id)) c.idJoc = idNou;
  }
  store.save(i.guildId);

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if (user || scoate) {
    const perechi = new Set([...vechi, ...plati.map((p) => ({ taxaId: p.taxaId, membruId: p.membruId }))].map((x) => `${x.taxaId}|${x.membruId || ''}`));
    for (const k of perechi) {
      const [taxaId, membruId] = k.split('|');
      if (membruId) await sincronizeazaRol(i.guild, data, cfg, taxaId, membruId);
    }
  }
  const e = embedModificare(i, `✏️ Jucătorul cu ID ${id} a fost actualizat`, [...sch, '', `🧾 **${plati.length}** plăți modificate`]);
  await d.log(i.guild, cfg, { embeds: [e] });
  await i.editReply({ embeds: [e], allowedMentions: d.FARA_PING });
}

/* --------------------------- /sterge ------------------------------- */

async function stergePlata(i, ctx) {
  const { store } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  const p = T.gasestePlata(data, i.options.getInteger('plata', true));
  if (!p) return d.eroare(i, 'Plata nu există. Caut-o cu `/lista`.');
  if (!i.options.getBoolean('confirmare', true)) return d.eroare(i, 'Ștergerea a fost anulată (confirmare: False).');
  data.plati = data.plati.filter((x) => x.id !== p.id);
  store.save(i.guildId);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await sincronizeazaRol(i.guild, data, cfg, p.taxaId, p.membruId);
  const e = UI.embedPlata(cfg, p, i.guild).setTitle(f.trunc(`🗑️ ȘTEARSĂ — ${p.emoji} ${p.taxaNume} (#${p.id})`, 256)).setColor(0xe74c3c);
  const info = embedModificare(i, `🗑️ Plata #${p.id} a fost ștearsă definitiv`, [`Ștearsă de <@${i.user.id}>`], 0xe74c3c);
  await d.log(i.guild, cfg, { embeds: [info, e] });
  await i.editReply({ embeds: [info, e], allowedMentions: d.FARA_PING });
}

async function stergeJucator(i, ctx) {
  const { store } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  const id = i.options.getString('id', true).trim();
  if (!i.options.getBoolean('confirmare', true)) return d.eroare(i, 'Ștergerea a fost anulată (confirmare: False).');
  const plati = data.plati.filter((p) => p.idJoc && norm(p.idJoc) === norm(id));
  if (!plati.length) return d.eroare(i, `Nu există plăți pentru ID-ul **${id}**.`);
  const ids = new Set(plati.map((p) => p.id));
  data.plati = data.plati.filter((p) => !ids.has(p.id));
  store.save(i.guildId);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const perechi = new Set(plati.filter((p) => p.membruId).map((p) => `${p.taxaId}|${p.membruId}`));
  for (const k of perechi) {
    const [taxaId, membruId] = k.split('|');
    await sincronizeazaRol(i.guild, data, cfg, taxaId, membruId);
  }
  const total = plati.filter((p) => p.status !== 'anulat').reduce((s, p) => s + p.total, 0);
  const e = embedModificare(
    i,
    `🗑️ Toate plățile ID-ului ${id} au fost șterse`,
    [
      `🧾 **${plati.length}** plăți șterse (total ${f.suma(total, cfg)})`,
      `Numere: ${f.trunc(plati.map((p) => `#${p.id}`).join(', '), 1500)}`,
      `Ștearse de <@${i.user.id}>`,
    ],
    0xe74c3c
  );
  await d.log(i.guild, cfg, { embeds: [e] });
  await i.editReply({ embeds: [e], allowedMentions: d.FARA_PING });
}

/* --------------------------- Router -------------------------------- */

async function editeaza(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  if (!poateEdita(i, cfg)) {
    return d.eroare(i, 'Doar adminii pot modifica plăți (sau staff-ul, dacă e activă opțiunea `staff_poate_anula`).');
  }
  return i.options.getSubcommand() === 'jucator' ? editeazaJucator(i, ctx) : editeazaPlata(i, ctx);
}

async function sterge(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  if (!d.esteAdmin(i, cfg)) return d.eroare(i, 'Doar adminii pot șterge definitiv plăți. Staff-ul poate folosi `/anuleaza`.');
  return i.options.getSubcommand() === 'jucator' ? stergeJucator(i, ctx) : stergePlata(i, ctx);
}

module.exports = { editeaza, sterge };
