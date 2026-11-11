import type { McpScope } from '@owox/idp-protocol';
import type { McpAuthContext } from './mcp-auth-context';

export const MCP_AUTH_PORT = Symbol('MCP_AUTH_PORT');

export interface McpAuthPort {
  verifyToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpAuthContext | null>;
}
