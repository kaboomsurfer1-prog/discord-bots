'use strict';

const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const f = require('./format');

const ROSU = 0xe74c3c;
const VERDE = 0x2ecc71;
const FARA_PING = { parse: [] };

function areRol(member, rolId) {
  if (!member || !rolId || !member.roles) return false;
  if (Array.isArray(member.roles)) return member.roles.includes(rolId);
  if (member.roles.cache) return member.roles.cache.has(rolId);
  return false;
}

function rolurileMembrului(member) {
  if (!member || !member.roles) return [];
  if (Array.isArray(member.roles)) return member.roles;
  if (member.roles.cache) return [...member.roles.cache.keys()];
  return [];
}

function esteAdmin(interaction, cfg) {
  const p = interaction.memberPermissions;
  if (p && (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild))) return true;
  return cfg.roluri.admin.some((id) => areRol(interaction.member, id));
}

function esteStaff(interaction, cfg) {
  if (esteAdmin(interaction, cfg)) return true;
  return cfg.roluri.staff.some((id) => areRol(interaction.member, id));
}

function embedBaza(cfg, opt = {}) {
  const e = new EmbedBuilder().setColor(f.culoareInt(opt.culoare || cfg.aspect.culoare));
  if (cfg.aspect.footer) e.setFooter({ text: f.trunc(cfg.aspect.footer, 2000) });
  if (opt.timestamp !== false) e.setTimestamp();
  return e;
}

async function raspunde(i, payload) {
  if (i.deferred) {
    const { flags, ...rest } = payload;
    return i.editReply(rest);
  }
  if (i.replied) return i.followUp(payload);
  return i.reply(payload);
}

function eroare(i, text) {
  return raspunde(i, {
    embeds: [new EmbedBuilder().setColor(ROSU).setDescription(`❌ ${text}`)],
    flags: MessageFlags.Ephemeral,
  });
}

function succes(i, text, ephemeral = true) {
  return raspunde(i, {
    embeds: [new EmbedBuilder().setColor(VERDE).setDescription(`✅ ${text}`)],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
  });
}

async function gasesteCanal(guild, canalId) {
  if (!guild || !canalId) return null;
  try {
    const ch = guild.channels.cache.get(canalId) || (await guild.channels.fetch(canalId));
    return ch && ch.isTextBased() ? ch : null;
  } catch {
    return null;
  }
}

async function trimiteInCanal(guild, canalId, payload) {
  const ch = await gasesteCanal(guild, canalId);
  if (!ch) return null;
  try {
    return await ch.send({ allowedMentions: FARA_PING, ...payload });
  } catch (e) {
    console.warn(`[discord] Nu pot trimite în canalul ${canalId}: ${e.message}`);
    return null;
  }
}

function log(guild, cfg, payload) {
  return trimiteInCanal(guild, cfg.canale.log, payload);
}

async function dm(client, userId, payload) {
  if (!userId) return false;
  try {
    const u = await client.users.fetch(userId);
    await u.send(payload);
    return true;
  } catch {
    return false;
  }
}

function platitor(p) {
  if (p.membruId) return `<@${p.membruId}>${p.numeIC ? ` (${p.numeIC})` : ''}`;
  return `**${p.numeIC || 'Necunoscut'}**`;
}

async function modificaRol(guild, membruId, rolId, adauga) {
  if (!guild || !membruId || !rolId) return { ok: true };
  try {
    const m = await guild.members.fetch(membruId);
    if (adauga) {
      if (!m.roles.cache.has(rolId)) await m.roles.add(rolId, 'Taxă Cayo Perico plătită');
    } else if (m.roles.cache.has(rolId)) {
      await m.roles.remove(rolId, 'Taxă Cayo Perico expirată/anulată');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motiv: e.message };
  }
}

module.exports = {
  ROSU,
  VERDE,
  FARA_PING,
  areRol,
  rolurileMembrului,
  esteAdmin,
  esteStaff,
  embedBaza,
  raspunde,
  eroare,
  succes,
  gasesteCanal,
  trimiteInCanal,
  log,
  dm,
  platitor,
  modificaRol,
};
