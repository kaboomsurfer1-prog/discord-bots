# Legacy of CLT Welcome + Reaction Role Bot

Bot Discord pronto per Railway.

## Variabili Railway

DISCORD_TOKEN=token_bot
WELCOME_CHANNEL_ID=1505903653779931280
REACTION_CHANNEL_ID=1516572771302379721
REACTION_MESSAGE_ID=0
REACTION_EMOJI=✅
REACTION_ROLE_ID=1505912122926694550
SERVER_NAME=LEGACY OF CLT

## Dopo il deploy

1. Attiva nel Discord Developer Portal:
   - Server Members Intent
   - Message Content Intent

2. Invita il bot con permessi:
   - Send Messages
   - Attach Files
   - Add Reactions
   - Manage Roles
   - Read Message History

3. Sul server Discord scrivi:
   !reaction_setup

4. Il bot crea il messaggio reaction role.
   Copia l'ID del messaggio e mettilo su Railway:
   REACTION_MESSAGE_ID=id_messaggio

5. Riavvia il deploy.
