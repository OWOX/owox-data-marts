import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { ActiveRequestInterceptor } from './active-request.interceptor';
import { GracefulShutdownService } from '../scheduler/services/graceful-shutdown.service';

describe('ActiveRequestInterceptor', () => {
  let interceptor: ActiveRequestInterceptor;
  let shutdownService: {
    registerActiveProcess: jest.Mock;
    unregisterActiveProcess: jest.Mock;
  };

  beforeEach(() => {
    shutdownService = {
      registerActiveProcess: jest.fn().mockImplementation((id: string) => id),
      unregisterActiveProcess: jest.fn(),
    };

    interceptor = new ActiveRequestInterceptor(
      shutdownService as unknown as GracefulShutdownService
    );
  });

  function createMockContext(method = 'GET', url = '/test'): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
      }),
    } as unknown as ExecutionContext;
  }

  // Use Observable constructor to avoid rxjs version mismatch between
  // root (7.8.2) and backend (7.8.1) node_modules for CallHandler typing
  function createCallHandler(source: Observable<unknown>): CallHandler {
    return {
      handle: () =>
        new Observable(subscriber => {
          source.subscribe({
            next: v => subscriber.next(v),
            error: e => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
        }),
    } as unknown as CallHandler;
  }

  it('should register active process on intercept', done => {
    const context = createMockContext('POST', '/api/external/looker/get-data');
    const handler = createCallHandler(of('ok'));

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(shutdownService.registerActiveProcess).toHaveBeenCalledTimes(1);
        const processId = shutdownService.registerActiveProcess.mock.calls[0][0] as string;
        expect(processId).toMatch(/^http-POST-\/api\/external\/looker\/get-data-/);
        done();
      },
    });
  });

  it('should unregister active process on successful completion', done => {
    const context = createMockContext();
    const handler = createCallHandler(of('ok'));

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledTimes(1);
        const registeredId = shutdownService.registerActiveProcess.mock.calls[0][0];
        expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledWith(registeredId);
        done();
      },
    });
  });

  it('should unregister active process on error', done => {
    const context = createMockContext();
    const error = new Error('test error');
    const handler = createCallHandler(throwError(() => error));

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledTimes(1);
        const registeredId = shutdownService.registerActiveProcess.mock.calls[0][0];
        expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledWith(registeredId);
        done();
      },
    });
  });

  it('should generate unique process IDs for concurrent requests', () => {
    const context = createMockContext();
    const handler = createCallHandler(of('ok'));

    interceptor.intercept(context, handler).subscribe();
    interceptor.intercept(context, handler).subscribe();

    const ids = shutdownService.registerActiveProcess.mock.calls.map((call: string[]) => call[0]);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
