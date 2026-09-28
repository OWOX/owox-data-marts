import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GracefulShutdownService, McpHttpEntryService } from '@owox/backend';

interface ApplicationShutdownServices {
  gracefulShutdownService: Pick<GracefulShutdownService, 'initiateShutdown'>;
  mcpHttpEntryService: Pick<McpHttpEntryService, 'closeTransport'>;
}

/**
 * Stops new HTTP connections, drains tracked work, then closes MCP subscription streams before
 * waiting for the HTTP server to finish. The ordering matters: closing the MCP transport before
 * the drain would abort ordinary tool calls, while waiting for the HTTP server before closing it
 * deadlocks on a long-lived `subscriptions/listen` response.
 */
export async function shutdownApplication(
  app: Pick<NestExpressApplication, 'close' | 'getHttpServer'>,
  signal: NodeJS.Signals,
  services: ApplicationShutdownServices,
  log: (message: string) => void
): Promise<void> {
  const httpServer = app.getHttpServer();
  httpServer.closeIdleConnections();
  const serverClosePromise = new Promise<void>((resolve, reject) => {
    httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
  });
  log('HTTP server stopped accepting new connections');

  const drainThenCloseMcpPromise = (async () => {
    await services.gracefulShutdownService.initiateShutdown(signal);
    await services.mcpHttpEntryService.closeTransport();
  })();

  await Promise.all([serverClosePromise, drainThenCloseMcpPromise]);
  log('All active processes completed');

  await app.close();
  log('Application stopped successfully.');
}
