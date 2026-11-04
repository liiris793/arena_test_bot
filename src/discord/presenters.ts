import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { type Event, type Claim, formatTime } from '../services/events.js';
export function panel(e:Event) {
  const buttons=[new ButtonBuilder().setCustomId(`invite:mine:${e.id}`).setLabel('My Invite Code').setStyle(ButtonStyle.Secondary)];
  if(!e.ended) {
    buttons.unshift(new ButtonBuilder().setCustomId(`invite:claim:${e.id}`).setLabel('Get Invite Code').setStyle(ButtonStyle.Secondary));
    // Discord requires URL buttons to use the Link style; Link buttons render in Discord's neutral style.
    if(e.form_url) buttons.push(new ButtonBuilder().setLabel('Submit Feedback').setURL(e.form_url).setStyle(ButtonStyle.Link));
  }
  const fields = [
    ...(e.ended ? [{name:'STATUS',value:'**ENDED**'}] : []),
    ...(e.guide ? [{name:'Guide',value:e.guide}] : []),
    {name:'Activity period (UTC)',value:`${formatTime(e.starts_at)} - ${formatTime(e.closes_at)}`},
    ...(e.feedback_at ? [{name:'Feedback deadline (UTC)',value:formatTime(e.feedback_at)}] : [])
  ];
  return {embeds:[new EmbedBuilder().setTitle(`${e.ended ? 'ENDED · ' : ''}⚽ ${e.name}`).setDescription(e.description).setColor(0x000000).addFields(fields)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],allowedMentions:{parse:[] as never[]}};
}
export function receipt(e:Event,c:Claim) {
  return {content:`${e.ended?'⚠️ This activity has ended.\n\n':'✅ You have joined this beta activity!\n\n'}**Invite code:** \`${c.code}\`\n**Product:** <${e.product_url}>${e.feedback_at?`\n**Feedback deadline (UTC):** ${formatTime(e.feedback_at)}`:''}\n**Help channel:** <#${e.help_channel_id}>${e.form_url?`\n**Feedback form:** <${e.form_url}>`:''}${e.guide?`\n\n**Guide:**\n${e.guide}`:''}\n\nPlease do not share your invite code. You can use “My Invite Code” to view it again.\nThe tester role indicates access eligibility and does not guarantee a reward.`,allowedMentions:{parse:[] as never[]}};
}
