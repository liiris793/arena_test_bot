import { env,adminRoles } from './config.js';
import { openDatabase } from './db/database.js';
import { Events } from './services/events.js';
import { createBot } from './discord/bot.js';
process.umask(0o077);
const db=openDatabase(env.DATABASE_PATH);
const bot=createBot(new Events(db),env.DISCORD_GUILD_ID,adminRoles);
console.info(JSON.stringify({event:'starting',guild_id:env.DISCORD_GUILD_ID,database_path:env.DATABASE_PATH,admin_role_count:adminRoles.length}));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await bot.stop();db.close();process.exit(0);});
try {
  await bot.client.login(env.DISCORD_TOKEN);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (/401|TOKEN_INVALID|invalid token/i.test(`${code} ${message}`)) {
    console.error('Bot login failed: DISCORD_TOKEN is invalid. Copy a fresh token from Developer Portal → Bot; use the raw token without a “Bot ” prefix or quotes.');
  } else if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|network/i.test(`${code} ${message}`)) {
    console.error('Bot login failed: Discord is unreachable. Check your network, proxy, or firewall.');
  } else {
    console.error(`Bot login failed: ${message}`);
    console.error('Check DISCORD_TOKEN, network access, and the Bot status in Discord Developer Portal.');
  }
  db.close();
  process.exit(1);
}
