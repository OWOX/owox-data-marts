import type { AuthorizationStore } from './AuthorizationStore';
import type { SqliteConfig } from '../config';
import type { Database } from 'better-sqlite3';
import { StoreResult } from './StoreResult';

/**
 * SQLite implementation (better-sqlite3, no ORM).
 */
export class SqliteAuthorizationStore implements AuthorizationStore {
  private db?: Database;

  constructor(private readonly config: SqliteConfig) {}

  async initialize(): Promise<void> {
    // Lazy require to avoid typing/runtime coupling during build
    const { default: Database } = await import('better-sqlite3');
    this.db = new Database(this.config.dbPath, { fileMustExist: false });

    if (this.config.pragma && this.config.pragma.length > 0) {
      for (const p of this.config.pragma) {
        this.db.pragma(p);
      }
    } else {
      this.db.pragma('journal_mode = WAL');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_states (
        state TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_auth_states_expires_at ON auth_states(expires_at);`);
  }

  async save(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void> {
    this.getDb();
    const exp = expiresAt ? this.getTime(expiresAt) : null;
    const stmt = this.getDb().prepare(
      `INSERT INTO auth_states (state, code_verifier, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state) DO UPDATE SET
         code_verifier = excluded.code_verifier,
         expires_at   = excluded.expires_at,
         created_at   = strftime('%s','now')`
    );
    stmt.run(state, codeVerifier, exp);
  }

  async get(state: string): Promise<StoreResult> {
    this.getDb();
    const now = this.getTime();

    const row = this.getDb()
      .prepare(`SELECT code_verifier, expires_at FROM auth_states WHERE state = ?`)
      .get(state) as { code_verifier: string; expires_at: number | null } | undefined;

    if (!row) return StoreResult.notFound();

    if (row.expires_at != null && row.expires_at <= now) {
      await this.delete(state);
      return StoreResult.expired();
    }
    return StoreResult.withCode(row.code_verifier);
  }

  async delete(state: string): Promise<void> {
    this.getDb().prepare(`DELETE FROM auth_states WHERE state = ?`).run(state);
  }

  async purgeExpired(): Promise<number> {
    const now = this.getTime();
    const res = this.getDb()
      .prepare(`DELETE FROM auth_states WHERE expires_at IS NOT NULL AND expires_at <= ?`)
      .run(now);
    return typeof res.changes === 'number' ? res.changes : 0;
  }

  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.getDb().prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  private getTime(date?: Date): number {
    const ms = date ? date.getTime() : Date.now();
    return Math.floor(ms / 1000);
  }

  private getDb(): Database {
    if (!this.db) throw new Error('SqliteAuthorizationStore is not initialized');
    return this.db;
  }
}

export default SqliteAuthorizationStore;
