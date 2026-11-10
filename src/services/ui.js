'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('./taxe');

const MEDALII = ['🥇', '🥈', '🥉'];

function medalie(i) {
  return MEDALII[i] || `**${i + 1}.**`;
}

function listaTaxe(cfg, doarPanou = false) {
  const taxe = cfg.taxe.filter((t) => t.activa && (!doarPanou || t.inPanou));
  if (!taxe.length) return '_Nu există taxe active._';
  return taxe
    .map((t) => {
      let s = `${t.emoji} **${t.nume}** — **${f.suma(t.suma, cfg)}**`;
      if (t.durata > 0) s += ` • valabilă ${f.durata(t.durata)}`;
      if (t.descriere) s += `\n> ${t.descriere}`;
      return s;
    })
    .join('\n');
}

function varsPlata(cfg, p, guild, extra = {}) {
  return {
    platitor: T.eticheta(p),
    membru: p.membruId ? `<@${p.membruId}>` : p.numeIC || '—',
    nume: p.numeIC || '—',
    id_joc: p.idJoc || '—',
    taxa: p.taxaNume,
    emoji: p.emoji,
    suma: f.suma(p.sumaUnitara, cfg),
    cantitate: p.cantitate,
    total: f.suma(p.total, cfg),
    colector: p.colectorId ? `<@${p.colectorId}>` : '—',
    id: p.id,
    id_cerere: p.cerereId || '—',
    expira: p.expira ? f.ts(p.expira, 'f') : 'niciodată',
    expira_relativ: p.expira ? f.ts(p.expira, 'R') : 'niciodată',
    expira_text: p.expira ? `⏳ Valabilă până la ${f.ts(p.expira, 'f')} (${f.ts(p.expira, 'R')}).` : '',
    server: guild ? guild.name : '',
    motiv: '—',
    lista_taxe: listaTaxe(cfg, true),
    ...extra,
  };
}

function camp(name, value, inline = true) {
  const v = String(value ?? '').trim();
  return { name: f.trunc(name, 256), value: f.trunc(v || '—', 1024), inline };
}

function embedPlata(cfg, p, guild, opt = {}) {
  const taxa = cfg.taxe.find((t) => t.id === p.taxaId);
  const anulata = p.status === 'anulat';
  const e = d
    .embedBaza(cfg, { culoare: anulata ? '#E74C3C' : taxa ? taxa.culoare : null })
    .setTitle(f.trunc(`${p.emoji} ${p.taxaNume}${anulata ? ' — ANULATĂ' : ''}`, 256))
    .setDescription(f.trunc(f.render(cfg.mesaje.plata_confirmare, varsPlata(cfg, p, guild)), 4000) || '​');
  const campuri = [
    camp('👤 Plătitor', T.eticheta(p)),
    camp('🔢 Cantitate', `×${p.cantitate}`),
    camp('💰 Total', f.suma(p.total, cfg) + (p.reducere ? ` (reducere ${p.reducere}%)` : '')),
    camp('🧾 Încasat de', p.colectorId ? `<@${p.colectorId}>` : '—'),
    camp('🆔 Plată', `#${p.id}${p.cerereId ? ` (cerere #${p.cerereId})` : ''}`),
  ];
  if (p.expira) campuri.push(camp('⏳ Expiră', `${f.ts(p.expira, 'f')}\n${f.ts(p.expira, 'R')}`));
  if (p.nota) campuri.push(camp('📝 Notă', p.nota, false));
  if (p.dovada && !opt.imagine) campuri.push(camp('📎 Dovadă', p.dovada, false));
  if (anulata) {
    campuri.push(
      camp('🚫 Anulată de', `<@${p.anulatDe}> • ${f.ts(p.anulatLa || Date.now(), 'R')}${p.motivAnulare ? `\n**Motiv:** ${p.motivAnulare}` : ''}`, false)
    );
  }
  e.addFields(campuri);
  if (opt.imagine) e.setImage(opt.imagine);
  if (cfg.aspect.thumbnail) e.setThumbnail(cfg.aspect.thumbnail);
  return e;
}

/* ------------------------------ Panou ------------------------------ */

function butonTaxa(t, customId, stil) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(f.trunc(t.nume, 80)).setStyle(stil);
  if (f.esteEmoji(t.emoji)) b.setEmoji(t.emoji);
  return b;
}

function randuri(butoane) {
  const rows = [];
  for (let i = 0; i < butoane.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(butoane.slice(i, i + 5)));
  }
  return rows;
}

