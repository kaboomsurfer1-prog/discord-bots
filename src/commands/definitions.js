'use strict';

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { OPTIUNI, MESAJE_INFO } = require('../config/defaults');
const f = require('../utils/format');

const PERIOADA_CHOICES = Object.entries(f.PERIOADE).map(([value, name]) => ({ name, value }));
const CANALE_TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function optiuniPlata(b, cuTip) {
  if (cuTip) {
    b.addStringOption((o) => o.setName('tip').setDescription('Taxa încasată').setRequired(true).setAutocomplete(true));
  }
  return b
    .addUserOption((o) => o.setName('membru').setDescription('Membrul Discord care plătește'))
    .addStringOption((o) => o.setName('nume').setDescription('Numele IC al jucătorului (dacă nu e pe Discord)').setMaxLength(64))
    .addStringOption((o) => o.setName('id_joc').setDescription('ID-ul jucătorului în joc').setMaxLength(32))
    .addIntegerOption((o) =>
      o.setName('cantitate').setDescription('De câte ori plătește taxa (implicit 1)').setMinValue(1).setMaxValue(1000)
    )
    .addStringOption((o) =>
      o.setName('suma').setDescription('Suma totală încasată, dacă e alta decât prețul (ex: 25000, 25k)').setMaxLength(20)
    )
    .addAttachmentOption((o) => o.setName('dovada').setDescription('Screenshot cu dovada plății'))
    .addStringOption((o) => o.setName('nota').setDescription('Notă / observații').setMaxLength(300));
}

function optiuniTaxa(s, editare) {
  if (editare) {
    s.addStringOption((o) => o.setName('taxa').setDescription('Taxa de modificat').setRequired(true).setAutocomplete(true));
  } else {
    s.addStringOption((o) => o.setName('nume').setDescription('Numele taxei (ex: Taxă Arme)').setRequired(true).setMaxLength(50));
    s.addStringOption((o) => o.setName('suma').setDescription('Prețul (ex: 30000, 30.000, 30k)').setRequired(true).setMaxLength(20));
  }
  if (editare) {
    s.addStringOption((o) => o.setName('nume').setDescription('Nume nou').setMaxLength(50));
    s.addStringOption((o) => o.setName('suma').setDescription('Preț nou (ex: 30000, 30k)').setMaxLength(20));
  }
  s.addStringOption((o) =>
    o.setName('comanda').setDescription('Comanda rapidă, ex: vama => /vama (scrie - ca s-o scoți)').setMaxLength(32)
  )
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji-ul taxei (ex: 🛃)').setMaxLength(64))
    .addStringOption((o) =>
      o.setName('durata').setDescription('Cât e valabilă: 24h, 7z, 1w, 30m sau 0 = nu expiră').setMaxLength(30)
    )
    .addStringOption((o) => o.setName('descriere').setDescription('Descriere (apare în panou) — scrie - ca s-o ștergi').setMaxLength(200))
    .addStringOption((o) => o.setName('culoare').setDescription('Culoare embed: #3498DB sau rosu/verde/albastru...').setMaxLength(20))
    .addRoleOption((o) => o.setName('rol').setDescription('Rol dat automat la plată (scos la expirare)'));
  if (editare) {
    s.addBooleanOption((o) => o.setName('scoate_rol').setDescription('Scoate rolul automat al taxei'));
  }
  s.addBooleanOption((o) => o.setName('in_panou').setDescription('Apare în panoul cu butoane?'));
  if (editare) s.addBooleanOption((o) => o.setName('activa').setDescription('Taxa este activă?'));
  return s;
}

