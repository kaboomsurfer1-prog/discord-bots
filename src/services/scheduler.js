'use strict';

const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('./taxe');
const UI = require('./ui');

/**
 * Rulează la fiecare minut:
 *  - reminder înainte de expirare (DM)
 *  - expirare: scoate rolul automat, DM, anunț în canalul de notificări
 *  - rapoarte automate (zilnic / săptămânal / lunar)
 */
async function tick(client, store) {
  const acum = Date.now();
  for (const [gid, data] of store.guilds) {
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    try {
      await verificaExpirari(client, store, guild, data, acum);
      await verificaRaport(store, guild, data, acum);
    } catch (e) {
      console.error(`[scheduler] Eroare pe serverul ${gid}:`, e);
    }
  }
}

async function verificaExpirari(client, store, guild, data, acum) {
  const cfg = data.config;
  const reminder = cfg.optiuni.reminderInainte || 0;
  let modificat = false;

  for (const p of data.plati) {
    if (p.status !== 'activ' || !p.expira) continue;
    if (p.reminderTrimis && p.expirareProcesata) continue;
    const ultima = T.ultimaExpirare(data, p.taxaId, p, acum);
    const areMaiNoua = ultima > p.expira; // a plătit din nou -> nu anunțăm nimic pentru plata veche

    if (!p.reminderTrimis && reminder > 0 && acum >= p.expira - reminder && acum < p.expira) {
      p.reminderTrimis = true;
      modificat = true;
      if (!areMaiNoua && p.membruId && cfg.optiuni.dmNotificari) {
        const text = f.render(cfg.mesaje.dm_reminder, UI.varsPlata(cfg, p, guild));
        const e = d.embedBaza(cfg, { culoare: '#E67E22' }).setTitle(f.trunc(cfg.aspect.titlu || guild.name, 256)).setDescription(f.trunc(text, 4000) || '​');
        await d.dm(client, p.membruId, { embeds: [e] });
      }
    }

    if (!p.expirareProcesata && acum >= p.expira) {
      p.expirareProcesata = true;
      p.reminderTrimis = true;
      modificat = true;
      if (areMaiNoua || T.areActiva(data, p.taxaId, p, acum, p.id)) continue;
      const taxa = cfg.taxe.find((t) => t.id === p.taxaId);
      if (taxa && taxa.rolId && p.membruId) await d.modificaRol(guild, p.membruId, taxa.rolId, false);
      const vars = UI.varsPlata(cfg, p, guild);
      if (p.membruId && cfg.optiuni.dmNotificari) {
        const e = d
          .embedBaza(cfg, { culoare: '#95A5A6' })
          .setTitle(f.trunc(cfg.aspect.titlu || guild.name, 256))
          .setDescription(f.trunc(f.render(cfg.mesaje.dm_expirat, vars), 4000) || '​');
        await d.dm(client, p.membruId, { embeds: [e] });
      }
      const canalId = cfg.canale.notificari;
      if (canalId) {
        const e = d.embedBaza(cfg, { culoare: '#95A5A6' }).setDescription(f.trunc(f.render(cfg.mesaje.anunt_expirare, vars), 4000) || '​');
        await d.trimiteInCanal(guild, canalId, { embeds: [e] });
      }
    }
  }
  if (modificat) store.save(guild.id);
}

async function verificaRaport(store, guild, data, acum) {
  const cfg = data.config;
  const o = cfg.optiuni;
  if (!o.raportAutomat || o.raportAutomat === 'off') return;
  const canalId = cfg.canale.raport || cfg.canale.log;
  if (!canalId) return;
  const p = f.partiTz(acum, o.fusOrar);
  if (p.ora !== o.oraRaport) return;
  const z = (n) => String(n).padStart(2, '0');
  let cheie = null;
  let perioada = null;
  if (o.raportAutomat === 'zilnic') {
    cheie = `z-${p.an}-${z(p.luna)}-${z(p.zi)}`;
    perioada = 'azi';
  } else if (o.raportAutomat === 'saptamanal' && p.ziSapt === o.ziRaport) {
    cheie = `s-${p.an}-${z(p.luna)}-${z(p.zi)}`;
    perioada = '7z';
  } else if (o.raportAutomat === 'lunar' && p.zi === 1) {
    cheie = `l-${p.an}-${z(p.luna)}`;
    perioada = 'luna_trecuta';
  }
  if (!cheie || cfg.stare.ultimRaport === cheie) return;
  cfg.stare.ultimRaport = cheie;
  store.save(guild.id);
  const per = f.perioada(perioada, o.fusOrar, acum);
  const e = UI.embedRaport(cfg, data, per);
  e.setTitle(f.trunc(`📊 Raport automat — ${per.eticheta}`, 256));
  await d.trimiteInCanal(guild, canalId, { embeds: [e] });
}

function pornesteScheduler(client, store) {
  const run = () => tick(client, store).catch((e) => console.error('[scheduler]', e));
  setTimeout(run, 10 * 1000);
  return setInterval(run, 60 * 1000);
}

module.exports = { pornesteScheduler, tick, verificaExpirari, verificaRaport };
