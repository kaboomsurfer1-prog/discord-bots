'use strict';

const {
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const f = require('../utils/format');
const d = require('../utils/discord');
const T = require('../services/taxe');
const UI = require('../services/ui');
const { OPTIUNI, MESAJE_INFO, DEFAULT_CONFIG, DEFAULT_MESAJE, PLACEHOLDERS } = require('../config/defaults');
const { normalizeaza, clone } = require('../storage');
const { comandaValida, NUME_REZERVATE } = require('./definitions');

const DA = ['da', 'true', 'on', '1', 'yes', 'y', 'activ', 'activat', 'pornit', 'porneste', 'enable', 'si'];
const NU = ['nu', 'false', 'off', '0', 'no', 'n', 'inactiv', 'dezactivat', 'oprit', 'opreste', 'disable'];

function formatOptiune(meta, v) {
  switch (meta.tip) {
    case 'bool':
      return v ? '✅ Da' : '❌ Nu';
    case 'durata':
      return v ? f.durata(v) : 'Oprit';
    case 'enum':
      return meta.index ? meta.valori[v] ?? String(v) : String(v);
    case 'int':
      return meta.camp === 'oraRaport' ? `${String(v).padStart(2, '0')}:00` : String(v);
    default:
      return String(v);
  }
}

function parseOptiune(meta, valoare) {
  const s = f.faraDiacritice(String(valoare).trim().toLowerCase());
  switch (meta.tip) {
    case 'bool':
      if (DA.includes(s)) return { v: true };
      if (NU.includes(s)) return { v: false };
      return { eroare: 'Scrie `da` sau `nu`.' };
    case 'durata': {
      const ms = f.parseDurata(s);
      return ms === null ? { eroare: 'Durată invalidă. Exemple: `30m`, `1h`, `12h`, `1z`, `0` (oprit).' } : { v: ms };
    }
    case 'int': {
      const n = parseInt(s.replace(/:00$/, ''), 10);
      if (!Number.isFinite(n) || n < meta.min || n > meta.max) return { eroare: `Scrie un număr între ${meta.min} și ${meta.max}.` };
      return { v: n };
    }
    case 'enum': {
      const idx = meta.valori.indexOf(s);
      if (idx === -1) return { eroare: `Valori posibile: ${meta.valori.map((x) => `\`${x}\``).join(', ')}.` };
      return { v: meta.index ? idx : meta.valori[idx] };
    }
    case 'tz': {
      const tz = String(valoare).trim();
      return f.fusValid(tz) ? { v: tz } : { eroare: 'Fus orar invalid. Exemple: `Europe/Bucharest`, `Europe/Rome`, `Europe/London`.' };
    }
    default:
      return { eroare: 'Tip necunoscut.' };
  }
}

async function logConfig(i, cfg, text) {
  const e = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setAuthor({ name: `${i.user.username} a modificat configurația`, iconURL: i.user.displayAvatarURL() })
    .setDescription(f.trunc(text, 4000))
    .setTimestamp();
  await d.log(i.guild, cfg, { embeds: [e] });
}

function embedTaxa(cfg, t, titlu) {
  return d
    .embedBaza(cfg, { culoare: t.culoare })
    .setTitle(f.trunc(`${titlu}: ${t.emoji} ${t.nume}`, 256))
    .addFields(
      UI.camp('💰 Preț', f.suma(t.suma, cfg)),
      UI.camp('⏳ Durată', f.durata(t.durata)),
      UI.camp('⚡ Comandă', t.comanda ? `/${t.comanda}` : '—'),
      UI.camp('🎭 Rol automat', t.rolId ? `<@&${t.rolId}>` : '—'),
      UI.camp('🧩 În panou', t.inPanou ? 'Da' : 'Nu'),
      UI.camp('✅ Activă', t.activa ? 'Da' : 'Nu'),
      UI.camp('🆔 ID', `\`${t.id}\``),
      UI.camp('📝 Descriere', t.descriere || '—', false)
    );
}

