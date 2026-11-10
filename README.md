# 🏝️ Bot Taxe Cayo Perico (GTA V RP) — in rumeno

Bot Discord per gestire le taxe dell'isola di Cayo Perico:

| Taxa | Prezzo predefinito | Comando rapido |
|---|---|---|
| 🛃 Taxă Vamă | $30.000 | `/vama` |
| 💊 Taxă Droguri | $30.000 | `/droguri` |

Tutto è modificabile da Discord: prezzi, nomi, emoji, durata, nuove taxe, messaggi, colori, canali, ruoli, sconti, report automatici.

---

## 🚀 Deploy su Railway

### 1. Crea il bot su Discord
1. Vai su <https://discord.com/developers/applications> → **New Application** (es. "Cayo Perico Taxe").
2. Menu **Bot** → **Reset Token** → copia il token (serve dopo).
3. Non serve attivare nessun "Privileged Gateway Intent".
4. Menu **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot permissions: `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Use External Emojis`
   - Apri il link generato e aggiungi il bot al tuo server.

   Oppure usa direttamente questo link (sostituisci `CLIENT_ID` con l'Application ID):
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=268815360&scope=bot%20applications.commands`

### 2. Metti il progetto su Railway
1. Carica questa cartella su un repository GitHub (privato va benissimo).
2. Su <https://railway.com> → **New Project → Deploy from GitHub repo** → scegli il repo.
3. Nel servizio → **Variables** → aggiungi `DISCORD_TOKEN` = il token del punto 1.

### 3. Salvataggio dati (IMPORTANTE)
Senza questo passaggio i dati si perdono a ogni redeploy. Scegli **una** delle due:

- **PostgreSQL (consigliato):** nel progetto Railway → **+ New → Database → PostgreSQL**. Poi nel servizio del bot → Variables → aggiungi `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
- **Volume:** tasto destro sul servizio → **Attach Volume** → mount path `/data`, poi aggiungi la variabile `DATA_DIR` = `/data`.

Nei log di Railway vedrai `💾 Stocare: PostgreSQL` (o il percorso del file) e `✅ Conectat ca ...`.

---

## ⚙️ Prima configurazione (su Discord)

```
/config rol tip:Staff actiune:Adaugă rol:@Vameș        → chi può incassare le taxe
/config canal tip:Log canal:#log-taxe                   → log di tutti i pagamenti
/config canal tip:Cereri canal:#cereri-taxe             → richieste dei giocatori da approvare
/panou canal:#taxe-cayo                                 → pannello con bottoni per i giocatori
```

Opzionali:
```
/config taxa editeaza taxa:vama durata:24h rol:@Acces Cayo   → la taxa dura 24h e dà un ruolo (tolto alla scadenza)
/config taxa adauga nume:Taxă Arme suma:50k emoji:🔫          → nuova taxa (crea anche /taxa-arme)
/config reducere rol:@VIP procent:20                          → sconto 20% per i VIP
/config optiune setare:Raport automat valoare:zilnic          → report ogni giorno
/config mesaj cheie:dm_plata                                  → modifica il messaggio privato
/config moneda pozitie:După                                   → 30.000$ invece di $30.000
/config aspect culoare:auriu thumbnail:https://...            → colori e logo
```

---

## 📋 Comenzi

**Incasso (staff)**
- `/vama membru:@x` / `/droguri membru:@x` — incasso rapido (uno per ogni taxa)
- `/plata tip membru|nume [cantitate] [suma] [dovada] [nota]` — incasso completo (screenshot come prova, nome IC per chi non è su Discord, somma diversa, quantità)
- `/anuleaza id [motiv]` — annulla un pagamento (admin; o staff se attivi `staff_poate_anula`)

**Evidenza (staff)**
- `/lista` — lista completa di tutti i pagamenti con TUTTE le info: data e ora, chi ha pagato (Discord + nome IC + ID gioco), chi ha incassato, quantità, somma, sconto, scadenza, nota, prova, se è stato annullato e da chi. Filtri: membro, nome, taxa, staff, periodo, stato (valide/scadute/annullate), ordine
- `/lista id:12` — dettagli completi di un singolo pagamento
- `/istoric` — storico compatto con filtri (membro, nome IC, taxa, staff, periodo) e pagine
- `/raport [perioada]` — totale incassato, per taxa, top colectori e top pagatori
- `/top` — classifica pagatori o colectori
- `/activi` — chi ha una taxa ancora valida (per le taxe con durata)
- `/export` — file CSV per Excel/Google Sheets

**Per tutti**
- `/taxe` — lista taxe e prezzi
- `/verifica` — situazione delle proprie taxe
- Pannello: bottoni per inviare una richiesta di pagamento (nome IC, ID, quantità, link screenshot) → lo staff approva/rifiuta con un click → il giocatore riceve un DM

**Configurazione (admin = Manage Server o ruolo admin)**
- `/config vezi | taxa adauga/editeaza/sterge | canal | rol | reducere | moneda | aspect | optiune | mesaj | export | import | reset`
- `/config export` scarica tutta la config in JSON, la puoi modificare a mano e ricaricarla con `/config import` (anche su un altro server).

### Opzioni (`/config optiune`)
| Opzione | Default |
|---|---|
| Richieste dai giocatori (pannello) | da |
| Prova obbligatoria nelle richieste | nu |
| Chiedi ID del gioco | da |
| DM ai giocatori | da |
| Staff può scrivere un'altra somma | da |
| Pagamenti nuovi prolungano la taxa attiva | da |
| Reminder prima della scadenza | 1h |
| Report automatico (off/zilnic/saptamanal/lunar) | off |
| Ora report / giorno report settimanale | 21 / duminica |
| Fuso orario | Europe/Bucharest |
| Staff può annullare | nu |
| Quantità massima | 20 |
| Tag staff alle richieste | da |
| Chiunque può verificare gli altri | nu |
| Conferma pagamento visibile a tutti | da |

### Variabili nei messaggi
`{platitor} {membru} {nume} {id_joc} {taxa} {emoji} {suma} {cantitate} {total} {colector} {id} {id_cerere} {expira} {expira_relativ} {expira_text} {motiv} {server} {lista_taxe}`

---

## 🧑‍💻 Avvio in locale
```bash
npm install
cp .env.example .env   # metti il token
npm start
```
Richiede Node.js 18.17 o superiore.
