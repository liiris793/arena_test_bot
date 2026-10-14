import { PermissionFlagsBits, type GuildMember } from 'discord.js';
export function canManage(member: Pick<GuildMember,'permissions'|'roles'>, roles: string[]) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || roles.some(id=>member.roles.cache.has(id));
}
