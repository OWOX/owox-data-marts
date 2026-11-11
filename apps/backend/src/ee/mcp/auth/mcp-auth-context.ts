import type { McpTokenPayload } from '@owox/idp-protocol';
import type { McpClientIntegration } from '../../../idp/facades/mcp-client.facade';

export type McpAuthContext = McpTokenPayload & {
  /** The AI client that connected; it decides which tools the server lists. */
  integration?: McpClientIntegration;
};
