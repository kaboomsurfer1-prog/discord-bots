'use strict';

/**
 * Configurația implicită pentru fiecare server (guild).
 * Aproape tot ce e aici se poate modifica direct din Discord cu /config,
 * sau exportând/importând JSON-ul cu /config export și /config import.
 */

const ZI = 24 * 60 * 60 * 1000;
const ORA = 60 * 60 * 1000;

const DEFAULT_TAXE = [
  {
    id: 'vama',
    nume: 'Taxă Vamă',
    comanda: 'vama',
    emoji: '🛃',
    suma: 30000,
    durata: 0, // 0 = nu expiră; altfel milisecunde (ex: 24h)
    descriere: 'Taxa vamală pentru intrarea pe Insula Cayo Perico',
    culoare: '#3498DB',
    rolId: null, // rol dat automat la plată (și scos la expirare)
    activa: true,
    inPanou: true,
  },
  {
    id: 'droguri',
    nume: 'Taxă Droguri',
    comanda: 'droguri',
    emoji: '💊',
    suma: 30000,
    durata: 0,
    descriere: 'Taxa pentru transportul de droguri pe Insula Cayo Perico',
    culoare: '#2ECC71',
    rolId: null,
    activa: true,
    inPanou: true,
  },
];

const DEFAULT_MESAJE = {
  plata_confirmare: '✅ {platitor} a plătit **{taxa}** ×{cantitate} — **{total}**',
  dm_plata:
    '🏝️ Plata ta pentru **{taxa}** (×{cantitate}, **{total}**) a fost înregistrată pe **{server}** de {colector}.\n{expira_text}',
  dm_reminder:
    '⏰ Taxa **{taxa}** expiră {expira_relativ}. Nu uita să o reînnoiești ca să ai acces în continuare pe Insula Cayo Perico!',
  dm_expirat: '⌛ Taxa **{taxa}** a expirat. Plătește din nou pentru a avea acces pe Insula Cayo Perico.',
  dm_cerere_aprobata: '✅ Cererea ta **#{id_cerere}** pentru **{taxa}** a fost **aprobată** de {colector}. Total: **{total}**.\n{expira_text}',
  dm_cerere_respinsa: '❌ Cererea ta **#{id_cerere}** pentru **{taxa}** a fost **respinsă** de {colector}.\n**Motiv:** {motiv}',
  anunt_expirare: '⌛ Taxa **{taxa}** a lui {platitor} a expirat.',
  panou_titlu: '🏝️ Insula Cayo Perico — Taxe',
  panou_descriere:
    'Pentru a avea acces pe **Insula Cayo Perico** trebuie plătite taxele de mai jos.\n\n{lista_taxe}\n\n' +
    'După ce ai plătit în joc, apasă butonul taxei și completează formularul. Un membru staff îți va confirma plata.',
};

/** Descrierea fiecărui mesaj (apare în /config mesaj). */
const MESAJE_INFO = {
  plata_confirmare: 'Textul din confirmarea unei plăți (canal + log)',
  dm_plata: 'Mesaj privat trimis jucătorului după plată',
  dm_reminder: 'Mesaj privat cu puțin înainte de expirarea taxei',
  dm_expirat: 'Mesaj privat când taxa expiră',
  dm_cerere_aprobata: 'Mesaj privat când cererea e aprobată',
  dm_cerere_respinsa: 'Mesaj privat când cererea e respinsă',
  anunt_expirare: 'Anunț în canalul de notificări când expiră o taxă',
  panou_titlu: 'Titlul panoului cu butoane',
  panou_descriere: 'Descrierea panoului cu butoane',
};

const PLACEHOLDERS =
  '`{platitor}` `{membru}` `{nume}` `{id_joc}` `{taxa}` `{emoji}` `{suma}` `{cantitate}` `{total}` ' +
  '`{colector}` `{id}` `{id_cerere}` `{expira}` `{expira_relativ}` `{expira_text}` `{motiv}` `{server}` `{lista_taxe}`';

