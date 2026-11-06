import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { createOperationTimeoutMiddleware } from '../../common/middleware/operation-timeout.middleware';
import { MCP_OPERATION_TIMEOUT_EXCLUSIONS } from './mcp-operation-timeout-exclusions';

/** Routes that get 180 seconds instead of 30. The load balancer and the gateway allow 180. */
const LONG_OPERATION_ROUTES = [
  { path: 'data-marts/:id/definition', method: RequestMethod.PUT },
  { path: 'data-marts/:id/publish', method: RequestMethod.PUT },
  { path: 'data-marts/:id/preview', method: RequestMethod.POST },
  { path: 'data-marts/:id/schema', method: RequestMethod.PUT },
  // A plugin's AI call waits up to 120 seconds for the AI provider (CredentialAiService).
  { path: 'plugins/runtime/credentials/:handle/ai/:operation', method: RequestMethod.POST },
];

export function configureOperationTimeouts(consumer: MiddlewareConsumer): void {
  consumer.apply(createOperationTimeoutMiddleware(180000)).forRoutes(...LONG_OPERATION_ROUTES);
  consumer
    .apply(createOperationTimeoutMiddleware(30000))
    .exclude(
      ...LONG_OPERATION_ROUTES,
      { path: 'external/{*path}', method: RequestMethod.ALL },
      ...MCP_OPERATION_TIMEOUT_EXCLUSIONS,
      // The live connector test manages its own run timeout and always resolves
      // with a result; the global 408 timer would race that response and throw
      // ERR_HTTP_HEADERS_SENT, so it must not apply here.
      { path: 'connectors/custom/test', method: RequestMethod.POST }
    )
    .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
}
