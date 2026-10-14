import { REST,Routes } from 'discord.js';
import { env } from '../config.js';
import { commands } from '../discord/commands.js';
try {
  const rest=new REST({version:'10'}).setToken(env.DISCORD_TOKEN);
  // PUT replaces the full guild command set and removes stale or duplicate commands.
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,env.DISCORD_GUILD_ID),{body:commands});
  console.info('Application commands deployed.');
} catch {console.error('Command deployment failed. Check the token, Application ID, Guild ID, and network.');process.exitCode=1;}
