import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export function applyMigrations(sqlitePath: string, migrationsDir: string): void {
  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  );`)

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => /^0\d+.*\.sql$/.test(f))
    .sort()

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  )

  const hasTable = (name: string) => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    ).get(name)
    return !!row
  }

  const hasColumn = (table: string, column: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    return cols.some((c) => c.name === column)
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied).`)
      continue
    }
    if (file === '0002_seed.sql' && process.env.APPLY_SEED !== '1') {
      console.log(`Skipping ${file} (set APPLY_SEED=1 to apply demo data).`)
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
      continue
    }
    if (file === '0018_passwords_email.sql' && !hasTable('passwords')) {
      console.log(`Skipping ${file} because table passwords does not exist.`)
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
      continue
    }
    if (file === '0009_meta_icon.sql' && hasColumn('_meta', 'icon')) {
      console.log(`Skipping ${file} because _meta.icon already exists.`)
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
      continue
    }
    if (file === '0025_table_archive.sql' && hasColumn('_meta', 'archived_at')) {
      console.log(`Skipping ${file} because _meta.archived_at already exists.`)
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
      continue
    }
    if (file === '0026_folder_archive.sql' && hasColumn('_workspace_nodes', 'archived_at')) {
      console.log(`Skipping ${file} because _workspace_nodes.archived_at already exists.`)
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
      continue
    }

    console.log(`Applying ${file}...`)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    db.exec(sql)
    db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(file)
  }

  db.close()
  console.log('All migrations applied successfully.')
}
