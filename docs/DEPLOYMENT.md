# Deployment, backups, and recovery

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f bot
```

The database is stored in the `invite-data` volume. Do not run `docker compose down -v` unless you intend to remove the data. No inbound port is required; the Bot needs outbound Discord access.

## Native process

```bash
npm ci
npm run deploy:commands
npm run build
npm start
```

The process prints safe `starting`, `ready`, and structured failure events. Never print `.env` contents. Use one Bot process and local reliable storage; do not place SQLite on NFS.

## Backups and recovery

Use `/invite-admin backup` for a private in-Discord snapshot, or:

```bash
npm run backup -- backups/bot-backup.sqlite
```

Backups contain invite codes and participant data. Store them encrypted with restricted access. For recovery, stop the Bot, preserve the original database and WAL files, replace the database with a verified backup, remove stale WAL files, run `PRAGMA integrity_check`, and start the Bot. Claims after the backup will not be present.
