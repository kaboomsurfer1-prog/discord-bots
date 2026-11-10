'use strict';

const { MessageFlags, AttachmentBuilder } = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('../services/taxe');
const UI = require('../services/ui');
const { paginare } = require('../utils/paginare');

function numeAfisat(i, optiune = 'membru') {
  const user = i.options.getUser(optiune);
  if (!user) return null;
  const m = i.options.getMember(optiune);
  return (m && m.displayName) || (m && m.nick) || user.globalName || user.username;
}

function liniePlata(cfg, p) {
  const txt = `\`#${p.id}\` ${p.emoji} **${p.taxaNume}** ×${p.cantitate} • **${f.suma(p.total, cfg)}** • ${T.eticheta(p)} • 🧾 <@${p.colectorId}> • ${f.ts(p.creat, 'R')}`;
  return p.status === 'anulat' ? `~~${txt}~~ 🚫` : txt;
}

const NU_E_STAFF = 'Doar staff-ul poate folosi această comandă.';

/** /verifica */
async function verifica(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  const user = i.options.getUser('membru');
  const nume = i.options.getString('nume')?.trim() || null;
  let cine;
  let titlu;
  if (!user && !nume) {
    cine = { membruId: i.user.id };
    titlu = (i.member && i.member.displayName) || i.user.globalName || i.user.username;
  } else {
    const sine = user && user.id === i.user.id;
    if (!sine && !d.esteStaff(i, cfg) && !cfg.optiuni.verificarePublica) {
      return d.eroare(i, 'Poți verifica doar propriile taxe (folosește `/verifica` fără nimic).');
    }
    cine = { membruId: user ? user.id : null, numeIC: nume };
    titlu = user ? numeAfisat(i) : nume;
  }
  await i.reply({ embeds: [UI.embedStare(cfg, data, cine, titlu)], flags: MessageFlags.Ephemeral, allowedMentions: d.FARA_PING });
}

/** /istoric */
async function istoric(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  const staff = d.esteStaff(i, cfg);
  const user = i.options.getUser('membru');
  const nume = i.options.getString('nume')?.trim() || null;
  const sine = user && user.id === i.user.id;
  if (!staff && !sine && (!cfg.optiuni.verificarePublica || (!user && !nume))) {
    return d.eroare(i, 'Doar staff-ul poate vedea istoricul complet. Tu poți folosi `/istoric membru:@tu` sau `/verifica`.');
  }
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const per = f.perioada(i.options.getString('perioada') || 'tot', cfg.optiuni.fusOrar);
  const colector = i.options.getUser('colector');
  const lista = T.filtreaza(data, {
    membruId: user ? user.id : null,
    numeIC: user ? null : nume,
    taxaId: taxa ? taxa.id : null,
    colectorId: colector ? colector.id : null,
    de: per.de,
    pana: per.pana,
    anulate: !!i.options.getBoolean('anulate'),
  });
  const total = lista.filter((p) => p.status !== 'anulat').reduce((s, p) => s + p.total, 0);
  const filtre = [
    user ? `👤 ${numeAfisat(i)}` : nume ? `🪪 ${nume}` : null,
    taxa ? `${taxa.emoji} ${taxa.nume}` : null,
    colector ? `🧾 colector <@${colector.id}>` : null,
    `📅 ${per.eticheta}`,
  ].filter(Boolean);
  await paginare(i, {
    cfg,
    titlu: '🕘 Istoric plăți',
    sus: `${filtre.join(' • ')}\n💰 Total: **${f.suma(total, cfg)}** din **${lista.filter((p) => p.status !== 'anulat').length}** plăți`,
    linii: lista.map((p) => liniePlata(cfg, p)),
    perPagina: 10,
  });
}

/** /raport */
async function raport(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, NU_E_STAFF);
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const per = f.perioada(i.options.getString('perioada') || 'azi', cfg.optiuni.fusOrar);
  const e = UI.embedRaport(cfg, data, per, { taxaId: taxa ? taxa.id : null });
  if (taxa) e.setTitle(f.trunc(`📊 Raport ${taxa.emoji} ${taxa.nume} — ${per.eticheta}`, 256));
  await i.reply({
    embeds: [e],
    allowedMentions: d.FARA_PING,
    ...(i.options.getBoolean('public') ? {} : { flags: MessageFlags.Ephemeral }),
  });
}

/** /top */
async function top(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, NU_E_STAFF);
  const cat = i.options.getString('categorie') || 'platitori';
  const limita = i.options.getInteger('limita') || 10;
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const per = f.perioada(i.options.getString('perioada') || 'tot', cfg.optiuni.fusOrar);
  const s = T.statistici(T.filtreaza(data, { de: per.de, pana: per.pana, taxaId: taxa ? taxa.id : null }));
  const lista =
    cat === 'colectori'
      ? Object.values(s.perColector).map((c) => ({ eticheta: `<@${c.id}>`, total: c.total, numar: c.numar }))
      : Object.values(s.perPlatitor);
  lista.sort((a, b) => b.total - a.total);
  const linii = lista.slice(0, limita).map((x, k) => `${UI.medalie(k)} ${x.eticheta} — **${f.suma(x.total, cfg)}** (${x.numar} plăți)`);
  const e = d
    .embedBaza(cfg)
    .setTitle(f.trunc(`🏆 Top ${cat === 'colectori' ? 'colectori' : 'plătitori'}${taxa ? ` — ${taxa.emoji} ${taxa.nume}` : ''}`, 256))
    .setDescription(f.trunc(`📅 ${per.eticheta}\n\n${linii.join('\n') || '_Nicio plată în perioada aleasă._'}`, 4096));
  await i.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: d.FARA_PING });
}