const DEFAULT_CONFIG = {
  taxe: DEFAULT_TAXE,
  moneda: {
    simbol: '$',
    pozitie: 'inainte', // inainte => $30.000 | dupa => 30.000$
    separator: '.', // separator mii
  },
  canale: {
    comenzi: null, // dacă e setat, /plata și comenzile rapide merg doar aici
    log: null, // toate plățile/anulările/modificările
    cereri: null, // cererile jucătorilor (aprobare/respingere)
    raport: null, // rapoartele automate
    notificari: null, // anunțuri expirare
  },
  roluri: {
    admin: [], // pot configura botul (pe lângă cei cu Manage Server)
    staff: [], // pot încasa taxe / aproba cereri
  },
  reduceri: [], // [{ rolId, procent }]
  aspect: {
    culoare: '#F1C40F',
    titlu: '🏝️ Insula Cayo Perico',
    footer: 'Cayo Perico • Sistem Taxe',
    thumbnail: null,
    imagine: null,
  },
  optiuni: {
    cereriJucatori: true,
    dovadaObligatorie: false,
    cereIdJoc: true,
    dmNotificari: true,
    sumaPersonalizata: true,
    cumulareDurata: true,
    reminderInainte: ORA,
    raportAutomat: 'off', // off | zilnic | saptamanal | lunar
    oraRaport: 21,
    ziRaport: 0, // 0 = duminică ... 6 = sâmbătă
    fusOrar: 'Europe/Bucharest',
    staffPoateAnula: false,
    cantitateMaxima: 20,
    pingStaffCereri: true,
    verificarePublica: false,
    confirmarePublica: true,
  },
  mesaje: DEFAULT_MESAJE,
  panouri: [], // [{ canalId, mesajId }] — actualizate automat
  stare: { ultimRaport: null },
};

/**
 * Registrul opțiunilor modificabile cu /config optiune.
 * tip: bool | durata | int | enum | tz
 */
const OPTIUNI = {
  cereri_jucatori: { camp: 'cereriJucatori', tip: 'bool', eticheta: 'Cereri de plată de la jucători (butoane panou)' },
  dovada_obligatorie: { camp: 'dovadaObligatorie', tip: 'bool', eticheta: 'Dovadă (link screenshot) obligatorie la cereri' },
  cere_id_joc: { camp: 'cereIdJoc', tip: 'bool', eticheta: 'Cere ID-ul din joc în formularul de cerere' },
  dm_notificari: { camp: 'dmNotificari', tip: 'bool', eticheta: 'Trimite mesaje private jucătorilor' },
  suma_personalizata: { camp: 'sumaPersonalizata', tip: 'bool', eticheta: 'Staff-ul poate scrie altă sumă la încasare' },
  cumulare_durata: { camp: 'cumulareDurata', tip: 'bool', eticheta: 'Plățile noi prelungesc taxa încă activă' },
  reminder_inainte: { camp: 'reminderInainte', tip: 'durata', eticheta: 'Reminder înainte de expirare (0 = oprit)' },
  raport_automat: {
    camp: 'raportAutomat',
    tip: 'enum',
    valori: ['off', 'zilnic', 'saptamanal', 'lunar'],
    eticheta: 'Raport automat',
  },
  ora_raport: { camp: 'oraRaport', tip: 'int', min: 0, max: 23, eticheta: 'Ora raportului automat (0-23)' },
  zi_raport: {
    camp: 'ziRaport',
    tip: 'enum',
    valori: ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'],
    index: true,
    eticheta: 'Ziua raportului săptămânal',
  },
  fus_orar: { camp: 'fusOrar', tip: 'tz', eticheta: 'Fus orar (ex: Europe/Bucharest)' },
  staff_poate_anula: { camp: 'staffPoateAnula', tip: 'bool', eticheta: 'Staff-ul (nu doar adminii) poate anula și edita plăți' },
  cantitate_maxima: { camp: 'cantitateMaxima', tip: 'int', min: 1, max: 1000, eticheta: 'Cantitatea maximă la o plată' },
  ping_staff_cereri: { camp: 'pingStaffCereri', tip: 'bool', eticheta: 'Menționează staff-ul la cereri noi' },
  verificare_publica: { camp: 'verificarePublica', tip: 'bool', eticheta: 'Oricine poate verifica taxele altora' },
  confirmare_publica: { camp: 'confirmarePublica', tip: 'bool', eticheta: 'Confirmarea plății e vizibilă tuturor în canal' },
};

module.exports = { DEFAULT_CONFIG, DEFAULT_TAXE, DEFAULT_MESAJE, MESAJE_INFO, PLACEHOLDERS, OPTIUNI, ZI, ORA };
