'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const f = require('./format');
const d = require('./discord');

/**
 * Afișează o listă lungă pe pagini, cu butoane ◀ ▶ (5 minute).
 */
async function paginare(i, { cfg, titlu, linii, perPagina = 10, sus = '', ephemeral = true }) {
  const pagini = Math.max(1, Math.ceil(linii.length / perPagina));
  let pag = 0;

  const construieste = (dezactivat = false) => {
    const bucata = linii.slice(pag * perPagina, (pag + 1) * perPagina);
    const text = (sus ? `${sus}\n\n` : '') + (bucata.join('\n') || '_Nimic de afișat._');
    const e = d
      .embedBaza(cfg)
      .setTitle(f.trunc(titlu, 256))
      .setDescription(f.trunc(text, 4096))
      .setFooter({
        text: f.trunc(`Pagina ${pag + 1}/${pagini} • ${linii.length} rezultate${cfg.aspect.footer ? ` • ${cfg.aspect.footer}` : ''}`, 2000),
      });
    const components = [];
    if (pagini > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('pg:prima')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(dezactivat || pag === 0),
          new ButtonBuilder()
            .setCustomId('pg:inapoi')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(dezactivat || pag === 0),
          new ButtonBuilder()
            .setCustomId('pg:inainte')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(dezactivat || pag >= pagini - 1),
          new ButtonBuilder()
            .setCustomId('pg:ultima')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(dezactivat || pag >= pagini - 1)
        )
      );
    }
    return { embeds: [e], components, allowedMentions: d.FARA_PING };
  };

  if (!i.deferred && !i.replied) await i.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  const msg = await i.editReply(construieste());
  if (pagini <= 1) return;

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });
  col.on('collect', async (b) => {
    if (b.user.id !== i.user.id) {
      return b.reply({ content: 'Doar cel care a folosit comanda poate schimba pagina.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    if (b.customId === 'pg:prima') pag = 0;
    else if (b.customId === 'pg:inapoi') pag = Math.max(0, pag - 1);
    else if (b.customId === 'pg:inainte') pag = Math.min(pagini - 1, pag + 1);
    else if (b.customId === 'pg:ultima') pag = pagini - 1;
    await b.update(construieste()).catch(() => {});
  });
  col.on('end', () => {
    i.editReply(construieste(true)).catch(() => {});
  });
}

module.exports = { paginare };
