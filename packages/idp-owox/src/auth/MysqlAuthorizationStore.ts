import type { AuthorizationStore } from './AuthorizationStore';
import type { MysqlConfig } from '../config';
import type { Pool, ResultSetHeader } from 'mysql2/promise';

/**
 * MySQL implementation (mysql2/promise, no ORM).
 */
export class MysqlAuthorizationStore implements AuthorizationStore {
  private pool?: Pool;

  constructor(private readonly config: MysqlConfig) {}

  async initialize(): Promise<void> {
    const mysql = await import('mysql2/promise');

    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port ?? 3306,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: this.config.connectionLimit ?? 10,
      ...(this.config.ssl === undefined ? {} : { ssl: this.config.ssl }),
    });

    await this.getPool().query(`
        CREATE TABLE IF NOT EXISTS auth_states (
            state VARCHAR(255) NOT NULL PRIMARY KEY,
            code_verifier VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NULL
            )
    `);

    try {
      await this.getPool().query(
        `CREATE INDEX idx_auth_states_expires_at ON auth_states (expires_at)`
      );
    } catch {
      // index already exists
    }
  }

  async save(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void> {
    const exp: Date | null = expiresAt ?? null;

    await this.getPool().execute(
      `INSERT INTO auth_states (state, code_verifier, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
          code_verifier = VALUES(code_verifier),
          expires_at    = VALUES(expires_at),
          created_at    = CURRENT_TIMESTAMP`,
      [state, codeVerifier, exp]
    );
  }

  async get(state: string): Promise<string | null> {
    await this.purgeExpired();

    const [rows] = await this.getPool().execute(
      `SELECT code_verifier, expires_at FROM auth_states WHERE state = ? LIMIT 1`,
      [state]
    );

    const row =
      Array.isArray(rows) && rows.length > 0
        ? (rows as Array<{ code_verifier: string; expires_at: Date | null }>)[0]
        : null;
    if (!row) return null;

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (exp && exp.getTime() <= Date.now()) {
      await this.delete(state);
      return null;
    }

    return row.code_verifier;
  }

  async delete(state: string): Promise<void> {
    await this.getPool().execute(`DELETE FROM auth_states WHERE state = ?`, [state]);
  }

  async purgeExpired(): Promise<number> {
    const [result] = await this.getPool().execute<ResultSetHeader>(
      `DELETE FROM auth_states WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
    );
    return result.affectedRows ?? 0;
  }

  async shutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getPool().query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private getPool(): Pool {
    if (!this.pool) throw new Error('MysqlAuthorizationStore is not initialized');
    return this.pool;
  }
}

export default MysqlAuthorizationStore;
