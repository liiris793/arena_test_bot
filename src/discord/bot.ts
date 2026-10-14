import { AttachmentBuilder, ChannelType, Client, Events as DiscordEvents, GatewayIntentBits, MessageFlags, PermissionFlagsBits, type Attachment, type ChatInputCommandInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { Events, UserError, eventSchema, type Event } from '../services/events.js';
import { DiscordJobs } from '../services/discord-jobs.js';
import { canManage } from './permissions.js';
import { panel, receipt } from './presenters.js';
export async function readAttachment(a:Attachment, extension:string) {
  if(!a.name.toLowerCase().endsWith(extension)||a.size>1048576) throw new UserError(`Upload a ${extension} file no larger than 1 MiB.`);
  const url=new URL(a.url);
  if(url.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)) throw new UserError('Invalid attachment source.');
  const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok||!r.body) throw new UserError('Attachment download failed. Please upload it again.');
  const chunks:Uint8Array[]=[];let size=0;
  for await(const chunk of r.body) { size+=chunk.length; if(size>1048576) throw new UserError('The file is larger than 1 MiB.'); chunks.push(chunk); }
  try {return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));} catch {throw new UserError('The file must use UTF-8 encoding.');}
}
export function createBot(events:Events,guildId:string,adminRoles:string[]) {
  const client=new Client({intents:[GatewayIntentBits.Guilds],allowedMentions:{parse:[]}});
  const jobs=new DiscordJobs(client,events,guildId);
  // Serialize management and background updates; claims use short SQLite transactions.
  let queue=Promise.resolve();
  const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{ const next=queue.then(fn);queue=next.then(()=>{},()=>{});return next; };
  async function validateTargets(i:ChatInputCommandInteraction,e:Event) {
    const guild=await client.guilds.fetch(i.guildId!);
    for(const id of [e.channel_id,e.help_channel_id]) {
      const ch=await guild.channels.fetch(id);
      if(!ch || ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(ch.type)) throw new UserError('The publish and help channels must be text or announcement channels in this server.');
    }
    if(e.role_id) {
      const role=await guild.roles.fetch(e.role_id), me=await guild.members.fetchMe();
      if(!role || role.id===guild.id || role.managed || role.permissions.has(PermissionFlagsBits.Administrator)) throw new UserError('Invalid tester role. Managed, @everyone, and Administrator roles cannot be used.');
      if(!me.permissions.has(PermissionFlagsBits.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0) throw new UserError('The Bot needs Manage Roles, and its highest role must be above the tester role.');
    }
  }
  async function admin(i:ChatInputCommandInteraction) {
    const member=await i.guild!.members.fetch({user:i.user.id,force:true});
    if(!canManage(member,adminRoles)) throw new UserError('Only server administrators or configured operator roles can use this command.');
    const sub=i.options.getSubcommand(), id=i.options.getString('event');
    let e=id?events.get(id,guildId):undefined;
    if(sub==='list') {const list=events.list(guildId); await i.editReply({files:[new AttachmentBuilder(Buffer.from(JSON.stringify(list.map(({id,name,paused,capacity})=>({id,name,paused,capacity})),null,2)),{name:'events.json'})]});return;}
    if(sub==='backup') {
      const path=join(process.cwd(),`data/backup-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.sqlite`);
      try { events.db.prepare('VACUUM INTO ?').run(path); await i.editReply({content:'Private database backup created.',files:[new AttachmentBuilder(path,{name:'invite-bot-backup.sqlite'})]}); }
      finally { try { await unlink(path); } catch { /* cleanup is best effort */ } }
      return;
    }
    if(sub==='create'||sub==='edit') {
      let input:unknown;try {input=JSON.parse(await readAttachment(i.options.getAttachment('config',true),'.json'));} catch(error) {if(error instanceof SyntaxError) throw new UserError('Invalid JSON.');throw error;}
      if(!input || typeof input!=='object' || Array.isArray(input)) throw new UserError('The configuration must be a JSON object.');
      const {id:_id,guild_id:_guild,revision:_rev,...previous}=e??{};
      const config=eventSchema.parse({...previous,...input});
      await validateTargets(i,{...config,id:e?.id??'',guild_id:guildId,revision:1});
      e=events.save(guildId,i.user.id,input,e?.id);
      const failed=await jobs.sync(e);
      await i.editReply(`Activity saved: ${e.name}\nID: ${e.id}\n${failed?`${failed} panel(s) failed to update; the background job will retry. The old feedback link remains available until sync succeeds.`:'Existing panels synchronized.'}`);return;
    }
    if(!e) throw new UserError('Please provide an activity ID.');
    switch(sub) {
      case 'import': {const result=events.import(e.id,i.user.id,await readAttachment(i.options.getAttachment('file',true),'.txt')); if(result.added) events.db.prepare('DELETE FROM alerts WHERE key=?').run(`stock:${e.id}`); await i.editReply(`Added ${result.added}; duplicates ${result.duplicate}; invalid ${result.invalid}; remaining inventory ${result.remaining}.\nImporting codes does not verify them in Arena.`);break;}
      case 'publish': {
        const channel=await i.guild!.channels.fetch(i.options.getChannel('channel')?.id??e.channel_id);
        if(!channel || ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type) || !channel.isTextBased()) throw new UserError('Choose a text or announcement channel in this server.');
        const message=await channel.send(panel(e));
        events.db.prepare('INSERT INTO panels(message_id,event_id,channel_id,revision) VALUES(?,?,?,?)').run(message.id,e.id,channel.id,e.revision);
        events.audit(e.id,i.user.id,'publish',{message_id:message.id}); await i.editReply(`Panel published: ${message.url}`);break;
      }
      case 'refresh': {events.db.prepare('UPDATE panels SET revision=0 WHERE event_id=?').run(e.id);const failures=await jobs.sync(e);await i.editReply(`Refresh complete. Failed panels: ${failures}; failed items will be retried.`);break;}
      case 'pause':case 'resume': {e=events.save(guildId,i.user.id,{paused:sub==='pause'},e.id);events.audit(e.id,i.user.id,sub);const failures=await jobs.sync(e);await i.editReply(`${sub==='pause'?'Claims paused':'Claims resumed'}. Panel update failures: ${failures}.`);break;}
      case 'stats': {const s=events.stats(e.id);const pending=events.db.prepare('SELECT count(*) n FROM alerts WHERE event_id=? AND delivered_at IS NULL').get(e.id)!.n;await i.editReply(`Total codes ${s.total} · unused ${s.unused} · disabled ${s.disabled}\nClaimed ${s.assigned} · remaining capacity ${e.capacity-s.assigned} · roles pending ${s.role_pending}\nUndelivered admin alerts ${pending}`);break;}
      case 'lookup':case 'retry-role': {const user=i.options.getString('user-id',true);if(!/^\d{17,20}$/.test(user)) throw new UserError('Invalid Discord user ID.');const c=events.find(e.id,user);if(!c) throw new UserError('This user has not claimed an invite for this activity.');if(sub==='retry-role'){await jobs.role(e,c,true);const current=events.find(e.id,user)!;await i.editReply(`Tester role status: ${current.role_status}. The invite code is unchanged.`);}else await i.editReply(receipt(e,c));break;}
      case 'export': {await i.editReply({files:[new AttachmentBuilder(Buffer.from(events.export(e.id)),{name:`participants-${e.id}.csv`})]});events.audit(e.id,i.user.id,'export');break;}
      case 'inventory': {await i.editReply({files:[new AttachmentBuilder(Buffer.from(events.exportInventory(e.id)),{name:`inventory-${e.id}.csv`})]});events.audit(e.id,i.user.id,'inventory_export');break;}
      case 'disable': {events.disable(e.id,i.user.id,i.options.getString('code',true));await i.editReply('Code disabled. It will not be assigned.');break;}
    }
  }
  client.on(DiscordEvents.InteractionCreate,async i=>{
    if(!i.isChatInputCommand()&&!i.isButton()) return;
    if(i.isChatInputCommand()&&i.commandName!=='invite-admin') return;
    if(i.isButton()&&!i.customId.startsWith('invite:')) return;
    let stage = 'received';
    try {
      stage = 'deferReply';
      await i.deferReply({flags:MessageFlags.Ephemeral});
      stage = 'validateGuild';
      if(!i.inCachedGuild()||i.guildId!==guildId) throw new UserError('This Bot only supports its configured server.');
      if(i.isChatInputCommand()) { stage = 'adminCommand'; await serial(()=>admin(i)); }
      else {
        const [,action,id]=i.customId.split(':');
        if(!['claim','mine'].includes(action)||!id) throw new UserError('Invalid activity button.');
        const e=events.get(id,guildId);
        stage = 'claim';
        const claim=action==='claim'?events.claim(id,guildId,i.user.id,i.member.displayName):events.find(id,i.user.id);
        if(!claim) throw new UserError('You have not claimed an invite for this activity. Click “Get Invite Code” first.');
        await i.editReply(receipt(e,claim));
        // The claim is saved before presentation; delivery or role failures never reclaim it.
        await serial(()=>jobs.role(e,claim,action==='claim'));
      }
    } catch(error) {
      const expected=error instanceof UserError||error instanceof ZodError;
      const message=error instanceof UserError?error.message:error instanceof ZodError?'Invalid activity configuration. Check the fields, dates, URLs, and capacity.':'The system is temporarily unavailable. Please try again; if an invite was assigned, use “My Invite Code” to retrieve it.';
      if(!expected) {
        const detail = error instanceof Error ? { type: error.name, message: error.message, code: 'code' in error ? String((error as { code?: unknown }).code) : undefined } : { type: typeof error, message: String(error) };
        console.error(JSON.stringify({event:'interaction_failed',interaction:i.id,stage,...detail}));
        try {events.audit('',i.user.id,'interaction_failed',{interaction:i.id,type:detail.type,message:detail.message});} catch { /* Do not expose details if the database is unavailable. */ }
      }
      try { if(i.deferred||i.replied) await i.editReply({content:message});else await i.reply({content:message,flags:MessageFlags.Ephemeral}); } catch { /* The next click can retrieve an existing claim. */ }
    }
  });
  let timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{try{await serial(()=>jobs.tick());}catch(error){console.error(JSON.stringify({event:'background_failed',type:error instanceof Error?error.name:typeof error,message:error instanceof Error?error.message:String(error)}));}finally{if(client.isReady())timer=setTimeout(tick,30000);}};
  client.once(DiscordEvents.ClientReady,()=>{console.info('{"event":"ready"}');void tick();});
  client.on(DiscordEvents.Error,(error)=>console.error(JSON.stringify({event:'discord_client_error',type:error.name,message:error.message})));
  return {client,stop:async()=>{if(timer)clearTimeout(timer);await client.destroy();await queue;}};
}
