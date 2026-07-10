import { createClsKey } from '../../../common/logger/cls-context.service';
import { MCP_LOG_CONTEXT } from '../../../common/logger/context-keys';

export interface McpLogContext {
  projectId?: string;
  userId?: string;
  clientId?: string;
  sessionId?: string;
  requestId?: string;
  protocolVersion?: string;
  userAgent?: string;
  clientVendor?: string;
  traceparent?: string;
}

export const MCP_LOG_CONTEXT_KEY = createClsKey<McpLogContext>(MCP_LOG_CONTEXT);

export const MCP_REQUEST_META_KEY = createClsKey<Record<string, unknown>>('McpRequestMeta');
