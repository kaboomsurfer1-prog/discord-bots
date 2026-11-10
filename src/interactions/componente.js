'use strict';

const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('../services/taxe');
const UI = require('../services/ui');
const { salveazaMesaj } = require('../commands/config');

function rand(input) {
  return new ActionRowBuilder().addComponents(input);
}

/* ------------------------------ Butoane ----------------------------- */

async function butonCerere(i, ctx, taxaId) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!cfg.optiuni.cereriJucatori) return d.eroare(i, 'Cererile de plată sunt dezactivate momentan. Contactează un membru staff.');
  const taxa = T.gasesteTaxa(cfg, taxaId);
  if (!taxa || !taxa.activa) return d.eroare(i, 'Această taxă nu mai există sau este dezactivată.');
  if (!cfg.canale.cereri && !cfg.canale.log) return d.eroare(i, 'Staff-ul nu a setat încă un canal pentru cereri.');
  const existenta = data.cereri.find((c) => c.membruId === i.user.id && c.taxaId === taxa.id && c.status === 'asteptare');
  if (existenta) return d.eroare(i, `Ai deja o cerere în așteptare pentru **${taxa.nume}** (#${existenta.id}). Așteaptă răspunsul staff-ului.`);

  const inputs = [
    new TextInputBuilder()
      .setCustomId('nume')
      .setLabel('Numele tău din joc (IC)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(64)
      .setPlaceholder('Ex: Ion Popescu'),
  ];
  if (cfg.optiuni.cereIdJoc) {
    inputs.push(
      new TextInputBuilder().setCustomId('idjoc').setLabel('ID-ul tău din joc').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)
    );
  }
  inputs.push(
    new TextInputBuilder()
      .setCustomId('cantitate')
      .setLabel(f.trunc(`Cantitate (1-${cfg.optiuni.cantitateMaxima})`, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(4)
      .setPlaceholder('1'),
    new TextInputBuilder()
      .setCustomId('dovada')
      .setLabel(cfg.optiuni.dovadaObligatorie ? 'Link dovadă (screenshot) — obligatoriu' : 'Link dovadă (screenshot) — opțional')
      .setStyle(TextInputStyle.Short)
      .setRequired(!!cfg.optiuni.dovadaObligatorie)
      .setMaxLength(500)
      .setPlaceholder('https://imgur.com/...'),
    new TextInputBuilder().setCustomId('nota').setLabel('Notă (opțional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
  );
  const modal = new ModalBuilder()
    .setCustomId(`cayo:mcerere:${taxa.id}`)
    .setTitle(f.trunc(`${taxa.nume} — ${f.suma(taxa.suma, cfg)}`, 45))
    .addComponents(inputs.map(rand));
  await i.showModal(modal);
}

async function butonStatus(i, ctx) {
  const data = ctx.store.get(i.guildId);
  const titlu = (i.member && i.member.displayName) || i.user.globalName || i.user.username;
  await i.reply({ embeds: [UI.embedStare(data.config, data, { membruId: i.user.id }, titlu)], flags: MessageFlags.Ephemeral });
}

async function butonPreturi(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  const e = d.embedBaza(cfg).setTitle(f.trunc(cfg.aspect.titlu || 'Taxe', 256)).setDescription(f.trunc(UI.listaTaxe(cfg), 4096));
  const red = cfg.reduceri.filter((r) => d.areRol(i.member, r.rolId));
  if (red.length) e.addFields({ name: '🏷️ Reducerea ta', value: `${Math.max(...red.map((r) => r.procent))}% (aplicată la confirmare)` });
  await i.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

async function butonAprobare(i, ctx, cerereId) {
  const { store, client } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, 'Doar staff-ul poate aproba cererile.');
  const c = T.gasesteCerere(data, cerereId);
  if (!c) return d.eroare(i, 'Cererea nu mai există.');
  if (c.status !== 'asteptare') return d.eroare(i, `Cererea #${c.id} a fost deja procesată.`);
  const taxa = T.gasesteTaxa(cfg, c.taxaId);
  if (!taxa) return d.eroare(i, 'Taxa din această cerere a fost ștearsă.');

  // marcăm imediat ca procesată (evită dublă aprobare)
  c.status = 'aprobat';
  c.procesatDe = i.user.id;
  c.procesatLa = Date.now();
  const p = T.inregistreazaPlata(store, i.guildId, {
    taxa,
    membruId: c.membruId,
    numeIC: c.numeIC,
    idJoc: c.idJoc,
    cantitate: c.cantitate,
    roluri: c.roluri || [],
    colectorId: i.user.id,
    nota: c.nota,
    dovada: c.dovada,
    sursa: 'cerere',
    cerereId: c.id,
  });
  c.plataId = p.id;
  store.save(i.guildId);

  await i.update({ embeds: [UI.embedCerere(cfg, c, taxa)], components: UI.butoaneCerere(c, true), allowedMentions: d.FARA_PING });
  const avert = await UI.dupaPlata(client, store, i.guild, p, { cerere: true });
  await i.followUp({
    content: `✅ Cererea #${c.id} aprobată → plata **#${p.id}** (${f.suma(p.total, cfg)}).${avert.length ? `\n⚠️ ${avert.join('\n')}` : ''}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function butonRespingere(i, ctx, cerereId) {
  const data = ctx.store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, 'Doar staff-ul poate respinge cererile.');
  const c = T.gasesteCerere(data, cerereId);
  if (!c) return d.eroare(i, 'Cererea nu mai există.');
  if (c.status !== 'asteptare') return d.eroare(i, `Cererea #${c.id} a fost deja procesată.`);
  const modal = new ModalBuilder()
    .setCustomId(`cayo:mresp:${c.id}`)
    .setTitle(f.trunc(`Respinge cererea #${c.id}`, 45))
    .addComponents(
      rand(
        new TextInputBuilder()
          .setCustomId('motiv')
          .setLabel('Motivul respingerii')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(300)
          .setPlaceholder('Ex: Nu am găsit plata în joc / dovadă invalidă')
      )
    );
  await i.showModal(modal);
}

/* ------------------------------ Modale ------------------------------ */

async function modalCerere(i, ctx, taxaId) {
  const { store } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  const taxa = T.gasesteTaxa(cfg, taxaId);
  if (!taxa || !taxa.activa) return d.eroare(i, 'Această taxă nu mai există sau este dezactivată.');
  if (!cfg.optiuni.cereriJucatori) return d.eroare(i, 'Cererile de plată sunt dezactivate.');

  const val = (id) => {
    try {
      return i.fields.getTextInputValue(id).trim();
    } catch {
      return '';
    }
  };
  const numeIC = val('nume');
  const idJoc = val('idjoc') || null;
  const cantStr = val('cantitate');
  const dovada = val('dovada') || null;
  const nota = val('nota') || null;

  const cantitate = cantStr ? parseInt(cantStr, 10) : 1;
  if (!Number.isInteger(cantitate) || cantitate < 1 || cantitate > cfg.optiuni.cantitateMaxima) {
    return d.eroare(i, `Cantitatea trebuie să fie un număr între 1 și ${cfg.optiuni.cantitateMaxima}.`);
  }
  if (dovada && !f.esteUrl(dovada)) return d.eroare(i, 'Dovada trebuie să fie un link (https://...).');
  if (cfg.optiuni.dovadaObligatorie && !dovada) return d.eroare(i, 'Dovada este obligatorie.');
  const existenta = data.cereri.find((c) => c.membruId === i.user.id && c.taxaId === taxa.id && c.status === 'asteptare');
  if (existenta) return d.eroare(i, `Ai deja o cerere în așteptare (#${existenta.id}).`);

  const canalId = cfg.canale.cereri || cfg.canale.log;
  const ch = await d.gasesteCanal(i.guild, canalId);
  if (!ch) return d.eroare(i, 'Canalul pentru cereri nu este setat sau botul nu are acces la el. Anunță un admin.');

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const c = T.creeazaCerere(store, i.guildId, {
    taxa,
    membruId: i.user.id,
    numeIC,
    idJoc,
    cantitate,
    dovada,
    nota,
    roluri: d.rolurileMembrului(i.member),
  });
  const ping = cfg.optiuni.pingStaffCereri && cfg.roluri.staff.length ? cfg.roluri.staff.map((r) => `<@&${r}>`).join(' ') : undefined;
  let msg;
  try {
    msg = await ch.send({
      content: ping,
      embeds: [UI.embedCerere(cfg, c, taxa)],
      components: UI.butoaneCerere(c),
      allowedMentions: { roles: ping ? cfg.roluri.staff : [] },
    });
  } catch (e) {
    data.cereri = data.cereri.filter((x) => x.id !== c.id);
    store.save(i.guildId);
    return d.eroare(i, `Nu am putut trimite cererea în canal (${e.message}). Anunță un admin.`);
  }
  c.canalId = msg.channelId;
  c.mesajId = msg.id;
  store.save(i.guildId);
  const calc = T.calculeaza(cfg, taxa, { roluri: c.roluri, cantitate });
  await d.succes(
    i,
    `Cererea **#${c.id}** pentru ${taxa.emoji} **${taxa.nume}** ×${cantitate} a fost trimisă staff-ului.\n` +
      `💰 Sumă: **${f.suma(calc.total, cfg)}**${calc.reducere ? ` (reducere ${calc.reducere}%)` : ''}\n` +
      `Vei primi un mesaj privat când e procesată.`
  );
}

async function modalRespingere(i, ctx, cerereId) {
  const { store, client } = ctx;
  const data = store.get(i.guildId);
  const cfg = data.config;
  if (!d.esteStaff(i, cfg)) return d.eroare(i, 'Doar staff-ul poate respinge cererile.');
  const c = T.gasesteCerere(data, cerereId);
  if (!c) return d.eroare(i, 'Cererea nu mai există.');
  if (c.status !== 'asteptare') return d.eroare(i, `Cererea #${c.id} a fost deja procesată.`);
  c.status = 'respins';
  c.procesatDe = i.user.id;
  c.procesatLa = Date.now();
  c.motiv = i.fields.getTextInputValue('motiv').trim();
  store.save(i.guildId);
  const taxa = T.gasesteTaxa(cfg, c.taxaId);
  const payload = { embeds: [UI.embedCerere(cfg, c, taxa)], components: UI.butoaneCerere(c, true), allowedMentions: d.FARA_PING };

  const confirmare = { content: `❌ Cererea #${c.id} a fost respinsă.`, flags: MessageFlags.Ephemeral };
  if (i.isFromMessage()) {
    await i.update(payload);
    await i.followUp(confirmare);
  } else {
    const ch = await d.gasesteCanal(i.guild, c.canalId);
    if (ch) await ch.messages.edit(c.mesajId, payload).catch(() => {});
    await i.reply(confirmare);
  }
  await d.log(i.guild, cfg, { embeds: [UI.embedCerere(cfg, c, taxa)] });

  if (cfg.optiuni.dmNotificari) {
    const t = taxa || { nume: c.taxaId, emoji: '💰', suma: 0 };
    const total = taxa ? T.calculeaza(cfg, taxa, { roluri: c.roluri, cantitate: c.cantitate }).total : 0;
    const text = f.render(cfg.mesaje.dm_cerere_respinsa, {
      platitor: `<@${c.membruId}>`,
      membru: `<@${c.membruId}>`,
      nume: c.numeIC || '—',
      id_joc: c.idJoc || '—',
      taxa: t.nume,
      emoji: t.emoji,
      suma: f.suma(t.suma, cfg),
      cantitate: c.cantitate,
      total: f.suma(total, cfg),
      colector: `<@${i.user.id}>`,
      id: '—',
      id_cerere: c.id,
      motiv: c.motiv,
      server: i.guild.name,
      expira: '—',
      expira_relativ: '—',
      expira_text: '',
    });
    const e = d.embedBaza(cfg, { culoare: '#E74C3C' }).setTitle(f.trunc(cfg.aspect.titlu || i.guild.name, 256)).setDescription(f.trunc(text, 4000) || '​');
    await d.dm(client, c.membruId, { embeds: [e] });
  }
}

/* ------------------------------ Router ------------------------------ */

async function buton(i, ctx) {
  const [, actiune, arg] = i.customId.split(':');
  switch (actiune) {
    case 'cerere':
      return butonCerere(i, ctx, arg);
    case 'status':
      return butonStatus(i, ctx);
    case 'preturi':
      return butonPreturi(i, ctx);
    case 'aprob':
      return butonAprobare(i, ctx, arg);
    case 'resp':
      return butonRespingere(i, ctx, arg);
    default:
      return null;
  }
}

async function modal(i, ctx) {
  const [, actiune, arg] = i.customId.split(':');
  switch (actiune) {
    case 'mcerere':
      return modalCerere(i, ctx, arg);
    case 'mresp':
      return modalRespingere(i, ctx, arg);
    case 'mmesaj':
      return salveazaMesaj(i, ctx, arg);
    default:
      return null;
  }
}

module.exports = { buton, modal };
