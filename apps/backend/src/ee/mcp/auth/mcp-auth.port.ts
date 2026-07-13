import type { McpScope, McpTokenPayload } from '@owox/idp-protocol';

export const MCP_AUTH_PORT = Symbol('MCP_AUTH_PORT');

export interface McpAuthPort {
  verifyToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null>;
}