function construiestePanou(cfg, guild) {
  const e = d
    .embedBaza(cfg, { timestamp: false })
    .setTitle(f.trunc(f.render(cfg.mesaje.panou_titlu, { server: guild.name }), 256) || 'Taxe')
    .setDescription(
      f.trunc(f.render(cfg.mesaje.panou_descriere, { lista_taxe: listaTaxe(cfg, true), server: guild.name }), 4096) || '​'
    );
  if (cfg.aspect.thumbnail) e.setThumbnail(cfg.aspect.thumbnail);
  if (cfg.aspect.imagine) e.setImage(cfg.aspect.imagine);
  const butoane = [];
  if (cfg.optiuni.cereriJucatori) {
    for (const t of cfg.taxe.filter((x) => x.activa && x.inPanou).slice(0, 23)) {
      butoane.push(butonTaxa(t, `cayo:cerere:${t.id}`, ButtonStyle.Primary));
    }
  }
  butoane.push(new ButtonBuilder().setCustomId('cayo:status').setLabel('Taxele mele').setEmoji('📋').setStyle(ButtonStyle.Secondary));
  butoane.push(new ButtonBuilder().setCustomId('cayo:preturi').setLabel('Prețuri').setEmoji('💰').setStyle(ButtonStyle.Secondary));
  return { embeds: [e], components: randuri(butoane) };
}

async function actualizeazaPanouri(client, store, gid) {
  const cfg = store.config(gid);
  const guild = client.guilds.cache.get(gid);
  if (!guild || !cfg.panouri.length) return;
  const payload = construiestePanou(cfg, guild);
  const pastrate = [];
  for (const p of cfg.panouri) {
    try {
      const ch = await guild.channels.fetch(p.canalId);
      const msg = await ch.messages.fetch(p.mesajId);
      await msg.edit(payload);
      pastrate.push(p);
    } catch (e) {
      // 10003 = canal inexistent, 10008 = mesaj inexistent -> scoatem panoul din listă
      if (e && (e.code === 10003 || e.code === 10008)) continue;
      pastrate.push(p);
      console.warn(`[panou] Nu am putut actualiza panoul ${p.mesajId}: ${e.message}`);
    }
  }
  if (pastrate.length !== cfg.panouri.length) {
    cfg.panouri = pastrate;
    store.save(gid);
  }
}

/* ------------------------------ Cereri ----------------------------- */

const STATUS_CERERE = {
  asteptare: { text: '🕒 În așteptare', culoare: '#F1C40F' },
  aprobat: { text: '✅ Aprobată', culoare: '#2ECC71' },
  respins: { text: '❌ Respinsă', culoare: '#E74C3C' },
};

