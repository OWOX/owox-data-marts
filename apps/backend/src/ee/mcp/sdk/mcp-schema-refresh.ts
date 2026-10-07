import { createHash } from 'node:crypto';
import type { McpAuthContext } from '../auth/mcp-auth-context';

export const MCP_SCHEMA_REFRESH_TTL_MS = 5 * 60_000;
export const MCP_SCHEMA_REFRESH_MAX_ENTRIES = 10_000;
// Temporary recovery for clients caching strict schemas. Set false in a later release to disable
// all recovery notifications in one place; the permanent tolerant output schemas stay enabled.
export const MCP_SCHEMA_REFRESH_ENABLED = true;

/** Pod-local cooldown shared by the factory's otherwise per-request SDK server instances. */
export class McpSchemaRefresh {
  private readonly expiresAtByClient = new Map<string, number>();

  async notifyIfDue(
    context: McpAuthContext,
    notify: () => void | Promise<void>,
    broadcast = false
  ): Promise<void> {
    if (!MCP_SCHEMA_REFRESH_ENABLED) {
      this.expiresAtByClient.clear();
      return;
    }
    const now = Date.now();

    // Entries are inserted in expiry order. No per-client timers, and no unbounded stale map.
    for (const [key, expiresAt] of this.expiresAtByClient) {
      if (expiresAt > now) break;
      this.expiresAtByClient.delete(key);
    }

    // Modern notifications fan out to all listeners on this pod: throttle that fan-out as one
    // event rather than broadcasting again for every user. Legacy notifications stay request-local.
    const key = broadcast
      ? 'modern-broadcast'
      : createHash('sha256')
          .update(JSON.stringify([context.clientId, context.userId, context.projectId]))
          .digest('hex');
    if (this.expiresAtByClient.has(key)) return;
    if (this.expiresAtByClient.size >= MCP_SCHEMA_REFRESH_MAX_ENTRIES) {
      this.expiresAtByClient.delete(this.expiresAtByClient.keys().next().value!);
    }

    const expiresAt = now + MCP_SCHEMA_REFRESH_TTL_MS;
    // Reserve before awaiting so simultaneous calls cannot all send a notification.
    this.expiresAtByClient.set(key, expiresAt);
    try {
      await notify();
    } catch (error) {
      if (this.expiresAtByClient.get(key) === expiresAt) this.expiresAtByClient.delete(key);
      throw error;
    }
  }
}
