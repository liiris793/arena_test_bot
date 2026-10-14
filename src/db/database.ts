import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, config TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS codes(id INTEGER PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','assigned','disabled')),
      user_id TEXT, display_name TEXT, assigned_at TEXT, role_status TEXT NOT NULL DEFAULT 'none',
      UNIQUE(event_id,code), UNIQUE(event_id,user_id),
      CHECK((status='assigned' AND user_id IS NOT NULL AND assigned_at IS NOT NULL) OR (status!='assigned' AND user_id IS NULL)));
    CREATE INDEX IF NOT EXISTS available_codes ON codes(event_id,status,id);
    CREATE TABLE IF NOT EXISTS panels(message_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), channel_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, event_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS alerts(key TEXT PRIMARY KEY, event_id TEXT NOT NULL, message TEXT NOT NULL, delivered_at TEXT);
    PRAGMA user_version=1;
  `);
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
export function immediate<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
