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

  /**
   * How long the invitation email waits for the project title and the inviter's email
   * before it is sent without them, in milliseconds
   * @default 3000 (3 seconds)
   */
  invitationLookupTimeoutMs?: number;
}
