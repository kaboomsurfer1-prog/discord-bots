'use strict';

const { MessageFlags } = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('../services/taxe');
const UI = require('../services/ui');

/** /plata și comenzile rapide (/vama, /droguri, ...). */
async function plata(i, ctx, taxaFortata = null) {
  const { store, client } = ctx;
  const cfg = store.config(i.guildId);
  if (!d.esteStaff(i, cfg)) {
    return d.eroare(i, 'Nu ai permisiunea să încasezi taxe. Un admin poate seta rolurile staff cu `/config rol`.');
  }
  const canal = cfg.canale.comenzi;
  if (canal && i.channelId !== canal && !(i.channel && i.channel.parentId === canal)) {
    return d.eroare(i, `Comenzile de încasare se folosesc doar în canalul <#${canal}>.`);
  }
  const taxa = T.gasesteTaxa(cfg, taxaFortata || i.options.getString('tip'));
  if (!taxa) return d.eroare(i, 'Taxa nu există. Vezi lista cu `/taxe`.');
  if (!taxa.activa) return d.eroare(i, `Taxa **${taxa.nume}** este dezactivată.`);

  const idJoc = (i.options.getString('id') || '').trim();
  if (!idJoc) return d.eroare(i, 'Scrie **ID-ul** jucătorului din joc.');
  const user = i.options.getUser('membru');
  if (user && user.bot) return d.eroare(i, 'Nu poți înregistra plăți pentru boți.');
  // completăm automat numele / membrul din plățile anterioare cu același ID
  const cunoscut = T.jucatorCunoscut(ctx.store.get(i.guildId), idJoc);
  const numeIC = i.options.getString('nume')?.trim() || (cunoscut && cunoscut.numeIC) || null;
  const membruId = user ? user.id : (cunoscut && cunoscut.membruId) || null;

  const cantitate = i.options.getInteger('cantitate') ?? 1;
  if (cantitate > cfg.optiuni.cantitateMaxima) {
    return d.eroare(i, `Cantitatea maximă la o plată este **${cfg.optiuni.cantitateMaxima}** (se schimbă din \`/config optiune\`).`);
  }

  const sumaStr = i.options.getString('suma');
  let sumaOverride = null;
  if (sumaStr) {
    if (!cfg.optiuni.sumaPersonalizata && !d.esteAdmin(i, cfg)) {
      return d.eroare(i, 'Doar adminii pot modifica suma (opțiunea `suma_personalizata` e oprită).');
    }
    sumaOverride = f.parseSuma(sumaStr);
    if (sumaOverride === null) return d.eroare(i, `Suma „${sumaStr}” nu este validă. Exemple: \`30000\`, \`30.000\`, \`30k\`.`);
  }

  const atasament = i.options.getAttachment('dovada');
  await i.deferReply(cfg.optiuni.confirmarePublica ? {} : { flags: MessageFlags.Ephemeral });

  let roluri = d.rolurileMembrului(i.options.getMember('membru'));
  if (!user && membruId) {
    const m = await i.guild.members.fetch(membruId).catch(() => null);
    roluri = d.rolurileMembrului(m);
  }

  const p = T.inregistreazaPlata(store, i.guildId, {
    taxa,
    membruId,
    numeIC,
    idJoc,
    cantitate,
    sumaOverride,
    roluri,
    colectorId: i.user.id,
    nota: i.options.getString('nota'),
    dovada: atasament ? atasament.url : null,
    sursa: 'comanda',
  });

  const avert = await UI.dupaPlata(client, store, i.guild, p, { atasament });
  const eImagine = atasament && /^image\//.test(atasament.contentType || '') ? atasament.url : null;
  await i.editReply({ embeds: [UI.embedPlata(cfg, p, i.guild, { imagine: eImagine })], allowedMentions: d.FARA_PING });
  if (avert.length) await i.followUp({ content: `⚠️ ${avert.join('\n')}`, flags: MessageFlags.Ephemeral });
}

/** /anuleaza */
async function anuleaza(i, ctx) {
  const { store } = ctx;
  const cfg = store.config(i.guildId);
  const poate = d.esteAdmin(i, cfg) || (cfg.optiuni.staffPoateAnula && d.esteStaff(i, cfg));
  if (!poate) return d.eroare(i, 'Doar adminii pot anula plăți (sau staff-ul, dacă e activă opțiunea `staff_poate_anula`).');

  const id = i.options.getInteger('plata', true);
  const motiv = i.options.getString('motiv');
  const r = T.anuleazaPlata(store, i.guildId, id, i.user.id, motiv);
  if (r.eroare) return d.eroare(i, r.eroare);
  const p = r.plata;
  const data = store.get(i.guildId);

  const taxa = cfg.taxe.find((t) => t.id === p.taxaId);
  const avert = [];
  if (taxa && taxa.rolId && p.membruId && !T.areActiva(data, taxa.id, p)) {
    const rr = await d.modificaRol(i.guild, p.membruId, taxa.rolId, false);
    if (!rr.ok) avert.push(`Nu am putut scoate rolul <@&${taxa.rolId}>: ${rr.motiv}`);
  }

  const e = UI.embedPlata(cfg, p, i.guild);
  await d.log(i.guild, cfg, { embeds: [e] });
  await i.reply({
    content: avert.length ? `⚠️ ${avert.join('\n')}` : undefined,
    embeds: [e],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { plata, anuleaza };