/** Aplică opțiunile din comandă pe o copie a taxei. Returnează { taxa } sau { eroare }. */
function aplicaOptiuniTaxa(i, cfg, original, editare) {
  const t = { ...original };
  const o = i.options;
  if (editare) {
    const nume = o.getString('nume');
    if (nume) t.nume = nume.trim();
    const sumaStr = o.getString('suma');
    if (sumaStr) {
      const s = f.parseSuma(sumaStr);
      if (s === null) return { eroare: `Suma „${sumaStr}” nu este validă.` };
      t.suma = s;
    }
  }
  const comanda = o.getString('comanda');
  if (comanda !== null) {
    if (['-', 'nu', 'none', 'off'].includes(comanda.trim().toLowerCase())) t.comanda = null;
    else {
      const c = f.slug(comanda.replace(/^\//, ''));
      if (!comandaValida(c)) {
        return {
          eroare: NUME_REZERVATE.has(c)
            ? `\`/${c}\` este deja o comandă a botului. Alege alt nume.`
            : 'Comanda poate conține doar litere mici, cifre, - și _ (max 32).',
        };
      }
      if (cfg.taxe.some((x) => x.id !== t.id && x.comanda === c)) return { eroare: `Comanda \`/${c}\` este folosită de altă taxă.` };
      t.comanda = c;
    }
  }
  const emoji = o.getString('emoji');
  if (emoji !== null) {
    if (!f.esteEmoji(emoji)) return { eroare: 'Emoji invalid. Folosește un emoji normal (🛃) sau unul de pe server (<:nume:id>).' };
    t.emoji = emoji.trim();
  }
  const durata = o.getString('durata');
  if (durata !== null) {
    const ms = f.parseDurata(durata);
    if (ms === null) return { eroare: 'Durată invalidă. Exemple: `24h`, `7z`, `1w`, `12h30m`, `0` (nu expiră).' };
    t.durata = ms;
  }
  const desc = o.getString('descriere');
  if (desc !== null) t.descriere = desc.trim() === '-' ? '' : desc.trim();
  const culoare = o.getString('culoare');
  if (culoare !== null) {
    const c = f.parseCuloare(culoare);
    if (!c) return { eroare: `Culoare invalidă. Folosește #RRGGBB sau: ${Object.keys(f.CULORI_NUME).join(', ')}.` };
    t.culoare = c;
  }
  const rol = o.getRole('rol');
  if (rol) {
    if (rol.id === i.guildId) return { eroare: 'Nu poți folosi @everyone ca rol automat.' };
    if (rol.managed) return { eroare: 'Rolul este gestionat de o integrare și nu poate fi dat de bot.' };
    t.rolId = rol.id;
  }
  if (editare && o.getBoolean('scoate_rol')) t.rolId = null;
  const inPanou = o.getBoolean('in_panou');
  if (inPanou !== null) t.inPanou = inPanou;
  if (editare) {
    const activa = o.getBoolean('activa');
    if (activa !== null) t.activa = activa;
  }
  return { taxa: t };
}

function avertismentRol(i, rolId) {
  if (!rolId) return null;
  const me = i.guild.members.me;
  const rol = i.guild.roles.cache.get(rolId);
  if (!me || !rol) return null;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return '⚠️ Botul nu are permisiunea **Manage Roles** — nu va putea da rolul.';
  if (rol.position >= me.roles.highest.position) return '⚠️ Rolul botului trebuie să fie **deasupra** rolului ales (Setări server → Roluri).';
  return null;
}

async function dupaModificareTaxe(i, ctx) {
  ctx.store.save(i.guildId);
  await ctx.inregistreazaComenzi(i.guild).catch((e) => console.error('[comenzi]', e.message));
  await UI.actualizeazaPanouri(ctx.client, ctx.store, i.guildId);
}

/* ------------------------------------------------------------------ */

async function taxaAdauga(i, ctx, cfg) {
  if (cfg.taxe.length >= 25) return d.eroare(i, 'Poți avea maxim 25 de taxe.');
  const nume = i.options.getString('nume', true).trim();
  const suma = f.parseSuma(i.options.getString('suma', true));
  if (suma === null) return d.eroare(i, 'Suma nu este validă. Exemple: `30000`, `30.000`, `30k`.');
  let id = f.slug(nume, 24) || 'taxa';
  const baza = id;
  for (let k = 2; cfg.taxe.some((t) => t.id === id); k++) id = `${baza}-${k}`;
  const sablon = {
    id,
    nume,
    comanda: null,
    emoji: '💰',
    suma,
    durata: 0,
    descriere: '',
    culoare: cfg.aspect.culoare,
    rolId: null,
    activa: true,
    inPanou: true,
  };
  const r = aplicaOptiuniTaxa(i, cfg, sablon, false);
  if (r.eroare) return d.eroare(i, r.eroare);
  const t = r.taxa;
  if (i.options.getString('comanda') === null) {
    const auto = f.slug(nume);
    if (comandaValida(auto) && !cfg.taxe.some((x) => x.comanda === auto)) t.comanda = auto;
  }
  cfg.taxe.push(t);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, cfg, `➕ Taxă nouă: ${t.emoji} **${t.nume}** — ${f.suma(t.suma, cfg)}`);
  const av = avertismentRol(i, t.rolId);
  await i.editReply({ content: av || undefined, embeds: [embedTaxa(cfg, t, '➕ Taxă adăugată')] });
}

async function taxaEditeaza(i, ctx, cfg) {
  const t = T.gasesteTaxa(cfg, i.options.getString('taxa', true));
  if (!t) return d.eroare(i, 'Taxa nu există.');
  const r = aplicaOptiuniTaxa(i, cfg, t, true);
  if (r.eroare) return d.eroare(i, r.eroare);
  const schimbari = Object.keys(r.taxa).filter((k) => JSON.stringify(r.taxa[k]) !== JSON.stringify(t[k]));
  if (!schimbari.length) return d.eroare(i, 'Nu ai modificat nimic. Alege cel puțin o opțiune (nume, suma, durata...).');
  Object.assign(t, r.taxa);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, cfg, `✏️ Taxă modificată: ${t.emoji} **${t.nume}** (${schimbari.join(', ')})`);
  const av = avertismentRol(i, t.rolId);
  await i.editReply({ content: av || undefined, embeds: [embedTaxa(cfg, t, '✏️ Taxă modificată')] });
}

