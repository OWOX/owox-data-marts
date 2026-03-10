/**
 * Configuration options for ProjectMembersService
 */
export interface ProjectMembersServiceOptions {
  /**
   * TTL for data in seconds
   * @default 900 (15 minutes)
   */
  ttlSeconds?: number;

  /**
   * Request timeout to OWOX Client in milliseconds
   * @default 5000 (5 seconds)
   */
  owoxClientTimeoutMs?: number;
}
