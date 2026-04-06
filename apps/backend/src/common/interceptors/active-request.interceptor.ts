import { randomUUID } from 'crypto';
import { CallHandler, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GracefulShutdownService } from '../scheduler/services/graceful-shutdown.service';

@Injectable()
export class ActiveRequestInterceptor {
  constructor(private readonly shutdownService: GracefulShutdownService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const processId = `http-${request.method}-${request.url}-${randomUUID()}`;

    this.shutdownService.registerActiveProcess(processId);

    return new Observable(subscriber => {
      next.handle().subscribe({
        next: value => subscriber.next(value),
        error: err => {
          this.shutdownService.unregisterActiveProcess(processId);
          subscriber.error(err);
        },
        complete: () => {
          this.shutdownService.unregisterActiveProcess(processId);
          subscriber.complete();
        },
      });
    });
  }
}