function embedCerere(cfg, c, taxa) {
  const st = STATUS_CERERE[c.status] || STATUS_CERERE.asteptare;
  const t = taxa || { nume: c.taxaId, emoji: '💰', suma: 0 };
  const calc = taxa ? T.calculeaza(cfg, taxa, { roluri: c.roluri || [], cantitate: c.cantitate }) : { total: 0, reducere: 0 };
  const e = d
    .embedBaza(cfg, { culoare: st.culoare })
    .setTitle(f.trunc(`📨 Cerere #${c.id} — ${t.emoji} ${t.nume}`, 256))
    .addFields(
      camp('👤 Jucător', `<@${c.membruId}>`),
      camp('🪪 Nume IC', c.numeIC || '—'),
      camp('🎮 ID joc', c.idJoc || '—'),
      camp('🔢 Cantitate', `×${c.cantitate}`),
      camp('💰 De plată', f.suma(calc.total, cfg) + (calc.reducere ? ` (reducere ${calc.reducere}%)` : '')),
      camp('📌 Status', st.text)
    );
  if (c.dovada) e.addFields(camp('📎 Dovadă', c.dovada, false));
  if (c.nota) e.addFields(camp('📝 Notă', c.nota, false));
  if (c.status !== 'asteptare' && c.procesatDe) {
    let txt = `<@${c.procesatDe}> • ${f.ts(c.procesatLa || Date.now(), 'R')}`;
    if (c.plataId) txt += `\nPlata #${c.plataId}`;
    if (c.motiv) txt += `\n**Motiv:** ${c.motiv}`;
    e.addFields(camp(c.status === 'aprobat' ? '✅ Aprobată de' : '❌ Respinsă de', txt, false));
  }
  if (c.dovada && f.esteUrl(c.dovada) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(c.dovada)) e.setImage(c.dovada);
  return e;
}

function butoaneCerere(c, dezactivat = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cayo:aprob:${c.id}`)
        .setLabel('Aprobă')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(dezactivat),
      new ButtonBuilder()
        .setCustomId(`cayo:resp:${c.id}`)
        .setLabel('Respinge')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(dezactivat)
    ),
  ];
}

/* ------------------------------ Stare ------------------------------ */

function embedStare(cfg, data, cine, titluCine) {
  const st = T.stare(data, cfg, cine);
  const e = d.embedBaza(cfg).setTitle(f.trunc(`📋 Situația taxelor — ${titluCine}`, 256));
  if (cfg.aspect.thumbnail) e.setThumbnail(cfg.aspect.thumbnail);
  const campuri = [];
  for (const r of st.rezultate) {
    if (r.taxa.sters && !r.numar) continue;
    let v;
    if (r.taxa.durata > 0 || r.expira) {
      v = r.activa
        ? `✅ **Activă** — expiră ${f.ts(r.expira, 'f')} (${f.ts(r.expira, 'R')})`
        : r.numar
          ? `❌ **Expirată** — ultima plată ${f.ts(r.ultima.creat, 'R')}`
          : '❌ **Neplătită**';
    } else {
      v = r.numar ? `✅ Plătită de **${r.numar}** ori • ultima ${f.ts(r.ultima.creat, 'R')}` : '➖ Niciodată plătită';
    }
    if (r.numar) v += `\nTotal: **${f.suma(r.total, cfg)}**`;
    campuri.push(camp(`${r.taxa.emoji} ${r.taxa.nume}${r.taxa.sters ? ' (ștearsă)' : ''}`, v, false));
  }
  if (!campuri.length) campuri.push(camp('Nicio taxă', 'Nu există taxe configurate.', false));
  e.addFields(campuri.slice(0, 20));
  const ultimele = st.plati.sort((a, b) => b.creat - a.creat).slice(0, 5);
  e.addFields(camp('💰 Total plătit', f.suma(st.totalGeneral, cfg)));
  e.addFields(camp('🧾 Plăți', String(st.plati.length)));
  if (ultimele.length) {
    e.addFields(
      camp(
        '🕘 Ultimele plăți',
        ultimele.map((p) => `\`#${p.id}\` ${p.emoji} ${p.taxaNume} ×${p.cantitate} • **${f.suma(p.total, cfg)}** • ${f.ts(p.creat, 'R')}`).join('\n'),
        false
      )
    );
  }
  return e;
}

/* ------------------------------ Raport ----------------------------- */

