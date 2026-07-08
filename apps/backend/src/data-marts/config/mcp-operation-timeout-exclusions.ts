import { RequestMethod } from '@nestjs/common';

// NestJS still binds the global `{*path}` operation-timeout middleware to the prefix-excluded /mcp
// route, so without this a 30s 408 preempts query_data_mart's own 3-min deadline (and bills a SUCCESS).
export const MCP_OPERATION_TIMEOUT_EXCLUSIONS = [
  { path: 'mcp', method: RequestMethod.ALL },
  { path: 'mcp/{*path}', method: RequestMethod.ALL },
];
