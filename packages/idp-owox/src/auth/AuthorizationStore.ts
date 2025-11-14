/**
 * Storage for mapping state -> code_verifier (PKCE).
 * No ORM usage.
 */
import type { StoreResult } from './StoreResult';

export interface AuthorizationStore {
  /**
   * Initialize connections/resources and create schema if needed.
   */
  initialize(): Promise<void>;

  /**
   * Verify DB connectivity for health probe.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Save mapping state -> code_verifier.
   * Update existing record if it already exists.
   * @param state unique key (state)
   * @param codeVerifier PKCE code_verifier value
   * @param expiresAt optional expiration date (if omitted — stored without TTL)
   */
  save(state: string, codeVerifier: string, expiresAt?: Date | null): Promise<void>;

  /**
   * Get code_verifier by state.
   * Returns StoreResult with either code (reason=null) or reason when code is not available.
   */
  get(state: string): Promise<StoreResult>;

  /**
   * Delete a record by state.
   */
  delete(state: string): Promise<void>;

  /**
   * Remove expired records.
   * @returns number of removed records
   */
  purgeExpired(): Promise<number>;

  /**
   * Graceful shutdown, close connections.
   */
  shutdown(): Promise<void>;
}