async function taxaSterge(i, ctx, cfg) {
  const t = T.gasesteTaxa(cfg, i.options.getString('taxa', true));
  if (!t) return d.eroare(i, 'Taxa nu există.');
  if (!i.options.getBoolean('confirmare', true)) return d.eroare(i, 'Ștergerea a fost anulată (confirmare: False).');
  cfg.taxe = cfg.taxe.filter((x) => x.id !== t.id);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, cfg, `🗑️ Taxă ștearsă: ${t.emoji} **${t.nume}**`);
  await d.succes(i, `Taxa ${t.emoji} **${t.nume}** a fost ștearsă. Plățile vechi rămân în istoric.`);
}

async function vezi(i, ctx, cfg) {
  const culoare = f.culoareInt(cfg.aspect.culoare);
  const linieTaxa = (t) =>
    `${t.emoji} **${t.nume}** \`${t.id}\` — ${f.suma(t.suma, cfg)} • ${f.durata(t.durata)} • ${t.comanda ? `/${t.comanda}` : 'fără comandă'}` +
    `${t.rolId ? ` • <@&${t.rolId}>` : ''}${t.activa ? '' : ' • ⛔ dezactivată'}${t.inPanou ? '' : ' • ascunsă din panou'}`;
  const e1 = new EmbedBuilder()
    .setColor(culoare)
    .setTitle('⚙️ Configurație — Taxe')
    .setDescription(f.trunc(cfg.taxe.map(linieTaxa).join('\n') || '_Nicio taxă._', 1800));

  const c = cfg.canale;
  const canal = (id) => (id ? `<#${id}>` : '—');
  const roluri = (arr) => (arr.length ? arr.map((r) => `<@&${r}>`).join(' ') : '—');
  const e2 = new EmbedBuilder()
    .setColor(culoare)
    .setTitle('📌 Canale, roluri, reduceri')
    .addFields(
      UI.camp('Comenzi (încasări)', canal(c.comenzi)),
      UI.camp('Log', canal(c.log)),
      UI.camp('Cereri', canal(c.cereri)),
      UI.camp('Raport', canal(c.raport)),
      UI.camp('Notificări', canal(c.notificari)),
      UI.camp('Admin', f.trunc(roluri(cfg.roluri.admin), 300)),
      UI.camp('Staff', f.trunc(roluri(cfg.roluri.staff), 300)),
      UI.camp('Reduceri', f.trunc(cfg.reduceri.map((r) => `<@&${r.rolId}> −${r.procent}%`).join('\n') || '—', 300), false)
    );

  const e3 = new EmbedBuilder()
    .setColor(culoare)
    .setTitle('🔧 Opțiuni (`/config optiune`)')
    .setDescription(
      f.trunc(
        Object.entries(OPTIUNI)
          .map(([k, m]) => `\`${k}\` — ${m.eticheta}: **${formatOptiune(m, cfg.optiuni[m.camp])}**`)
          .join('\n'),
        1700
      )
    );

  const a = cfg.aspect;
  const personalizate = Object.keys(MESAJE_INFO).filter((k) => cfg.mesaje[k] !== DEFAULT_MESAJE[k]);
  const e4 = new EmbedBuilder()
    .setColor(culoare)
    .setTitle('🎨 Monedă, aspect, mesaje')
    .addFields(
      UI.camp('Monedă', `Exemplu: **${f.suma(30000, cfg)}**`),
      UI.camp('Culoare', a.culoare),
      UI.camp('Titlu', f.trunc(a.titlu || '—', 200)),
      UI.camp('Footer', f.trunc(a.footer || '—', 200)),
      UI.camp('Thumbnail', a.thumbnail ? f.trunc(a.thumbnail, 150) : '—'),
      UI.camp('Imagine', a.imagine ? f.trunc(a.imagine, 150) : '—'),
      UI.camp('Mesaje personalizate', personalizate.length ? personalizate.map((k) => `\`${k}\``).join(' ') : 'niciunul (toate implicite)', false),
      UI.camp('Panouri active', String(cfg.panouri.length)),
      UI.camp('Stocare', ctx.store.adapter.nume || '—')
    );
  await i.reply({ embeds: [e1, e2, e3, e4], flags: MessageFlags.Ephemeral, allowedMentions: d.FARA_PING });
}

