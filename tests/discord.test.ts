import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField,Collection,Events as DiscordEvents,MessageFlags } from 'discord.js';
import { openDatabase } from '../src/db/database.js';
import { Events } from '../src/services/events.js';
import { DiscordJobs } from '../src/services/discord-jobs.js';
import { panel } from '../src/discord/presenters.js';
import { canManage } from '../src/discord/permissions.js';
import { commands } from '../src/discord/commands.js';
import { createBot } from '../src/discord/bot.js';
import { config,guild } from './fixtures.js';
test('admin authorization permits administrator/operations role only',()=>{
 const member=(bits:bigint,roles:string[])=>({permissions:new PermissionsBitField(bits),roles:{cache:new Collection(roles.map(id=>[id,{}]))}}) as any;
 assert.equal(canManage(member(0n,[]),['ops']),false);assert.equal(canManage(member(PermissionsBitField.Flags.ManageGuild,[]),[]),false);assert.equal(canManage(member(PermissionsBitField.Flags.Administrator,[]),[]),true);assert.equal(canManage(member(0n,['ops']),['ops']),true);
 assert.ok(commands[0].options?.some(o=>o.name==='retry-role'));
});
test('persistent button IDs and feedback remains after cutoff; omitted when unset',()=>{
 const db=openDatabase(':memory:'),s=new Events(db),e=s.save(guild,'a',config);
 const p=panel(e).components[0].toJSON();assert.equal((p.components[0] as any).custom_id,`invite:claim:${e.id}`);assert.equal((p.components[2] as any).url,config.form_url);
 assert.equal(panel({...e,form_url:null}).components[0].components.length,2);assert.equal(panel({...e,closes_at:'2020-01-01T00:00:00Z'}).components[0].components.length,3);db.close();
});
test('all old panels synchronize new form URL; failure remains pending and retry succeeds',async()=>{
 const db=openDatabase(':memory:'),s=new Events(db);let e=s.save(guild,'a',config);for(const id of ['one','two'])db.prepare('INSERT INTO panels VALUES(?,?,?,?)').run(id,e.id,config.channel_id,1);
 e=s.save(guild,'a',{form_url:'https://forms.gle/newLink'},e.id);const edits:any[]=[];let fail=true;
 const client={channels:{fetch:async()=>({guildId:guild,isTextBased:()=>true,messages:{fetch:async(id:string)=>({edit:async(payload:any)=>{if(id==='two'&&fail)throw Error();edits.push(payload);}})}})}} as any;
 const jobs=new DiscordJobs(client,s,guild);assert.equal(await jobs.sync(e),1);assert.equal(db.prepare('SELECT revision FROM panels WHERE message_id=?').get('two')!.revision,1);fail=false;assert.equal(await jobs.sync(e),0);assert.equal(edits.length,2);for(const p of edits)assert.equal(p.components[0].toJSON().components[2].url,'https://forms.gle/newLink');db.close();
});
test('role failure retains code, records exception, retries and owner alert delivery persists',async()=>{
 const db=openDatabase(':memory:'),s=new Events(db),e=s.save(guild,'a',{...config,role_id:'123456789012345699'});s.import(e.id,'a','KEEP');const c=s.claim(e.id,guild,'u','U');let fail=true,sent=0;
 const client={guilds:{fetch:async()=>({members:{fetch:async()=>({roles:{add:async()=>{if(fail)throw Error('secret');}}})},fetchOwner:async()=>({send:async()=>{sent++;}})})}} as any;
 const jobs=new DiscordJobs(client,s,guild);await jobs.role(e,c);assert.equal(s.find(e.id,'u')!.code,'KEEP');assert.equal(s.find(e.id,'u')!.role_status,'failed');await jobs.alerts();await jobs.alerts();assert.equal(sent,1);fail=false;await jobs.role(e,s.find(e.id,'u')!,true);assert.equal(s.find(e.id,'u')!.role_status,'done');db.close();
});
test('ordinary users cannot invoke admin handler; responses are ephemeral',async()=>{
 const db=openDatabase(':memory:'),s=new Events(db),bot=createBot(s,guild,[]);let flags:number|undefined;
 const response=await new Promise<any>(resolve=>{
 bot.client.emit(DiscordEvents.InteractionCreate,{isChatInputCommand:()=>true,isButton:()=>false,commandName:'invite-admin',deferReply:async(o:any)=>{flags=o.flags;},inCachedGuild:()=>true,guildId:guild,guild:{members:{fetch:async()=>({permissions:new PermissionsBitField(0n),roles:{cache:new Collection()}})}},user:{id:'ordinary'},deferred:true,editReply:async(payload:any)=>resolve(payload)} as any);
 });assert.equal(flags,MessageFlags.Ephemeral);assert.match(response.content,/Only server administrators/);assert.equal(s.list(guild).length,0);await bot.stop();db.close();
});
test('failed reply does not reclaim code; old button works on a fresh bot instance without DMs',async()=>{
 const db=openDatabase(':memory:'),s=new Events(db),e=s.save(guild,'a',config);s.import(e.id,'a','RECOVER');
 for(const fail of [true,false]) {
 const bot=createBot(s,guild,[]);let flags:number|undefined;
 await new Promise<void>(resolve=>{let responses=0;bot.client.emit(DiscordEvents.InteractionCreate,{isChatInputCommand:()=>false,isButton:()=>true,customId:`invite:claim:${e.id}`,deferReply:async(o:any)=>{flags=o.flags;},inCachedGuild:()=>true,guildId:guild,user:{id:'u'},member:{displayName:'changed'},deferred:true,id:'interaction',editReply:async(p:any)=>{responses++;if(fail&&responses===1)throw Error('delivery');if(!fail)assert.match(p.content,/RECOVER/);resolve();}} as any);});
 assert.equal(flags,MessageFlags.Ephemeral);assert.equal(s.stats(e.id).assigned,1);await bot.stop();
 }db.close();
});
