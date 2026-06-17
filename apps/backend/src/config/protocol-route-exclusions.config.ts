import { RequestMethod } from '@nestjs/common';

export const PROTOCOL_ROUTE_EXCLUSIONS = [
  { path: '.well-known/oauth-protected-resource', method: RequestMethod.ALL },
  { path: '.well-known/oauth-protected-resource/(.*)', method: RequestMethod.ALL },
  { path: '.well-known/oauth-authorization-server', method: RequestMethod.ALL },
  { path: '.well-known/oauth-authorization-server/(.*)', method: RequestMethod.ALL },
  { path: 'oauth/(.*)', method: RequestMethod.ALL },
  { path: 'mcp', method: RequestMethod.ALL },
  { path: 'mcp/(.*)', method: RequestMethod.ALL },
];