function comenziDeBaza() {
  const plata = optiuniPlata(
    new SlashCommandBuilder().setName('plata').setDescription('💰 Înregistrează plata unei taxe Cayo Perico'),
    true
  );

  const verifica = new SlashCommandBuilder()
    .setName('verifica')
    .setDescription('📋 Verifică taxele unui jucător (sau ale tale)')
    .addUserOption((o) => o.setName('membru').setDescription('Membrul Discord'))
    .addStringOption((o) => o.setName('nume').setDescription('Numele IC').setMaxLength(64));

  const istoric = new SlashCommandBuilder()
    .setName('istoric')
    .setDescription('🕘 Istoricul plăților (cu filtre)')
    .addUserOption((o) => o.setName('membru').setDescription('Doar plățile acestui membru'))
    .addStringOption((o) => o.setName('nume').setDescription('Doar plățile acestui nume IC').setMaxLength(64))
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true))
    .addUserOption((o) => o.setName('colector').setDescription('Doar plățile încasate de acest staff'))
    .addStringOption((o) => o.setName('perioada').setDescription('Perioada').addChoices(...PERIOADA_CHOICES))
    .addBooleanOption((o) => o.setName('anulate').setDescription('Include și plățile anulate'));

  const lista = new SlashCommandBuilder()
    .setName('lista')
    .setDescription('📜 Lista completă a plăților: data/ora, cine a încasat, cine a plătit, sumă, dovadă')
    .addIntegerOption((o) => o.setName('id').setDescription('Vezi toate detaliile unei singure plăți (ex: 12)').setMinValue(1))
    .addUserOption((o) => o.setName('membru').setDescription('Doar plățile acestui membru'))
    .addStringOption((o) => o.setName('nume').setDescription('Doar plățile acestui nume IC').setMaxLength(64))
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true))
    .addUserOption((o) => o.setName('colector').setDescription('Doar plățile încasate de acest staff'))
    .addStringOption((o) => o.setName('perioada').setDescription('Perioada (implicit: tot timpul)').addChoices(...PERIOADA_CHOICES))
    .addStringOption((o) =>
      o
        .setName('status')
        .setDescription('Ce plăți să arate (implicit: toate)')
        .addChoices(
          { name: 'Toate (inclusiv anulate)', value: 'toate' },
          { name: 'Doar cele neanulate', value: 'active' },
          { name: 'Încă valabile (neexpirate)', value: 'valabile' },
          { name: 'Expirate', value: 'expirate' },
          { name: 'Anulate', value: 'anulate' }
        )
    )
    .addStringOption((o) =>
      o
        .setName('ordine')
        .setDescription('Ordinea (implicit: cele mai noi)')
        .addChoices(
          { name: 'Cele mai noi primele', value: 'noi' },
          { name: 'Cele mai vechi primele', value: 'vechi' },
          { name: 'Suma cea mai mare', value: 'suma' }
        )
    );

  const anuleaza = new SlashCommandBuilder()
    .setName('anuleaza')
    .setDescription('🚫 Anulează o plată (după ID)')
    .addIntegerOption((o) => o.setName('id').setDescription('ID-ul plății (ex: 12)').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('motiv').setDescription('Motivul anulării').setMaxLength(300));

  const raport = new SlashCommandBuilder()
    .setName('raport')
    .setDescription('📊 Raport cu banii încasați')
    .addStringOption((o) => o.setName('perioada').setDescription('Perioada (implicit: azi)').addChoices(...PERIOADA_CHOICES))
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true))
    .addBooleanOption((o) => o.setName('public').setDescription('Afișează raportul tuturor din canal'));

  const top = new SlashCommandBuilder()
    .setName('top')
    .setDescription('🏆 Clasament plătitori sau colectori')
    .addStringOption((o) =>
      o
        .setName('categorie')
        .setDescription('Ce clasament')
        .addChoices({ name: 'Plătitori', value: 'platitori' }, { name: 'Colectori (staff)', value: 'colectori' })
    )
    .addStringOption((o) => o.setName('perioada').setDescription('Perioada (implicit: tot timpul)').addChoices(...PERIOADA_CHOICES))
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true))
    .addIntegerOption((o) => o.setName('limita').setDescription('Câte locuri (3-25)').setMinValue(3).setMaxValue(25));

  const activi = new SlashCommandBuilder()
    .setName('activi')
    .setDescription('⏳ Cine are taxe active acum (taxe cu durată)')
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true));

  const taxe = new SlashCommandBuilder().setName('taxe').setDescription('🏝️ Lista taxelor și prețurile');

  const panou = new SlashCommandBuilder()
    .setName('panou')
    .setDescription('🧩 Trimite panoul cu butoane pentru taxe')
    .addChannelOption((o) => o.setName('canal').setDescription('Canalul (implicit: cel curent)').addChannelTypes(...CANALE_TEXT));

  const exp = new SlashCommandBuilder()
    .setName('export')
    .setDescription('📤 Exportă plățile în CSV (Excel / Google Sheets)')
    .addStringOption((o) => o.setName('perioada').setDescription('Perioada (implicit: tot timpul)').addChoices(...PERIOADA_CHOICES))
    .addStringOption((o) => o.setName('tip').setDescription('Doar o anumită taxă').setAutocomplete(true));

  const ajutor = new SlashCommandBuilder().setName('ajutor').setDescription('❓ Toate comenzile botului');

  const optiuneChoices = Object.entries(OPTIUNI).map(([value, o]) => ({ name: f.trunc(o.eticheta, 100), value }));
  const mesajChoices = Object.entries(MESAJE_INFO).map(([value, txt]) => ({ name: f.trunc(`${value} — ${txt}`, 100), value }));

  const config = new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Configurează botul (admin)')
    .addSubcommand((s) => s.setName('vezi').setDescription('Vezi toată configurația'))
    .addSubcommandGroup((g) =>
      g
        .setName('taxa')
        .setDescription('Adaugă / modifică / șterge taxe')
        .addSubcommand((s) => optiuniTaxa(s.setName('adauga').setDescription('Adaugă o taxă nouă'), false))
        .addSubcommand((s) => optiuniTaxa(s.setName('editeaza').setDescription('Modifică o taxă (preț, nume, durată...)'), true))
        .addSubcommand((s) =>
          s
            .setName('sterge')
            .setDescription('Șterge o taxă (plățile vechi rămân în istoric)')
            .addStringOption((o) => o.setName('taxa').setDescription('Taxa de șters').setRequired(true).setAutocomplete(true))
            .addBooleanOption((o) => o.setName('confirmare').setDescription('Sigur?').setRequired(true))
        )
    )
    .addSubcommand((s) =>
      s
        .setName('canal')
        .setDescription('Setează un canal (lasă gol ca să-l scoți)')
        .addStringOption((o) =>
          o
            .setName('tip')
            .setDescription('Ce canal')
            .setRequired(true)
            .addChoices(
              { name: 'Log (toate plățile și modificările)', value: 'log' },
              { name: 'Cereri (aprobare plăți jucători)', value: 'cereri' },
              { name: 'Raport (rapoarte automate)', value: 'raport' },
              { name: 'Notificări (expirări)', value: 'notificari' }
            )
        )
        .addChannelOption((o) => o.setName('canal').setDescription('Canalul').addChannelTypes(...CANALE_TEXT))
    )
    .addSubcommand((s) =>
      s
        .setName('rol')
        .setDescription('Roluri admin / staff (colectori)')
        .addStringOption((o) =>
          o
            .setName('tip')
            .setDescription('Tipul rolului')
            .setRequired(true)
            .addChoices({ name: 'Staff (încasează taxe)', value: 'staff' }, { name: 'Admin (configurează botul)', value: 'admin' })
        )
        .addStringOption((o) =>
          o
            .setName('actiune')
            .setDescription('Adaugă sau scoate')
            .setRequired(true)
            .addChoices({ name: 'Adaugă', value: 'adauga' }, { name: 'Scoate', value: 'sterge' })
        )
        .addRoleOption((o) => o.setName('rol').setDescription('Rolul').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('reducere')
        .setDescription('Reducere procentuală pentru un rol (0 = scoate)')
        .addRoleOption((o) => o.setName('rol').setDescription('Rolul (ex: VIP)').setRequired(true))
        .addIntegerOption((o) => o.setName('procent').setDescription('Procent 0-100').setRequired(true).setMinValue(0).setMaxValue(100))
    )
    .addSubcommand((s) =>
      s
        .setName('moneda')
        .setDescription('Simbolul și formatul banilor')
        .addStringOption((o) => o.setName('simbol').setDescription('Ex: $, €, lei (scrie - pentru fără simbol)').setMaxLength(10))
        .addStringOption((o) =>
          o
            .setName('pozitie')
            .setDescription('Unde stă simbolul')
            .addChoices({ name: 'Înainte ($30.000)', value: 'inainte' }, { name: 'După (30.000$)', value: 'dupa' })
        )
        .addStringOption((o) =>
          o
            .setName('separator')
            .setDescription('Separator pentru mii')
            .addChoices(
              { name: 'Punct (30.000)', value: '.' },
              { name: 'Virgulă (30,000)', value: ',' },
              { name: 'Spațiu (30 000)', value: 'spatiu' },
              { name: 'Nimic (30000)', value: 'none' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('aspect')
        .setDescription('Culoare, titlu, footer, imagini (scrie - ca să ștergi)')
        .addStringOption((o) => o.setName('culoare').setDescription('Culoarea principală (#F1C40F, auriu, rosu...)').setMaxLength(20))
        .addStringOption((o) => o.setName('titlu').setDescription('Titlul folosit în mesaje').setMaxLength(100))
        .addStringOption((o) => o.setName('footer').setDescription('Textul de jos din embed-uri').setMaxLength(200))
        .addStringOption((o) => o.setName('thumbnail').setDescription('Link imagine mică (logo)').setMaxLength(500))
        .addStringOption((o) => o.setName('imagine').setDescription('Link imagine mare (banner panou)').setMaxLength(500))
    )
    .addSubcommand((s) =>
      s
        .setName('optiune')
        .setDescription('Schimbă o opțiune (da/nu, durate, ore...)')
        .addStringOption((o) => o.setName('setare').setDescription('Opțiunea').setRequired(true).addChoices(...optiuneChoices))
        .addStringOption((o) => o.setName('valoare').setDescription('Valoarea: da/nu, 1h, 21, zilnic...').setRequired(true).setMaxLength(50))
    )
    .addSubcommand((s) =>
      s
        .setName('mesaj')
        .setDescription('Personalizează un mesaj al botului (deschide un editor)')
        .addStringOption((o) => o.setName('cheie').setDescription('Ce mesaj').setRequired(true).addChoices(...mesajChoices))
    )
    .addSubcommand((s) => s.setName('export').setDescription('Descarcă configurația ca fișier JSON'))
    .addSubcommand((s) =>
      s
        .setName('import')
        .setDescription('Încarcă o configurație JSON (din /config export)')
        .addAttachmentOption((o) => o.setName('fisier').setDescription('Fișierul .json').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('reset')
        .setDescription('Resetează configurația la valorile implicite')
        .addBooleanOption((o) => o.setName('confirmare').setDescription('Sigur? Plățile NU se șterg').setRequired(true))
    );

  return [plata, verifica, lista, istoric, anuleaza, raport, top, activi, taxe, panou, exp, ajutor, config];
}

const NUME_REZERVATE = new Set(comenziDeBaza().map((c) => c.name));

function comandaValida(nume) {
  return typeof nume === 'string' && /^[a-z0-9_-]{1,32}$/.test(nume) && !NUME_REZERVATE.has(nume);
}

function comandaScurta(taxa, cfg) {
  const em = f.esteEmoji(taxa.emoji) && !taxa.emoji.startsWith('<') ? `${taxa.emoji} ` : '';
  const b = new SlashCommandBuilder()
    .setName(taxa.comanda)
    .setDescription(f.trunc(`${em}Încasează ${taxa.nume} (${f.suma(taxa.suma, cfg)})`, 100));
  return optiuniPlata(b, false);
}

/** Toate comenzile pentru un server: cele de bază + câte o comandă rapidă pentru fiecare taxă. */
function comenziPentru(cfg) {
  const lista = comenziDeBaza().map((c) => c.toJSON());
  const folosite = new Set();
  for (const t of cfg.taxe) {
    if (!t.activa || !t.comanda || !comandaValida(t.comanda) || folosite.has(t.comanda)) continue;
    folosite.add(t.comanda);
    lista.push(comandaScurta(t, cfg).toJSON());
    if (lista.length >= 100) break;
  }
  return lista;
}

module.exports = { comenziDeBaza, comenziPentru, comandaValida, NUME_REZERVATE };
