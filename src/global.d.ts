import type { SqliteDatabase } from './db/sqlite'

declare global {
  type D1Database = SqliteDatabase
}

export {}
