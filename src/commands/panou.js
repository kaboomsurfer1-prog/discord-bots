'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const d = require('../utils/discord');
const UI = require('../services/ui');

/** /panou — trimite panoul cu butoane; se actualizează singur când schimbi taxele. */
async function panou(i, ctx) {
  const { store } = ctx;
  const cfg = store.config(i.guildId);
  if (!d.esteAdmin(i, cfg)) return d.eroare(i, 'Doar adminii pot trimite panoul.');
  const ales = i.options.getChannel('canal');
  const idCanal = ales ? ales.id : i.channelId;
  const ch = i.guild.channels.cache.get(idCanal) || (await i.guild.channels.fetch(idCanal).catch(() => null));
  if (!ch || typeof ch.isTextBased !== 'function' || !ch.isTextBased()) return d.eroare(i, 'Nu pot trimite panoul în acest canal.');
  const me = i.guild.members.me;
  const perm = me && typeof ch.permissionsFor === 'function' ? ch.permissionsFor(me) : null;
  if (perm && !perm.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return d.eroare(i, `Botul nu poate scrie în <#${ch.id}> (îi trebuie View Channel, Send Messages, Embed Links).`);
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let msg;
  try {
    msg = await ch.send(UI.construiestePanou(cfg, i.guild));
  } catch (e) {
    return d.eroare(i, `Nu am putut trimite panoul: ${e.message}`);
  }
  cfg.panouri.push({ canalId: ch.id, mesajId: msg.id });
  if (cfg.panouri.length > 10) cfg.panouri = cfg.panouri.slice(-10);
  store.save(i.guildId);
  let info = `Panoul a fost trimis în <#${ch.id}>. Se actualizează automat când modifici taxele.`;
  if (cfg.optiuni.cereriJucatori && !cfg.canale.cereri) {
    info += cfg.canale.log
      ? '\nℹ️ Cererile jucătorilor vor ajunge în canalul de log. Poți seta un canal separat: `/config canal tip:Cereri`.'
      : '\n⚠️ Setează canalul unde ajung cererile: `/config canal tip:Cereri`.';
  }
  if (cfg.optiuni.cereriJucatori && !cfg.roluri.staff.length) {
    info += '\nℹ️ Setează rolul staff care aprobă cererile: `/config rol tip:Staff actiune:Adaugă`.';
  }
  await d.succes(i, info);
}

module.exports = { panou };