async function canal(i, ctx, cfg) {
  const tip = i.options.getString('tip', true);
  const ales = i.options.getChannel('canal');
  const ch = ales ? i.guild.channels.cache.get(ales.id) || ales : null;
  cfg.canale[tip] = ch ? ch.id : null;
  ctx.store.save(i.guildId);
  let av = '';
  if (ch && i.guild.members.me && typeof ch.permissionsFor === 'function') {
    const perm = ch.permissionsFor(i.guild.members.me);
    const lipsa = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'].filter((p) => !perm || !perm.has(PermissionFlagsBits[p]));
    if (lipsa.length) av = `\n⚠️ În acel canal botului îi lipsesc permisiunile: ${lipsa.map((p) => `**${p}**`).join(', ')}`;
  }
  await logConfig(i, cfg, `📌 Canal **${tip}**: ${ch ? `<#${ch.id}>` : 'scos'}`);
  await d.succes(i, `Canalul **${tip}** ${ch ? `este acum <#${ch.id}>` : 'a fost scos'}.${av}`);
}

async function rol(i, ctx, cfg) {
  const tip = i.options.getString('tip', true);
  const actiune = i.options.getString('actiune', true);
  const r = i.options.getRole('rol', true);
  const lista = cfg.roluri[tip];
  if (actiune === 'adauga') {
    if (lista.includes(r.id)) return d.eroare(i, `<@&${r.id}> este deja rol **${tip}**.`);
    lista.push(r.id);
  } else {
    if (!lista.includes(r.id)) return d.eroare(i, `<@&${r.id}> nu este rol **${tip}**.`);
    cfg.roluri[tip] = lista.filter((x) => x !== r.id);
  }
  ctx.store.save(i.guildId);
  await logConfig(i, cfg, `🎭 Rol **${tip}** ${actiune === 'adauga' ? 'adăugat' : 'scos'}: <@&${r.id}>`);
  await d.succes(i, `<@&${r.id}> ${actiune === 'adauga' ? 'a fost adăugat ca' : 'nu mai este'} rol **${tip}**.`);
}

async function reducere(i, ctx, cfg) {
  const r = i.options.getRole('rol', true);
  const procent = i.options.getInteger('procent', true);
  cfg.reduceri = cfg.reduceri.filter((x) => x.rolId !== r.id);
  if (procent > 0) cfg.reduceri.push({ rolId: r.id, procent });
  ctx.store.save(i.guildId);
  await logConfig(i, cfg, `🏷️ Reducere <@&${r.id}>: ${procent ? `${procent}%` : 'scoasă'}`);
  await d.succes(i, procent ? `Membrii cu <@&${r.id}> au acum **${procent}%** reducere la toate taxele.` : `Reducerea pentru <@&${r.id}> a fost scoasă.`);
}

async function moneda(i, ctx, cfg) {
  const simbol = i.options.getString('simbol');
  const pozitie = i.options.getString('pozitie');
  const sep = i.options.getString('separator');
  if (simbol !== null) cfg.moneda.simbol = simbol.trim() === '-' ? '' : simbol.trim();
  if (pozitie) cfg.moneda.pozitie = pozitie;
  if (sep) cfg.moneda.separator = sep === 'none' ? '' : sep === 'spatiu' ? ' ' : sep;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, cfg, `💵 Monedă: exemplu ${f.suma(30000, cfg)}`);
  await d.succes(i, `Formatul banilor: **${f.suma(30000, cfg)}**`);
}

async function aspect(i, ctx, cfg) {
  const o = i.options;
  const a = cfg.aspect;
  const sterge = (v) => v.trim() === '-';
  const culoare = o.getString('culoare');
  if (culoare !== null) {
    if (sterge(culoare)) a.culoare = DEFAULT_CONFIG.aspect.culoare;
    else {
      const c = f.parseCuloare(culoare);
      if (!c) return d.eroare(i, `Culoare invalidă. Folosește #RRGGBB sau: ${Object.keys(f.CULORI_NUME).join(', ')}.`);
      a.culoare = c;
    }
  }
  const titlu = o.getString('titlu');
  if (titlu !== null) a.titlu = sterge(titlu) ? '' : titlu.trim();
  const footer = o.getString('footer');
  if (footer !== null) a.footer = sterge(footer) ? '' : footer.trim();
  for (const k of ['thumbnail', 'imagine']) {
    const v = o.getString(k);
    if (v === null) continue;
    if (sterge(v)) a[k] = null;
    else if (!f.esteUrl(v)) return d.eroare(i, `Link invalid pentru **${k}** (trebuie să înceapă cu https://).`);
    else a[k] = v.trim();
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, cfg, '🎨 Aspect modificat');
  const e = d
    .embedBaza(cfg)
    .setTitle(f.trunc(a.titlu || 'Previzualizare', 256))
    .setDescription('Așa vor arăta mesajele botului.');
  if (a.thumbnail) e.setThumbnail(a.thumbnail);
  if (a.imagine) e.setImage(a.imagine);
  await i.editReply({ content: '✅ Aspect salvat.', embeds: [e] });
}

async function optiune(i, ctx, cfg) {
  const cheie = i.options.getString('setare', true);
  const meta = OPTIUNI[cheie];
  if (!meta) return d.eroare(i, 'Opțiune necunoscută.');
  const r = parseOptiune(meta, i.options.getString('valoare', true));
  if (r.eroare) return d.eroare(i, `**${meta.eticheta}**: ${r.eroare}`);
  cfg.optiuni[meta.camp] = r.v;
  if (meta.camp === 'raportAutomat' || meta.camp === 'oraRaport' || meta.camp === 'ziRaport') cfg.stare.ultimRaport = null;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  ctx.store.save(i.guildId);
  if (meta.camp === 'cereriJucatori') await UI.actualizeazaPanouri(ctx.client, ctx.store, i.guildId);
  let extra = '';
  if (meta.camp === 'raportAutomat' && r.v !== 'off' && !cfg.canale.raport && !cfg.canale.log) {
    extra = '\nℹ️ Setează și un canal: `/config canal tip:Raport`.';
  }
  if (meta.camp === 'cereriJucatori' && r.v && !cfg.canale.cereri && !cfg.canale.log) {
    extra = '\nℹ️ Setează și canalul unde ajung cererile: `/config canal tip:Cereri`.';
  }
  await logConfig(i, cfg, `🔧 ${meta.eticheta}: **${formatOptiune(meta, r.v)}**`);
  await d.succes(i, `**${meta.eticheta}**: ${formatOptiune(meta, r.v)}${extra}`);
}

async function mesaj(i, ctx, cfg) {
  const cheie = i.options.getString('cheie', true);
  if (!MESAJE_INFO[cheie]) return d.eroare(i, 'Mesaj necunoscut.');
  const max = cheie === 'panou_titlu' ? 256 : 4000;
  const input = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('Text (lasă gol = revii la cel implicit)')
    .setStyle(cheie === 'panou_titlu' ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(max)
    .setPlaceholder(f.trunc('Variabile: {platitor} {taxa} {total} {colector} {expira} ...', 100));
  const curent = cfg.mesaje[cheie] || '';
  if (curent) input.setValue(f.trunc(curent, max));
  const modal = new ModalBuilder()
    .setCustomId(`cayo:mmesaj:${cheie}`)
    .setTitle(f.trunc(`Mesaj: ${cheie}`, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
  await i.showModal(modal);
}

/** Salvarea din editorul de mesaje (modal). */
async function salveazaMesaj(i, ctx, cheie) {
  const cfg = ctx.store.config(i.guildId);
  if (!d.esteAdmin(i, cfg)) return d.eroare(i, 'Doar adminii pot modifica mesajele.');
  if (!MESAJE_INFO[cheie]) return d.eroare(i, 'Mesaj necunoscut.');
  const text = i.fields.getTextInputValue('text').trim();
  cfg.mesaje[cheie] = text || DEFAULT_MESAJE[cheie];
  ctx.store.save(i.guildId);
  if (cheie.startsWith('panou_')) await UI.actualizeazaPanouri(ctx.client, ctx.store, i.guildId);
  await logConfig(i, cfg, `💬 Mesaj **${cheie}** ${text ? 'personalizat' : 'resetat la implicit'}`);
  const exemplu = f.render(cfg.mesaje[cheie], {
    platitor: `<@${i.user.id}>`,
    membru: `<@${i.user.id}>`,
    nume: 'Ion Popescu',
    id_joc: '123',
    taxa: cfg.taxe[0] ? cfg.taxe[0].nume : 'Taxă Vamă',
    emoji: cfg.taxe[0] ? cfg.taxe[0].emoji : '🛃',
    suma: f.suma(30000, cfg),
    cantitate: 1,
    total: f.suma(30000, cfg),
    colector: `<@${i.user.id}>`,
    id: 1,
    id_cerere: 1,
    expira: f.ts(Date.now() + 86400000, 'f'),
    expira_relativ: f.ts(Date.now() + 86400000, 'R'),
    expira_text: `⏳ Valabilă până la ${f.ts(Date.now() + 86400000, 'f')}.`,
    motiv: 'Exemplu de motiv',
    server: i.guild.name,
    lista_taxe: UI.listaTaxe(cfg, true),
  });
  const e = d
    .embedBaza(cfg)
    .setTitle(f.trunc(`💬 ${cheie} — ${text ? 'salvat' : 'resetat'}`, 256))
    .setDescription(f.trunc(exemplu, 4000) || '​')
    .addFields({ name: 'Variabile disponibile', value: f.trunc(PLACEHOLDERS, 1024) });
  await i.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: d.FARA_PING });
}

async function exportConfig(i, ctx, cfg) {
  const copie = clone(cfg);
  delete copie.panouri;
  delete copie.stare;
  const fisier = new AttachmentBuilder(Buffer.from(JSON.stringify({ versiune: 1, config: copie }, null, 2), 'utf8'), {
    name: `cayo-config-${i.guildId}.json`,
  });
  await i.reply({
    content: '📦 Configurația ta. O poți edita și încărca înapoi cu `/config import` (sau pe alt server).',
    files: [fisier],
    flags: MessageFlags.Ephemeral,
  });
}

function curataTaxe(taxe, implicitCuloare) {
  const ids = new Set();
  const comenzi = new Set();
  const out = [];
  for (const raw of taxe.slice(0, 25)) {
    if (!raw || typeof raw !== 'object') continue;
    const nume = String(raw.nume || '').trim().slice(0, 50);
    if (!nume) continue;
    let id = f.slug(raw.id || nume, 24) || 'taxa';
    const b = id;
    for (let k = 2; ids.has(id); k++) id = `${b}-${k}`;
    ids.add(id);
    let comanda = raw.comanda ? f.slug(String(raw.comanda)) : null;
    if (comanda && (!comandaValida(comanda) || comenzi.has(comanda))) comanda = null;
    if (comanda) comenzi.add(comanda);
    const suma = f.parseSuma(raw.suma);
    out.push({
      id,
      nume,
      comanda,
      emoji: f.esteEmoji(raw.emoji) ? String(raw.emoji).trim() : '💰',
      suma: suma === null ? 0 : suma,
      durata: Number(raw.durata) > 0 ? Math.round(Number(raw.durata)) : 0,
      descriere: String(raw.descriere || '').slice(0, 200),
      culoare: f.parseCuloare(raw.culoare) || implicitCuloare,
      rolId: raw.rolId && /^\d{15,25}$/.test(String(raw.rolId)) ? String(raw.rolId) : null,
      activa: raw.activa !== false,
      inPanou: raw.inPanou !== false,
    });
  }
  return out;
}

async function importConfig(i, ctx, cfg) {
  const fisier = i.options.getAttachment('fisier', true);
  if (fisier.size > 512 * 1024) return d.eroare(i, 'Fișierul este prea mare (max 512 KB).');
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let obj;
  try {
    const res = await fetch(fisier.url);
    obj = JSON.parse(await res.text());
  } catch {
    return d.eroare(i, 'Nu am putut citi fișierul. Trebuie să fie un JSON valid (din `/config export`).');
  }
  const brut = obj && obj.config ? obj.config : obj;
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return d.eroare(i, 'Fișierul nu conține o configurație validă.');
  const nou = normalizeaza({ config: { ...brut, panouri: cfg.panouri, stare: { ultimRaport: null } } }).config;
  nou.taxe = curataTaxe(Array.isArray(brut.taxe) ? brut.taxe : cfg.taxe, nou.aspect.culoare);
  if (!f.fusValid(nou.optiuni.fusOrar)) nou.optiuni.fusOrar = DEFAULT_CONFIG.optiuni.fusOrar;
  if (!f.parseCuloare(nou.aspect.culoare)) nou.aspect.culoare = DEFAULT_CONFIG.aspect.culoare;
  for (const k of ['thumbnail', 'imagine']) if (nou.aspect[k] && !f.esteUrl(nou.aspect[k])) nou.aspect[k] = null;
  for (const [k, m] of Object.entries(OPTIUNI)) {
    const v = nou.optiuni[m.camp];
    const ok =
      (m.tip === 'bool' && typeof v === 'boolean') ||
      (m.tip === 'durata' && Number.isFinite(v) && v >= 0) ||
      (m.tip === 'int' && Number.isInteger(v) && v >= m.min && v <= m.max) ||
      (m.tip === 'enum' && (m.index ? Number.isInteger(v) && v >= 0 && v < m.valori.length : m.valori.includes(v))) ||
      (m.tip === 'tz' && f.fusValid(v));
    if (!ok) nou.optiuni[m.camp] = DEFAULT_CONFIG.optiuni[m.camp];
    void k;
  }
  for (const k of Object.keys(DEFAULT_MESAJE)) if (typeof nou.mesaje[k] !== 'string' || !nou.mesaje[k]) nou.mesaje[k] = DEFAULT_MESAJE[k];
  ctx.store.get(i.guildId).config = nou;
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, nou, '📥 Configurație importată din fișier');
  await d.succes(i, `Configurația a fost importată: **${nou.taxe.length}** taxe. Verifică cu \`/config vezi\`.`);
}

async function reset(i, ctx, cfg) {
  if (!i.options.getBoolean('confirmare', true)) return d.eroare(i, 'Resetarea a fost anulată (confirmare: False).');
  const nou = normalizeaza({}).config;
  nou.panouri = cfg.panouri;
  ctx.store.get(i.guildId).config = nou;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await dupaModificareTaxe(i, ctx);
  await logConfig(i, nou, '♻️ Configurația a fost resetată la valorile implicite');
  await d.succes(i, 'Configurația a fost resetată. Plățile au rămas neatinse. (Canalele și rolurile trebuie setate din nou.)');
}

async function config(i, ctx) {
  const cfg = ctx.store.config(i.guildId);
  if (!d.esteAdmin(i, cfg)) {
    return d.eroare(i, 'Doar adminii (permisiunea **Manage Server** sau un rol admin setat) pot configura botul.');
  }
  const grup = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand();
  if (grup === 'taxa') {
    if (sub === 'adauga') return taxaAdauga(i, ctx, cfg);
    if (sub === 'editeaza') return taxaEditeaza(i, ctx, cfg);
    if (sub === 'sterge') return taxaSterge(i, ctx, cfg);
  }
  const h = { vezi, canal, rol, reducere, moneda, aspect, optiune, mesaj, export: exportConfig, import: importConfig, reset }[sub];
  if (!h) return d.eroare(i, 'Subcomandă necunoscută.');
  return h(i, ctx, cfg);
}

module.exports = { config, salveazaMesaj, formatOptiune, parseOptiune, curataTaxe };
