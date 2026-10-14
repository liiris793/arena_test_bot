import { type Client } from 'discord.js';
import { Events, type Event, type Claim } from './events.js';
import { panel } from '../discord/presenters.js';
export class DiscordJobs {
  constructor(private client:Client,private events:Events,private guildId:string) {}
  async role(e:Event,c:Claim,force=false) {
    e=this.events.get(e.id,e.guild_id);
    c=this.events.find(e.id,c.user_id)??c;
    if(!e.role_id || (!force && c.role_status==='done')) return;
    try {
      const guild=await this.client.guilds.fetch(e.guild_id);
      const member=await guild.members.fetch(c.user_id);
      await member.roles.add(e.role_id,'Beta tester access');
      this.events.db.prepare("UPDATE codes SET role_status='done' WHERE id=?").run(c.id);
      this.events.audit(e.id,'bot','role_added',{user_id:c.user_id});
    } catch {
      this.events.db.prepare("UPDATE codes SET role_status='failed' WHERE id=?").run(c.id);
      this.events.alert(`role:${c.id}:${e.role_id}`,e.id,`Failed to add the tester role for user ${c.user_id}. Check role hierarchy and Manage Roles, then use retry-role.`);
      this.events.audit(e.id,'bot','role_failed',{user_id:c.user_id});
    }
  }
  async sync(e:Event) {
    let failed=0;
    const rows=this.events.db.prepare('SELECT * FROM panels WHERE event_id=? AND revision<?').all(e.id,e.revision) as {message_id:string;channel_id:string}[];
    for(const p of rows) {
      try {
        const channel=await this.client.channels.fetch(p.channel_id);
        if(!channel?.isTextBased() || !('guildId' in channel) || channel.guildId!==e.guild_id) throw new Error('channel');
        const message=await channel.messages.fetch(p.message_id);
        await message.edit(panel(e));
        this.events.db.prepare('UPDATE panels SET revision=? WHERE message_id=?').run(e.revision,p.message_id);
      } catch {
        failed++;
        this.events.audit(e.id,'bot','panel_sync_failed',{message_id:p.message_id});
        this.events.alert(`panel:${p.message_id}:${e.revision}`,e.id,`Failed to update panel ${p.message_id}. It will retry after channel access is restored; republish deleted panels.`);
      }
    }
    return failed;
  }
  async alerts() {
    const rows=this.events.db.prepare('SELECT * FROM alerts WHERE delivered_at IS NULL LIMIT 20').all() as {key:string;event_id:string;message:string}[];
    for(const row of rows) {
      try {
        const owner=await (await this.client.guilds.fetch(this.guildId)).fetchOwner();
        await owner.send({content:`Invite Bot · Activity ${row.event_id}\n${row.message}`,allowedMentions:{parse:[]}});
        this.events.db.prepare('UPDATE alerts SET delivered_at=? WHERE key=?').run(new Date().toISOString(),row.key);
      } catch { console.warn(JSON.stringify({event:'admin_alert_pending',activity:row.event_id})); }
    }
  }
  async tick() {
    for(const e of this.events.list(this.guildId)) {
      await this.sync(e);
      const claims=this.events.db.prepare("SELECT * FROM codes WHERE event_id=? AND role_status='pending' LIMIT 20").all(e.id) as Claim[];
      for(const c of claims) await this.role(e,c);
    }
    await this.alerts();
  }
}
