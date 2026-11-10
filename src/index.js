'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { creeazaStore } = require('./storage');
const { comenziPentru } = require('./commands/definitions');
const { plata, anuleaza } = require('./commands/plata');
const info = require('./commands/info');
const { config } = require('./commands/config');
const { panou } = require('./commands/panou');
const componente = require('./interactions/componente');
const { pornesteScheduler } = require('./services/scheduler');
const f = require('./utils/format');
const d = require('./utils/discord');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ Lipsește variabila DISCORD_TOKEN. Adaug-o în Railway → Variables.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const store = creeazaStore();

/** Înregistrează comenzile pe un server (instant), inclusiv comenzile rapide ale taxelor. */
async function inregistreazaComenzi(guild) {
  const cfg = store.config(guild.id);
  const lista = comenziPentru(cfg);
  await guild.commands.set(lista);
  return lista.length;
}

const ctx = { client, store, inregistreazaComenzi };

const handlers = {
  plata: (i) => plata(i, ctx),
  anuleaza: (i) => anuleaza(i, ctx),
  verifica: (i) => info.verifica(i, ctx),
  istoric: (i) => info.istoric(i, ctx),
  lista: (i) => info.lista(i, ctx),
  raport: (i) => info.raport(i, ctx),
  top: (i) => info.top(i, ctx),
  activi: (i) => info.activi(i, ctx),
  taxe: (i) => info.taxe(i, ctx),
  export: (i) => info.exporta(i, ctx),
  ajutor: (i) => info.ajutor(i, ctx),
  config: (i) => config(i, ctx),
  panou: (i) => panou(i, ctx),
};

async function autocomplete(i) {
  const cfg = store.config(i.guildId);
  const focus = i.options.getFocused(true);
  if (focus.name !== 'tip' && focus.name !== 'taxa') return i.respond([]);
  const q = f.faraDiacritice(String(focus.value || '')).toLowerCase();
  const doarActive = i.commandName === 'plata';
  const rez = cfg.taxe
    .filter((t) => !doarActive || t.activa)
    .filter((t) => !q || f.faraDiacritice(t.nume).toLowerCase().includes(q) || t.id.includes(q) || (t.comanda || '').includes(q))
    .slice(0, 25)
    .map((t) => {
      const em = f.esteEmoji(t.emoji) && !t.emoji.startsWith('<') ? `${t.emoji} ` : '';
      return { name: f.trunc(`${em}${t.nume} — ${f.suma(t.suma, cfg)}${t.activa ? '' : ' (dezactivată)'}`, 100), value: t.id };
    });
  return i.respond(rez);
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.inGuild()) {
      if (i.isRepliable()) await i.reply({ content: 'Botul funcționează doar pe server.' });
      return;
    }
    if (i.isAutocomplete()) return await autocomplete(i);
    if (i.isChatInputCommand()) {
      const h = handlers[i.commandName];
      if (h) return await h(i);
      // comandă rapidă a unei taxe (ex: /vama, /droguri)
      const cfg = store.config(i.guildId);
      const taxa = cfg.taxe.find((t) => t.comanda === i.commandName);
      if (taxa) return await plata(i, ctx, taxa.id);
      return await d.eroare(i, 'Comanda nu mai există. Așteaptă câteva secunde ca lista de comenzi să se actualizeze.');
    }
    if (i.isButton() && i.customId.startsWith('cayo:')) return await componente.buton(i, ctx);
    if (i.isModalSubmit() && i.customId.startsWith('cayo:')) return await componente.modal(i, ctx);
  } catch (e) {
    if (e && e.code === 10062) return; // interacțiune expirată
    console.error(`[interactiune] ${i.commandName || i.customId || i.type}:`, e);
    if (i.isRepliable()) {
      await d.eroare(i, 'A apărut o eroare. Încearcă din nou; dacă se repetă, anunță un admin.').catch(() => {});
    }
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Conectat ca ${c.user.tag} pe ${c.guilds.cache.size} server(e).`);
  c.user.setPresence({
    activities: [{ name: process.env.BOT_STATUS || '🏝️ Taxe Cayo Perico', type: ActivityType.Watching }],
    status: 'online',
  });
  // comenzile sunt pe fiecare server (apar instant); ștergem eventualele comenzi globale vechi
  await c.application.commands.set([]).catch(() => {});
  for (const guild of c.guilds.cache.values()) {
    try {
      const n = await inregistreazaComenzi(guild);
      console.log(`   • ${guild.name}: ${n} comenzi înregistrate`);
    } catch (e) {
      console.error(`   • ${guild.name}: nu am putut înregistra comenzile (${e.message}). Re-invită botul cu scope-ul applications.commands.`);
    }
  }
  pornesteScheduler(client, store);
});

client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Adăugat pe serverul ${guild.name}`);
  store.get(guild.id);
  store.save(guild.id);
  await inregistreazaComenzi(guild).catch((e) => console.error(`[comenzi] ${guild.name}: ${e.message}`));
});

async function opreste(semnal) {
  console.log(`\n${semnal} primit, salvez datele...`);
  try {
    await store.flush();
    if (store.adapter.close) await store.adapter.close();
  } catch (e) {
    console.error('Eroare la salvarea finală:', e);
  }
  client.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => opreste('SIGTERM'));
process.on('SIGINT', () => opreste('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

(async () => {
  await store.init();
  console.log(`💾 Stocare: ${store.adapter.nume}`);
  await client.login(TOKEN);
})().catch((e) => {
  console.error('❌ Pornire eșuată:', e);
  process.exit(1);
});

