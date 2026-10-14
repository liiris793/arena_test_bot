# Discord Invite Distribution Bot

An English-first Discord bot for beta invite distribution. It uses TypeScript, discord.js, and SQLite.

## Setup

Requirements: Node.js 22.13+, npm, and a Discord application.

```bash
npm ci
cp .env.example .env
npm run deploy:commands
npm run build
npm start
```

Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ADMIN_ROLE_IDS`, and a persistent `DATABASE_PATH` in `.env`. Never commit `.env`.

The Bot needs View Channel, Send Messages, Embed Links, Attach Files, and Read Message History. Add Manage Roles when using tester roles, and keep the Bot role above the tester role.

## Activity workflow

1. Edit `templates/activity.json` with real channel IDs, URLs, capacity, and UTC timestamps.
2. Use `/invite-admin create` with the JSON attachment.
3. Use `/invite-admin import` with a UTF-8 TXT file containing one code per line.
4. Use `/invite-admin publish`.
5. Users click `Get Invite Code`, `My Invite Code`, or the optional `Submit Feedback` link.

Administrative exports:

```text
/invite-admin export event:<activity-id>
/invite-admin inventory event:<activity-id>
/invite-admin backup
```

`export` contains assigned codes and their Discord users. `inventory` contains every code and its status (`unused`, `assigned`, or `disabled`). `backup` creates a private SQLite snapshot.

Run checks with `npm run typecheck`, `npm test`, and `npm run build`. See [the administrator guide](docs/ADMIN.md), [deployment and recovery](docs/DEPLOYMENT.md), and [test results](docs/TEST_RESULTS.md).