/** /activi */
async function activi(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, NU_E_STAFF);
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const cuDurata = cfg.taxe.filter((t) => t.durata > 0);
  const lista = T.activi(data, cfg, taxa ? taxa.id : null);
  let sus = taxa ? `${taxa.emoji} **${taxa.nume}**` : 'Toate taxele cu durată';
  if (!cuDurata.length) {
    sus += '\n\nℹ️ Nicio taxă nu are durată setată (toate sunt „Permanent”). Setează o durată cu `/config taxa editeaza durata:24h`.';
  }
  await paginare(i, {
    cfg,
    titlu: `⏳ Taxe active — ${lista.length}`,
    sus,
    linii: lista.map((p) => `${p.emoji} ${T.eticheta(p)} — ${p.taxaNume} • expiră ${f.ts(p.expira, 'R')}`),
    perPagina: 15,
  });
}

/** /taxe */
async function taxe(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  const e = d.embedBaza(cfg).setTitle(f.trunc(cfg.aspect.titlu || '🏝️ Taxe', 256)).setDescription(f.trunc(UI.listaTaxe(cfg), 4096));
  const rapide = cfg.taxe.filter((t) => t.activa && t.comanda).map((t) => `\`/${t.comanda}\``);
  if (rapide.length) e.addFields({ name: '⚡ Comenzi rapide (staff)', value: f.trunc(rapide.join(' '), 1024) });
  if (cfg.aspect.thumbnail) e.setThumbnail(cfg.aspect.thumbnail);
  await i.reply({ embeds: [e] });
}

function csvCamp(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** /export */
async function exporta(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, NU_E_STAFF);
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const tz = cfg.optiuni.fusOrar;
  const per = f.perioada(i.options.getString('perioada') || 'tot', tz);
  const lista = T.filtreaza(data, { de: per.de, pana: per.pana, taxaId: taxa ? taxa.id : null, anulate: true });
  const nume = (id) => (id ? ctx.client.users.cache.get(id)?.username || '' : '');
  const cap = [
    'ID', 'Data', 'Taxa', 'Cantitate', 'Suma unitara', 'Reducere %', 'Total', 'Membru ID', 'Membru',
    'Nume IC', 'ID joc', 'Colector ID', 'Colector', 'Expira', 'Status', 'Nota', 'Dovada',
  ];
  const randuri = lista.map((p) =>
    [
      p.id,
      f.dataLocala(p.creat, tz),
      p.taxaNume,
      p.cantitate,
      p.sumaUnitara,
      p.reducere || 0,
      p.total,
      p.membruId || '',
      nume(p.membruId),
      p.numeIC || '',
      p.idJoc || '',
      p.colectorId,
      nume(p.colectorId),
      p.expira ? f.dataLocala(p.expira, tz) : '',
      p.status,
      p.nota || '',
      p.dovada || '',
    ]
      .map(csvCamp)
      .join(';')
  );
  const csv = '﻿' + [cap.join(';'), ...randuri].join('\r\n');
  const fisier = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `plati-cayo-${per.cheie}.csv` });
  await i.reply({
    content: `📤 **${lista.length}** plăți • ${per.eticheta}${taxa ? ` • ${taxa.nume}` : ''}. Se deschide direct în Excel / Google Sheets.`,
    files: [fisier],
    flags: MessageFlags.Ephemeral,
  });
}

/** /ajutor */
async function ajutor(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  const rapide = cfg.taxe.filter((t) => t.activa && t.comanda);
  const e = d
    .embedBaza(cfg)
    .setTitle(f.trunc(`❓ Ajutor — ${cfg.aspect.titlu || 'Bot taxe'}`, 256))
    .setDescription('Toate comenzile botului pentru taxele Insulei Cayo Perico.')
    .addFields(
      {
        name: '💰 Încasare (staff)',
        value: f.trunc(
          [
            '`/plata tip membru|nume [cantitate] [suma] [dovada] [nota]` — înregistrează o plată',
            ...rapide.map((t) => `\`/${t.comanda} membru|nume\` — ${t.emoji} ${t.nume} (${f.suma(t.suma, cfg)})`),
            '`/anuleaza id [motiv]` — anulează o plată',
          ].join('\n'),
          1024
        ),
      },
      {
        name: '📊 Evidență (staff)',
        value: [
          '`/istoric` — istoricul plăților, cu filtre',
          '`/raport [perioada]` — banii încasați',
          '`/top` — clasament plătitori / colectori',
          '`/activi` — cine are taxe active',
          '`/export` — fișier CSV pentru Excel',
        ].join('\n'),
      },
      {
        name: '👥 Pentru toți',
        value: ['`/taxe` — lista taxelor și prețurile', '`/verifica` — situația taxelor tale', '`/ajutor` — acest mesaj'].join('\n'),
      },
      {
        name: '⚙️ Configurare (admin)',
        value: [
          '`/config vezi` — toată configurația',
          '`/config taxa adauga|editeaza|sterge` — taxe, prețuri, durate, comenzi rapide',
          '`/config canal` • `/config rol` • `/config reducere`',
          '`/config moneda` • `/config aspect` • `/config optiune`',
          '`/config mesaj` — editează orice mesaj al botului',
          '`/config export` / `/config import` — backup JSON',
          '`/panou` — panou cu butoane pentru jucători',
        ].join('\n'),
      }
    );
  await i.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

module.exports = { verifica, istoric, raport, top, activi, taxe, exporta, ajutor, liniePlata };
