import type { Logger } from '@owox/internal-helpers';
import { logger as defaultLogger } from '../core/logger.js';
import type { DatabaseAccount, DatabaseOperationResult, DatabaseUser } from '../types/index.js';
import type { DatabaseStore } from './database-store.js';
import { StoreResult } from './store-result.js';

type SqliteRunResult = { changes?: number };
type SqliteStmt = {
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
  run: (...args: unknown[]) => SqliteRunResult;
};
type SqliteDb = {
  prepare: (sql: string) => SqliteStmt;
  pragma?: (p: string) => void;
  close?: () => void;
};

/**
 * SQLite-backed DatabaseStore implementation.
 */
export class SqliteDatabaseStore implements DatabaseStore {
  private db?: SqliteDb;
  private authTableReady = false;
  private readonly logger: Logger;

  constructor(
    private readonly dbPath: string,
    logger?: Logger
  ) {
    this.logger = logger ?? defaultLogger;
  }

  async connect(): Promise<void> {
    if (this.db) return;
    const { default: DatabaseCtor } = await import('better-sqlite3');
    this.db = new (DatabaseCtor as unknown as new (filename: string, opts?: unknown) => SqliteDb)(
      this.dbPath,
      { fileMustExist: false }
    );
    // Ensure sane defaults
    try {
      this.db.pragma?.('journal_mode = WAL');
    } catch {
      // noop
    }
  }

  private getDb(): SqliteDb {
    if (!this.db) throw new Error('SqliteDatabaseStore is not connected');
    return this.db;
  }

  private toIso(val: unknown): string | undefined {
    if (val == null) return undefined;
    if (val instanceof Date) return val.toISOString();
    try {
      const parsed = new Date(String(val));
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      // ignore parse errors
    }
    return String(val);
  }

  private toBoolean(val: unknown): boolean | undefined {
    if (val == null) return undefined;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (val instanceof Date) return true;

    if (val instanceof Uint8Array) {
      return val.length > 0 ? val[0] !== 0 : undefined;
    }

    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (!normalized) return undefined;
      if (['1', 'true', 't', 'yes', 'y'].includes(normalized)) return true;
      if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false;
      if (!Number.isNaN(Date.parse(normalized))) return true;
    }

