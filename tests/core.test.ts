import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db/database.js';
import { Events,formUrl } from '../src/services/events.js';
import { config,guild } from './fixtures.js';
function setup(){const db=openDatabase(':memory:'),s=new Events(db),e=s.save(guild,'admin',config);return {db,s,e};}
test('100 codes, capacity 20; duplicate clicks stable and lookup does not consume',()=>{
 const {db,s,e}=setup();assert.equal(s.import(e.id,'admin',Array.from({length:100},(_,i)=>`CODE-${i}`).join('\n')).added,100);
 for(let i=0;i<20;i++){const a=s.claim(e.id,guild,`${i}`,'Alice');assert.equal(s.claim(e.id,guild,`${i}`,'changed nickname').code,a.code);assert.equal(s.find(e.id,`${i}`)?.code,a.code);}
 assert.throws(()=>s.claim(e.id,guild,'21','Bob'),/activity is full/);assert.equal(s.stats(e.id).unused,80);assert.equal(s.stats(e.id).assigned,20);db.close();
});
test('import trims, preserves case, detects duplicate in file and existing/disabled codes',()=>{
 const {db,s,e}=setup();assert.deepEqual(s.import(e.id,'admin','\uFEFF A \nA\na\n\nwith space\n`bad\nB\r\n'),{added:3,duplicate:1,invalid:2,remaining:3});
 s.disable(e.id,'admin','B');assert.deepEqual(s.import(e.id,'admin','A\nB\nC'),{added:1,duplicate:2,invalid:0,remaining:3});db.close();
});
test('pause, cutoff, pre-start still return existing record; capacity cannot fall below allocated',()=>{
 const {db,s,e}=setup();s.import(e.id,'admin','A\nB');const c=s.claim(e.id,guild,'u','Name');
 s.save(guild,'admin',{paused:true},e.id);assert.equal(s.claim(e.id,guild,'u','New').code,c.code);assert.throws(()=>s.claim(e.id,guild,'v','V'),/Claims are paused/);
 s.save(guild,'admin',{paused:false},e.id);assert.throws(()=>s.claim(e.id,guild,'v','V',new Date('2025-01-01')),/have not opened/);assert.throws(()=>s.claim(e.id,guild,'v','V',new Date('2100-01-01')),/deadline has passed/);
 assert.equal(s.claim(e.id,guild,'u','Rejoined',new Date('2100-01-01')).code,c.code);assert.throws(()=>s.save(guild,'admin',{capacity:0},e.id),/Capacity/);assert.throws(()=>s.disable(e.id,'admin',c.code),/Assigned codes/);db.close();
});
test('empty stock persists one durable alert and no allocation',()=>{const {db,s,e}=setup();for(let i=0;i<3;i++)assert.throws(()=>s.claim(e.id,guild,'u','U'),/Inventory is empty/);assert.equal(s.stats(e.id).assigned,0);assert.equal(db.prepare('SELECT count(*) n FROM alerts').get()!.n,1);db.close();});
test('events isolated; cross-server access rejected',()=>{const {db,s,e}=setup(),other=s.save(guild,'admin',config);s.import(e.id,'a','SAME');s.import(other.id,'a','SAME');assert.equal(s.claim(e.id,guild,'u','U').code,s.claim(other.id,guild,'u','U').code);assert.throws(()=>s.claim(e.id,'other-guild','u','U'),/No activity/);db.close();});
test('Google Forms strict host validation and nullable removal',()=>{
 for(const url of ['https://forms.gle/abc','https://docs.google.com/forms/d/e/abc/viewform?usp=sf_link','https://docs.google.com/forms/d/abc/edit'])assert.equal(formUrl.safeParse(url).success,true);
 for(const url of ['http://forms.gle/a','https://forms.gle.evil.com/a','https://docs.google.com.evil.com/forms/d/a/viewform','https://user@forms.gle/a','https://docs.google.com/document/d/abc/edit','javascript:alert(1)'])assert.equal(formUrl.safeParse(url).success,false);
 const {db,s,e}=setup();assert.equal(s.save(guild,'a',{form_url:null},e.id).form_url,null);db.close();
});
test('validates timezone, explicit time offset, chronology and unknown fields',()=>{const {db,s,e}=setup();for(const patch of [{timezone:'Invalid/TZ'},{starts_at:'2026-01-01T00:00:00'},{closes_at:config.starts_at},{capacity:-1},{oops:1}])assert.throws(()=>s.save(guild,'a',patch,e.id));db.close();});
test('CSV escapes formulas and quotes; audit contains no complete code',()=>{const {db,s,e}=setup();s.import(e.id,'admin','SUPER-SECRET-CODE');s.claim(e.id,guild,'123','=SUM(1,2)"');const csv=s.export(e.id);assert.match(csv,/"123"/);assert.match(csv,/'=SUM/);assert.match(csv,/SUPER-SECRET-CODE/);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM audit').all()).includes('SUPER-SECRET-CODE'));db.close();});
test('database constraints reject duplicate assignment and rollback on audit failure',()=>{const {db,s,e}=setup();s.import(e.id,'a','A\nB');db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit WHEN NEW.action='claim' BEGIN SELECT RAISE(ABORT,'test'); END;");assert.throws(()=>s.claim(e.id,guild,'u','U'));assert.equal(s.stats(e.id).assigned,0);db.exec('DROP TRIGGER fail_audit');s.claim(e.id,guild,'u','U');assert.throws(()=>db.prepare("UPDATE codes SET status='assigned',user_id='u',assigned_at='now' WHERE code='B'").run());db.close();});
test('restart restores panels, original claims and stock; consistent backup restore',()=>{
 const dir=mkdtempSync(join(tmpdir(),'invite-restart-')),path=join(dir,'bot.sqlite');try{
 let db=openDatabase(path),s=new Events(db),e=s.save(guild,'admin',config);s.import(e.id,'a','A\nB');const c=s.claim(e.id,guild,'u','U');db.prepare('INSERT INTO panels VALUES(?,?,?,?)').run('message',e.id,config.channel_id,1);db.close();
 db=openDatabase(path);s=new Events(db);assert.equal(s.claim(e.id,guild,'u','U').code,c.code);assert.equal(db.prepare('SELECT count(*) n FROM panels').get()!.n,1);
 const backup=join(dir,'backup.sqlite');db.prepare('VACUUM INTO ?').run(backup);db.close();const restored=new DatabaseSync(backup);assert.equal(restored.prepare("SELECT count(*) n FROM codes WHERE status='assigned'").get()!.n,1);assert.equal(restored.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');restored.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('8 independent processes contend for 100 codes and 20 slots without duplicate assignment',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'invite-race-')),path=join(dir,'bot.sqlite');try{
 const db=openDatabase(path),s=new Events(db),e=s.save(guild,'admin',config);s.import(e.id,'a',Array.from({length:100},(_,i)=>`C${i}`).join('\n'));
 await Promise.all(Array.from({length:8},(_,i)=>new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','tests/claim-worker.ts',path,e.id,String(i)],{stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(err)));})));
 assert.equal(s.stats(e.id).assigned,20);assert.equal(db.prepare("SELECT count(DISTINCT code) n FROM codes WHERE status='assigned'").get()!.n,20);assert.equal(db.prepare("SELECT count(DISTINCT user_id) n FROM codes WHERE status='assigned'").get()!.n,20);db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
