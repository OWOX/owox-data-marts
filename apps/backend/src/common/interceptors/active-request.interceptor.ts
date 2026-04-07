import { randomUUID } from 'crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GracefulShutdownService } from '../scheduler/services/graceful-shutdown.service';

/**
 * Tracks active HTTP requests as processes in GracefulShutdownService,
 * ensuring the application waits for in-flight requests to complete
 * before closing database connections during shutdown.
 *
 * Note: Health endpoints (/health/live, /health/ready) are registered
 * as raw Express routes before NestJS bootstrap and bypass this interceptor.
 */
@Injectable()
export class ActiveRequestInterceptor implements NestInterceptor {
  constructor(private readonly shutdownService: GracefulShutdownService) {}

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const request = context.switchToHttp().getRequest();
    const processId = `http-${request.method}-${request.path}-${randomUUID()}`;

    this.shutdownService.registerActiveProcess(processId);

    let cleaned = false;
    const cleanup = () => {
      if (!cleaned) {
        cleaned = true;
        this.shutdownService.unregisterActiveProcess(processId);
      }
    };

    // Safety net: if the client disconnects (browser close, network drop),
    // the Observable may never complete — the 'close' event ensures cleanup.
    request.on('close', cleanup);

    // Wrap next.handle() to intercept completion/error for cleanup.
    // Cast needed due to rxjs version mismatch between root (7.8.2) and
    // backend (7.8.1) node_modules producing incompatible Observable types.
    return new Observable(subscriber => {
      next.handle().subscribe({
        next: value => subscriber.next(value),
        error: err => {
          cleanup();
          subscriber.error(err);
        },
        complete: () => {
          cleanup();
          subscriber.complete();
        },
      });
    }) as unknown as ReturnType<CallHandler['handle']>;
  }
}
