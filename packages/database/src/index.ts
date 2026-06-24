import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

let _db: ReturnType<typeof drizzle> | null = null
let _client: ReturnType<typeof postgres> | null = null

export function getDb(connectionString: string) {
  if (!_db) {
    _client = postgres(connectionString)
    _db = drizzle(_client, { schema })
  }
  return _db
}

export type Database = ReturnType<typeof getDb>
export { schema }
