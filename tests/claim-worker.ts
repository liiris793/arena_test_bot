import { openDatabase } from '../src/db/database.js';
import { Events,UserError } from '../src/services/events.js';
import { guild } from './fixtures.js';
const [path,id,worker]=process.argv.slice(2);
const db=openDatabase(path),events=new Events(db);
for(let i=0;i<20;i++) {try {events.claim(id,guild,`user-${worker}-${i}`,'display');events.claim(id,guild,'shared','display');} catch(e){if(!(e instanceof UserError))throw e;}}
db.close();
