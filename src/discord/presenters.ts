import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { type Event, type Claim, formatTime } from '../services/events.js';
export function panel(e:Event) {
  const buttons=[new ButtonBuilder().setCustomId(`invite:claim:${e.id}`).setLabel('Get Invite Code').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`invite:mine:${e.id}`).setLabel('My Invite Code').setStyle(ButtonStyle.Secondary)];
  if(e.form_url) buttons.push(new ButtonBuilder().setLabel('Submit Feedback').setURL(e.form_url).setStyle(ButtonStyle.Link));
  const fields = [
    ...(e.guide ? [{name:'Guide',value:e.guide}] : []),
    {name:'Activity period (UTC)',value:`${formatTime(e.starts_at)} - ${formatTime(e.closes_at)}`},
    {name:'Feedback deadline (UTC)',value:formatTime(e.feedback_at)}
  ];
  return {embeds:[new EmbedBuilder().setTitle(`⚽ ${e.name}`).setDescription(e.description).setColor(0x5865f2).addFields(fields)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],allowedMentions:{parse:[] as never[]}};
}
export function receipt(e:Event,c:Claim) {
  return {content:`✅ You have joined this beta activity!\n\n**Invite code:** \`${c.code}\`\n**Product:** <${e.product_url}>\n**Feedback deadline (UTC):** ${formatTime(e.feedback_at)}\n**Help channel:** <#${e.help_channel_id}>${e.form_url?`\n**Feedback form:** <${e.form_url}>`:''}${e.guide?`\n\n**Guide:**\n${e.guide}`:''}\n\nPlease do not share your invite code. You can use “My Invite Code” to view it again.\nThe tester role indicates access eligibility and does not guarantee a reward.`,allowedMentions:{parse:[] as never[]}};
}
