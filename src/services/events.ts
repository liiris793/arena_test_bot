import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { immediate, type DB } from '../db/database.js';
const https = z.string().max(500).url().refine(s => { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; }, 'Use an HTTPS URL');
export const formUrl = https.refine(s => { const u = new URL(s); return !u.port && ((u.hostname === 'forms.gle' && /^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) || (u.hostname === 'docs.google.com' && /^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[A-Za-z0-9_-]+\/(?:viewform|edit)\/?$/.test(u.pathname))); }, 'Use a Google Forms or forms.gle URL');
const time = z.string().datetime({ offset: true }).transform(s => new Date(s).toISOString());
const snowflake = z.string().regex(/^\d{17,20}$/);
export const eventSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(3000), guide: z.string().trim().max(1000).default(''),
  product_url: https, form_url: formUrl.nullable().default(null),
  starts_at: time, closes_at: time, feedback_at: time,
  timezone: z.string().default('UTC').refine(s => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } }, 'Invalid IANA timezone'),
  capacity: z.number().int().min(0).max(1000000), role_id: snowflake.nullable().default(null),
  channel_id: snowflake, help_channel_id: snowflake,
  paused: z.boolean().default(false)
}).strict().refine(c => c.starts_at < c.closes_at && c.feedback_at >= c.starts_at, 'Claim deadline must be after start; feedback deadline must not be before start');
export type Config = z.infer<typeof eventSchema>;
export type Event = Config & { id: string; guild_id: string; revision: number };
export type Claim = { id: number; event_id: string; code: string; user_id: string; display_name: string; assigned_at: string; role_status: string };
export class UserError extends Error {}
export class Events {
  constructor(public db: DB) {}
  audit(event: string, actor: string, action: string, detail: object = {}) {
    this.db.prepare('INSERT INTO audit(event_id,actor,action,detail,created_at) VALUES(?,?,?,?,?)').run(event, actor, action, JSON.stringify(detail), new Date().toISOString());
  }
  get(id: string, guild: string): Event {
    const row = this.db.prepare('SELECT * FROM events WHERE id=? AND guild_id=?').get(id,guild) as {id:string;guild_id:string;config:string;revision:number}|undefined;
    if (!row) throw new UserError('No activity with that ID exists in this server.');
    return { ...JSON.parse(row.config), id:row.id, guild_id:row.guild_id, revision:row.revision };
  }
  list(guild: string): Event[] { return (this.db.prepare('SELECT id FROM events WHERE guild_id=?').all(guild) as {id:string}[]).map(r => this.get(r.id,guild)); }
  save(guild: string, actor: string, input: unknown, id?: string): Event {
    return immediate(this.db, () => {
      const previous = id ? this.get(id,guild) : undefined;
      const {id:_id,guild_id:_guild,revision:_rev,...old} = previous ?? {};
      const c = eventSchema.parse({ ...old, ...(input as object) });
      if (id && c.capacity < this.stats(id).assigned) throw new UserError('Capacity cannot be lower than the number of existing claims.');
      const key = id ?? randomUUID();
      this.db.prepare('INSERT INTO events(id,guild_id,config) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,revision=events.revision+1').run(key,guild,JSON.stringify(c));
      if (previous && previous.role_id !== c.role_id) this.db.prepare("UPDATE codes SET role_status=? WHERE event_id=? AND status='assigned'").run(c.role_id ? 'pending':'none',key);
      this.audit(key,actor,previous?'edit':'create',{fields:Object.keys(input as object)});
      return this.get(key,guild);
    });
  }
  stats(id: string) {
    const r = this.db.prepare("SELECT count(*) total, coalesce(sum(status='unused'),0) unused, coalesce(sum(status='assigned'),0) assigned, coalesce(sum(status='disabled'),0) disabled, coalesce(sum(role_status IN ('pending','failed')),0) role_pending FROM codes WHERE event_id=?").get(id) as Record<string,number>;
    return r;
  }
  import(id: string, actor: string, text: string) {
    return immediate(this.db, () => {
      let added=0, duplicate=0, invalid=0;
      const seen = new Set<string>();
      for (const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)) {
        const code=line.trim(); if (!code) continue;
        if (code.length > 256 || /[\s\x00-\x1f\x7f`]/u.test(code)) { invalid++; continue; }
        if (seen.has(code)) { duplicate++; continue; } seen.add(code);
        const n = this.db.prepare('INSERT OR IGNORE INTO codes(event_id,code) VALUES(?,?)').run(id,code).changes;
        if (n) added++; else duplicate++;
      }
      const result={added,duplicate,invalid,remaining:this.stats(id).unused};
      this.audit(id,actor,'import',result); return result;
    });
  }
  find(id: string, user: string): Claim|undefined { return this.db.prepare("SELECT * FROM codes WHERE event_id=? AND user_id=? AND status='assigned'").get(id,user) as Claim|undefined; }
  claim(id: string, guild: string, user: string, name: string, now=new Date()): Claim {
    const result = immediate(this.db, () => {
      const e=this.get(id,guild), old=this.find(id,user); if(old) return old;
      if(e.paused) throw new UserError('Claims are paused for this activity.');
      if(now.toISOString()<e.starts_at) throw new UserError(`Claims have not opened yet: ${formatTime(e.starts_at)}`);
      if(now.toISOString()>=e.closes_at) throw new UserError('The claim deadline has passed.');
      if(this.stats(id).assigned>=e.capacity) throw new UserError('This activity is full.');
      const code=this.db.prepare("SELECT id FROM codes WHERE event_id=? AND status='unused' ORDER BY id LIMIT 1").get(id) as {id:number}|undefined;
      if(!code) { this.alert(`stock:${id}`,id,'Inventory is empty. Please import more invite codes.'); return null; }
      this.db.prepare("UPDATE codes SET status='assigned',user_id=?,display_name=?,assigned_at=?,role_status=? WHERE id=?").run(user,name,now.toISOString(),e.role_id?'pending':'none',code.id);
      this.audit(id,user,'claim'); return this.find(id,user)!;
    });
    if(!result) throw new UserError('Inventory is empty. The administrators have been notified; please try again later.');
    return result;
  }
  disable(id: string, actor: string, code: string) {
    immediate(this.db,()=>{ const r=this.db.prepare("UPDATE codes SET status='disabled' WHERE event_id=? AND code=? AND status='unused'").run(id,code);
      if(!r.changes) throw new UserError('Unused code not found. Assigned codes cannot be disabled or reclaimed.'); this.audit(id,actor,'disable'); });
  }
  alert(key: string, id: string, message: string) { this.db.prepare('INSERT OR IGNORE INTO alerts(key,event_id,message) VALUES(?,?,?)').run(key,id,message); }
  export(id: string) {
    const rows=this.db.prepare("SELECT user_id,display_name,code,assigned_at FROM codes WHERE event_id=? AND status='assigned' ORDER BY id").all(id);
    const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    return '\uFEFF'+['discord_id,display_name,invite_code,assigned_at_utc',...rows.map(r=>[r.user_id,r.display_name,r.code,r.assigned_at].map(cell).join(','))].join('\r\n');
  }
  exportInventory(id: string) {
    const rows=this.db.prepare("SELECT code,status,user_id,display_name,assigned_at,role_status FROM codes WHERE event_id=? ORDER BY id").all(id);
    const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    return '\uFEFF'+['invite_code,status,discord_id,display_name,assigned_at_utc,role_status',...rows.map((r:any)=>[r.code,r.status,r.user_id,r.display_name,r.assigned_at,r.role_status].map(cell).join(','))].join('\r\n');
  }
}
export function formatTime(s:string) { return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date(s))+' UTC'; }
