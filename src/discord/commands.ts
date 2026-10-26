import { PermissionFlagsBits, SlashCommandBuilder, ChannelType } from 'discord.js';
const command=new SlashCommandBuilder().setName('invite-admin').setDescription('Manage invite activities (admins and operators only)').setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
command.addSubcommand(s=>s.setName('create').setDescription('Create an activity from a JSON config').addAttachmentOption(o=>o.setName('config').setDescription('UTF-8 JSON configuration file').setRequired(true)));
command.addSubcommand(s=>s.setName('list').setDescription('List all activities in this server'));
command.addSubcommand(s=>s.setName('backup').setDescription('Create a private SQLite database backup'));
for(const [name,description] of Object.entries({edit:'Edit an activity and sync its panels',import:'Import TXT invite codes',publish:'Publish an activity panel',refresh:'Refresh all existing panels',pause:'Pause new claims',resume:'Resume new claims',stats:'View inventory and capacity',lookup:'Look up a user claim',export:'Export claimed users as CSV',inventory:'Export the complete code inventory',disable:'Disable an unused code', 'retry-role':'Retry the tester role for a user'})) {
  command.addSubcommand(s=>{
    s.setName(name).setDescription(description).addStringOption(o=>o.setName('event').setDescription('Activity ID').setRequired(true));
    if(name==='edit') s.addAttachmentOption(o=>o.setName('config').setDescription('JSON patch with fields to change').setRequired(true));
    if(name==='import') s.addAttachmentOption(o=>o.setName('file').setDescription('UTF-8 TXT, one code per line, max 1 MiB').setRequired(true));
    if(name==='publish') s.addChannelOption(o=>o.setName('channel').setDescription('Optional channel; defaults to the activity channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement));
    if(name==='lookup'||name==='retry-role') s.addStringOption(o=>o.setName('user-id').setDescription('Discord user ID').setRequired(true).setMinLength(17).setMaxLength(20));
    if(name==='disable') s.addStringOption(o=>o.setName('code').setDescription('Unused invite code').setRequired(true));
    return s;
  });
}
// Runtime member permission checks remain authoritative for configured operator roles.
export const commands=[command.toJSON()];
