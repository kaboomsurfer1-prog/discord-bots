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
  const idJoc = i.options.getString('id')?.trim() || null;
  let cine;
  let titlu;
  if (!user && !nume && !idJoc) {
    cine = { membruId: i.user.id };
    titlu = (i.member && i.member.displayName) || i.user.globalName || i.user.username;
  } else {
    const sine = user && user.id === i.user.id;
    if (!sine && !d.esteStaff(i, cfg) && !cfg.optiuni.verificarePublica) {
      return d.eroare(i, 'Poți verifica doar propriile taxe (folosește `/verifica` fără nimic).');
    }
    cine = { membruId: user ? user.id : null, numeIC: nume, idJoc };
    const cunoscut = idJoc ? T.jucatorCunoscut(data, idJoc) : null;
    titlu = user ? numeAfisat(i) : idJoc ? `ID ${idJoc}${(cunoscut && cunoscut.numeIC) || nume ? ` (${nume || cunoscut.numeIC})` : ''}` : nume;
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
  const idJoc = i.options.getString('id')?.trim() || null;
  const sine = user && user.id === i.user.id;
  if (!staff && !sine && (!cfg.optiuni.verificarePublica || (!user && !nume && !idJoc))) {
    return d.eroare(i, 'Doar staff-ul poate vedea istoricul complet. Tu poți folosi `/istoric membru:@tu` sau `/verifica`.');
  }
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const per = f.perioada(i.options.getString('perioada') || 'tot', cfg.optiuni.fusOrar);
  const colector = i.options.getUser('colector');
  const lista = T.filtreaza(data, {
    membruId: user ? user.id : null,
    idJoc: user ? null : idJoc,
    numeIC: user || idJoc ? null : nume,
    taxaId: taxa ? taxa.id : null,
    colectorId: colector ? colector.id : null,
    de: per.de,
    pana: per.pana,
    anulate: !!i.options.getBoolean('anulate'),
  });
  const total = lista.filter((p) => p.status !== 'anulat').reduce((s, p) => s + p.total, 0);
  const filtre = [
    user ? `👤 ${numeAfisat(i)}` : idJoc ? `🎮 ID ${idJoc}` : nume ? `🪪 ${nume}` : null,
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

/** Un câmp de embed cu TOATE detaliile unei plăți. */
function campPlataDetaliat(cfg, p, acum = Date.now()) {
  const anulata = p.status === 'anulat';
  const lin = [];
  lin.push(`👤 **Plătitor:** ${T.eticheta(p)}`);
  lin.push(`🧾 **Încasat de:** <@${p.colectorId}>${p.sursa === 'cerere' && p.cerereId ? ` (din cererea #${p.cerereId})` : ''}`);
  lin.push(`🕒 **Data:** ${f.ts(p.creat, 'F')} (${f.ts(p.creat, 'R')})`);
  const asteptat = Math.round((p.sumaUnitara * p.cantitate * (100 - (p.reducere || 0))) / 100);
  lin.push(
    p.total === asteptat
      ? `💵 **Sumă:** ${f.suma(p.sumaUnitara, cfg)} × ${p.cantitate}${p.reducere ? ` − ${p.reducere}%` : ''} = **${f.suma(p.total, cfg)}**`
      : `💵 **Sumă:** **${f.suma(p.total, cfg)}** _(preț ${f.suma(p.sumaUnitara, cfg)} × ${p.cantitate}, sumă modificată de staff)_`
  );
  if (p.expira) {
    lin.push(`⏳ **Expiră:** ${f.ts(p.expira, 'f')} ${p.expira > acum ? `(${f.ts(p.expira, 'R')})` : '— **expirată**'}`);
  }
  if (p.nota) lin.push(`📝 **Notă:** ${f.trunc(p.nota, 150)}`);
  const linkuri = [];
  if (p.dovada && f.esteUrl(p.dovada)) linkuri.push(`[📎 Dovadă](${p.dovada})`);
  if (p.logUrl && p.logUrl !== p.dovada) linkuri.push(`[🔗 Mesaj log](${p.logUrl})`);
  if (linkuri.length) lin.push(linkuri.join(' • '));
  if (p.modificari && p.modificari.length) {
    const m = p.modificari[p.modificari.length - 1];
    lin.push(`✏️ **Modificată** de <@${m.de}> ${f.ts(m.la, 'R')}${p.modificari.length > 1 ? ` (${p.modificari.length} modificări)` : ''}`);
  }
  if (anulata) {
    lin.push(
      `🚫 **Anulată** de <@${p.anulatDe}> ${f.ts(p.anulatLa || p.creat, 'R')}${p.motivAnulare ? ` — ${f.trunc(p.motivAnulare, 100)}` : ''}`
    );
  }
  return {
    name: f.trunc(`${anulata ? '🚫 ANULATĂ • ' : ''}#${p.id} • ${p.emoji} ${p.taxaNume} ×${p.cantitate} — ${f.suma(p.total, cfg)}`, 256),
    value: f.trunc(lin.join('\n'), 900),
    inline: false,
  };
}

/** /lista — toate plățile cu toate detaliile (când, cine a încasat, cine a plătit...). */
async function lista(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  const staff = d.esteStaff(i, cfg);
  const user = i.options.getUser('membru');
  const nume = i.options.getString('nume')?.trim() || null;
  const idJoc = i.options.getString('id')?.trim() || null;
  const sine = user && user.id === i.user.id;

  // o singură plată, după numărul ei
  const id = i.options.getInteger('plata');
  if (id) {
    const p = T.gasestePlata(data, id);
    if (!p) return d.eroare(i, `Plata #${id} nu există.`);
    if (!staff && p.membruId !== i.user.id) return d.eroare(i, 'Poți vedea doar plățile tale.');
    const e = d
      .embedBaza(cfg, { culoare: p.status === 'anulat' ? '#E74C3C' : (cfg.taxe.find((t) => t.id === p.taxaId) || {}).culoare })
      .setTitle(f.trunc(`🔎 Detalii plată #${p.id}`, 256))
      .addFields(campPlataDetaliat(cfg, p));
    return i.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: d.FARA_PING });
  }

  if (!staff && !sine && (!cfg.optiuni.verificarePublica || (!user && !nume && !idJoc))) {
    return d.eroare(i, 'Doar staff-ul poate vedea lista completă. Tu poți folosi `/lista membru:@tu` sau `/verifica`.');
  }
  const tipQ = i.options.getString('tip');
  const taxa = tipQ ? T.gasesteTaxa(cfg, tipQ) : null;
  if (tipQ && !taxa) return d.eroare(i, 'Taxa nu există.');
  const per = f.perioada(i.options.getString('perioada') || 'tot', cfg.optiuni.fusOrar);
  const colector = i.options.getUser('colector');
  const status = i.options.getString('status') || 'toate';
  const acum = Date.now();

  let rez = T.filtreaza(data, {
    membruId: user ? user.id : null,
    idJoc: user ? null : idJoc,
    numeIC: user || idJoc ? null : nume,
    taxaId: taxa ? taxa.id : null,
    colectorId: colector ? colector.id : null,
    de: per.de,
    pana: per.pana,
    anulate: status === 'toate' || status === 'anulate',
  });
  if (status === 'anulate') rez = rez.filter((p) => p.status === 'anulat');
  if (status === 'valabile') rez = rez.filter((p) => p.expira && p.expira > acum);
  if (status === 'expirate') rez = rez.filter((p) => p.expira && p.expira <= acum);

  const ordine = i.options.getString('ordine') || 'noi';
  if (ordine === 'vechi') rez.sort((a, b) => a.creat - b.creat || a.id - b.id);
  else if (ordine === 'suma') rez.sort((a, b) => b.total - a.total || b.creat - a.creat);

  const valide = rez.filter((p) => p.status !== 'anulat');
  const s = T.statistici(valide);
  const platitori = Object.keys(s.perPlatitor).length;
  const perTaxa = Object.values(s.perTaxa)
    .sort((a, b) => b.total - a.total)
    .map((t) => `${t.emoji} ${t.nume}: **${f.suma(t.total, cfg)}** (${t.numar})`)
    .join(' • ');
  const filtre = [
    user ? `👤 ${numeAfisat(i)}` : idJoc ? `🎮 ID ${idJoc}` : nume ? `🪪 ${nume}` : null,
    taxa ? `${taxa.emoji} ${taxa.nume}` : null,
    colector ? `🧾 <@${colector.id}>` : null,
    `📅 ${per.eticheta}`,
    status !== 'toate' ? `📌 ${status}` : null,
  ].filter(Boolean);
  const sus = [
    filtre.join(' • '),
    `💰 Total: **${f.suma(s.total, cfg)}** • 🧾 **${s.numar}** plăți • 👥 **${platitori}** plătitori${rez.length !== valide.length ? ` • 🚫 ${rez.length - valide.length} anulate` : ''}`,
    perTaxa,
  ]
    .filter(Boolean)
    .join('\n');

  await paginare(i, {
    cfg,
    titlu: '📜 Lista plăților',
    sus,
    campuri: rez.map((p) => campPlataDetaliat(cfg, p, acum)),
    perPagina: 5,
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
            ...rapide.map((t) => `\`/${t.comanda} id\` — ${t.emoji} ${t.nume} (${f.suma(t.suma, cfg)})`),
            '`/plata tip id [membru] [nume] [cantitate] [suma] [dovada] [nota]` — încasare completă',
            '`/anuleaza plata [motiv]` — anulează o plată (rămâne în istoric)',
            '`/editeaza plata` — corectează o plată (ID, membru, cantitate, sumă...)',
            '`/editeaza jucator id` — schimbă ID / nume / membru pe toate plățile unui ID',
            '`/sterge plata` • `/sterge jucator id` — șterge definitiv (admin)',
            ...(cfg.canale.comenzi ? [`📍 Încasările se fac doar în <#${cfg.canale.comenzi}>`] : []),
          ].join('\n'),
          1024
        ),
      },
      {
        name: '📊 Evidență (staff)',
        value: [
          '`/lista` — toate plățile cu toate detaliile (data, ora, cine a încasat, cine a plătit, dovadă)',
          '`/lista plata:12` — detaliile complete ale unei plăți • `/lista id:123` — plățile unui ID',
          '`/istoric` — istoricul plăților, compact',
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
          '`/config taxa adauga|editeaza|sterge|restaureaza` — tipuri de taxe, prețuri, durate, comenzi rapide',
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

module.exports = { verifica, istoric, lista, raport, top, activi, taxe, exporta, ajutor, liniePlata, campPlataDetaliat };