function embedRaport(cfg, data, per, flt = {}) {
  const plati = T.filtreaza(data, { de: per.de, pana: per.pana, taxaId: flt.taxaId });
  const s = T.statistici(plati);
  const e = d
    .embedBaza(cfg)
    .setTitle(f.trunc(`📊 Raport taxe — ${per.eticheta}`, 256))
    .setDescription(
      per.de ? `Perioada: ${f.ts(per.de, 'f')} → ${f.ts(per.pana, 'f')}` : `Până la ${f.ts(per.pana, 'f')}`
    );
  if (cfg.aspect.thumbnail) e.setThumbnail(cfg.aspect.thumbnail);
  e.addFields(camp('💰 Total încasat', `**${f.suma(s.total, cfg)}**`), camp('🧾 Plăți', String(s.numar)), camp('🔢 Bucăți', String(s.cantitate)));
  const perTaxa = Object.values(s.perTaxa).sort((a, b) => b.total - a.total);
  e.addFields(
    camp(
      '🏷️ Pe taxe',
      perTaxa.length ? perTaxa.map((t) => `${t.emoji} **${t.nume}** — ${f.suma(t.total, cfg)} (${t.numar} plăți, ×${t.cantitate})`).join('\n') : '_Nicio plată._',
      false
    )
  );
  const col = Object.values(s.perColector).sort((a, b) => b.total - a.total).slice(0, 5);
  if (col.length) e.addFields(camp('🧾 Top colectori', col.map((c, i) => `${medalie(i)} <@${c.id}> — ${f.suma(c.total, cfg)} (${c.numar})`).join('\n'), false));
  const pl = Object.values(s.perPlatitor).sort((a, b) => b.total - a.total).slice(0, 5);
  if (pl.length) e.addFields(camp('👑 Top plătitori', pl.map((c, i) => `${medalie(i)} ${c.eticheta} — ${f.suma(c.total, cfg)} (${c.numar})`).join('\n'), false));
  return e;
}

/* --------------------- Efectele unei plăți noi --------------------- */

/**
 * După înregistrare: rol automat, log (cu re-upload dovadă), mesaj privat.
 * Returnează lista de avertismente (ex: nu am putut da rolul).
 */
async function dupaPlata(client, store, guild, p, opt = {}) {
  const cfg = store.config(guild.id);
  const avert = [];
  const taxa = cfg.taxe.find((t) => t.id === p.taxaId);

  if (taxa && taxa.rolId && p.membruId) {
    const r = await d.modificaRol(guild, p.membruId, taxa.rolId, true);
    if (!r.ok) avert.push(`Nu am putut da rolul <@&${taxa.rolId}> (${r.motiv}). Verifică permisiunea „Manage Roles” și ordinea rolurilor.`);
  }

  if (cfg.canale.log) {
    const payload = { embeds: [] };
    let imagine = null;
    if (opt.atasament) {
      const nume = (opt.atasament.name || 'dovada.png').replace(/[^\w.-]/g, '_');
      payload.files = [{ attachment: opt.atasament.url, name: nume }];
      if (/\.(png|jpe?g|gif|webp)$/i.test(nume)) imagine = `attachment://${nume}`;
    }
    payload.embeds.push(embedPlata(cfg, p, guild, { imagine }));
    const msg = await d.log(guild, cfg, payload);
    if (msg) {
      p.logUrl = msg.url;
      if (opt.atasament) p.dovada = msg.url;
      store.save(guild.id);
    }
  }

  if (cfg.optiuni.dmNotificari && p.membruId && opt.dm !== false) {
    const sablon = opt.cerere ? cfg.mesaje.dm_cerere_aprobata : cfg.mesaje.dm_plata;
    const text = f.render(sablon, varsPlata(cfg, p, guild));
    const e = d.embedBaza(cfg, { culoare: taxa ? taxa.culoare : null }).setTitle(f.trunc(cfg.aspect.titlu || guild.name, 256)).setDescription(f.trunc(text, 4000) || '​');
    await d.dm(client, p.membruId, { embeds: [e] });
  }
  return avert;
}

module.exports = {
  listaTaxe,
  varsPlata,
  embedPlata,
  construiestePanou,
  actualizeazaPanouri,
  embedCerere,
  butoaneCerere,
  embedStare,
  embedRaport,
  dupaPlata,
  medalie,
  camp,
  randuri,
};
