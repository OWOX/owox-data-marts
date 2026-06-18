import type { Request } from 'express';
import type { McpTokenPayload } from '@owox/idp-protocol';

export type McpAuthContext = McpTokenPayload;

export interface McpAuthenticatedRequest extends Request {
  mcpContext: McpAuthContext;
}
