import 'dotenv/config';
import { z } from 'zod';
export const env = z.object({
  DISCORD_TOKEN:z.string().min(1), DISCORD_CLIENT_ID:z.string().regex(/^\d{17,20}$/),
  DISCORD_GUILD_ID:z.string().regex(/^\d{17,20}$/), ADMIN_ROLE_IDS:z.string().default(''),
  DATABASE_PATH:z.string().default('./data/bot.sqlite')
}).parse(process.env);
export const adminRoles=env.ADMIN_ROLE_IDS.split(',').map(s=>s.trim()).filter(Boolean);