    return undefined;
  }

  private mapUser(row: Record<string, unknown>): DatabaseUser {
    const lastLoginMethod = row.lastLoginMethod ?? row.last_login_method;
    return {
      id: String(row.id),
      email: String(row.email),
      emailVerified: this.toBoolean(row.emailVerified),
      name: row.name != null ? String(row.name) : undefined,
      image: row.image != null ? String(row.image) : null,
      lastLoginMethod: lastLoginMethod != null ? String(lastLoginMethod) : undefined,
      createdAt: this.toIso(row.createdAt),
    };
  }

  private mapAccount(row: Record<string, unknown>): DatabaseAccount {
    return {
      id: String(row.id),
      accountId: String(row.accountId),
      providerId: String(row.providerId),
      userId: String(row.userId),
      createdAt: this.toIso(row.createdAt),
    };
  }

  private ensureAuthStatesTable(): void {
    if (this.authTableReady) return;
    const db = this.getDb();
    db.prepare(
      `CREATE TABLE IF NOT EXISTS auth_states (
      state TEXT NOT NULL PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      expires_at TEXT NULL
    )`
    ).run();
    try {
      db.prepare(`CREATE INDEX idx_auth_states_expires_at ON auth_states (expires_at)`).run();
    } catch {
      // index already exists
    }
    this.authTableReady = true;
  }

  async shutdown(): Promise<void> {
    try {
      (this.db as { close?: () => void } | undefined)?.close?.();
    } catch (error) {
      this.logger.error('Failed to close SQLite database', {}, error as Error);
    } finally {
      this.db = undefined;
    }
  }

  async getAdapter(): Promise<unknown> {
    await this.connect();
    this.ensureAuthStatesTable();
    return this.getDb();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      this.ensureAuthStatesTable();
      this.getDb().prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
  }

  async cleanupExpiredSessions(): Promise<DatabaseOperationResult> {
    await this.connect();
    const stmt = this.getDb().prepare('DELETE FROM session WHERE expiresAt < datetime("now")');
    const result = stmt.run();
    return { changes: Number(result.changes ?? 0) };
  }

  async getUserById(userId: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT * FROM user WHERE id = ?');
    const row = stmt.get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    await this.connect();
    const stmt = this.getDb().prepare('SELECT * FROM user WHERE lower(email) = lower(?)');
    const row = stmt.get(email) as Record<string, unknown> | undefined;
    return row ? this.mapUser(row) : null;
  }

  async getAccountByUserId(userId: string): Promise<DatabaseAccount | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? ORDER BY createdAt DESC LIMIT 1'
    );
    const row = stmt.get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row) : null;
  }

  async getAccountByUserIdAndProvider(
    userId: string,
    providerId: string
  ): Promise<DatabaseAccount | null> {
    await this.connect();
    const stmt = this.getDb().prepare(
      'SELECT id, accountId, providerId, userId, createdAt FROM account WHERE userId = ? AND providerId = ? ORDER BY createdAt DESC LIMIT 1'
    );
    const row = stmt.get(userId, providerId) as Record<string, unknown> | undefined;
    return row ? this.mapAccount(row) : null;
  }

  async updateUserLastLoginMethod(userId: string, loginMethod: string): Promise<void> {
    await this.connect();
    this.getDb()
      .prepare('UPDATE user SET lastLoginMethod = ? WHERE id = ?')
      .run(loginMethod, userId);
  }

  async saveAuthState(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
    const exp: string | null = expiresAt ? expiresAt.toISOString() : null;
    this.getDb()
      .prepare(
        `INSERT INTO auth_states (state, code_verifier, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(state) DO UPDATE SET
           code_verifier = excluded.code_verifier,
           expires_at = excluded.expires_at,
           created_at = CURRENT_TIMESTAMP`
      )
      .run(state, codeVerifier, exp);
  }

  async getAuthState(state: string): Promise<StoreResult> {
    await this.connect();
    this.ensureAuthStatesTable();
    const row = this.getDb()
      .prepare('SELECT code_verifier, expires_at FROM auth_states WHERE state = ? LIMIT 1')
      .get(state) as { code_verifier?: string; expires_at?: string | null } | undefined;

    if (!row || !row.code_verifier) return StoreResult.notFound();

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (exp && exp.getTime() <= Date.now()) {
      await this.deleteAuthState(state);
      return StoreResult.expired();
    }

    await this.deleteAuthState(state);
    return StoreResult.withCode(row.code_verifier);
  }

  async deleteAuthState(state: string): Promise<void> {
    await this.connect();
    this.ensureAuthStatesTable();
    this.getDb().prepare('DELETE FROM auth_states WHERE state = ?').run(state);
  }

  async purgeExpiredAuthStates(): Promise<number> {
    await this.connect();
    this.ensureAuthStatesTable();
    const res = this.getDb()
      .prepare(
        'DELETE FROM auth_states WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP'
      )
      .run();
    return Number(res.changes ?? 0);
  }

  async findActiveMagicLink(
    email: string
  ): Promise<{ id: string; createdAt?: Date | null; expiresAt?: Date | null } | null> {
    await this.connect();
    const pattern = `%\\"email\\":\\"${email.toLowerCase()}\\"%`;
    const row = this.getDb()
      .prepare(
        `SELECT id, createdAt, expiresAt 
         FROM verification 
         WHERE lower(value) LIKE ? 
         ORDER BY expiresAt DESC 
         LIMIT 1`
      )
      .get(pattern) as
      | { id?: string; createdAt?: string | Date | null; expiresAt?: string | Date | null }
      | undefined;

    if (!row?.id) {
      return null;
    }

    const expiresAt =
      row.expiresAt instanceof Date
        ? row.expiresAt
        : row.expiresAt
          ? new Date(String(row.expiresAt))
          : null;
    const createdAt =
      row.createdAt instanceof Date
        ? row.createdAt
        : row.createdAt
          ? new Date(String(row.createdAt))
          : null;

    return {
      id: String(row.id),
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    };
  }
}
