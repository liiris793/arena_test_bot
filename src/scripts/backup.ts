import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
process.umask(0o077);
const target=resolve(process.argv[2]??`backups/bot-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true});
const db=new DatabaseSync(process.env.DATABASE_PATH??'./data/bot.sqlite');
try { db.prepare('VACUUM INTO ?').run(target);console.info(`Consistent backup saved: ${target}`); } finally {db.close();}
