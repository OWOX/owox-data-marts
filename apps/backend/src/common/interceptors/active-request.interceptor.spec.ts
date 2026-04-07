import { EventEmitter } from 'events';
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

  function createMockRequest(
    method = 'GET',
    path = '/test'
  ): EventEmitter & { method: string; path: string } {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { method, path });
  }

  function createMockContext(request: ReturnType<typeof createMockRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  // Use Observable constructor to work around rxjs version mismatch between
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

  it('should register active process with request path (not url) on intercept', done => {
    const request = createMockRequest('POST', '/api/external/looker/get-data');
    const context = createMockContext(request);
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
    const request = createMockRequest();
    const context = createMockContext(request);
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
    const request = createMockRequest();
    const context = createMockContext(request);
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

  it('should unregister active process on client disconnect', () => {
    const request = createMockRequest();
    const context = createMockContext(request);
    // Create a handler that never completes (simulates long-running streaming)
    const handler = createCallHandler(new Observable(() => {}));

    interceptor.intercept(context, handler).subscribe();

    expect(shutdownService.registerActiveProcess).toHaveBeenCalledTimes(1);
    expect(shutdownService.unregisterActiveProcess).not.toHaveBeenCalled();

    // Simulate client disconnect
    request.emit('close');

    expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledTimes(1);
  });

  it('should only unregister once even if both close event and complete fire', done => {
    const request = createMockRequest();
    const context = createMockContext(request);
    const handler = createCallHandler(of('ok'));

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        // Observable completed → cleanup called once
        // Now simulate close event firing after completion
        request.emit('close');

        // Should still be called only once due to the cleaned flag
        expect(shutdownService.unregisterActiveProcess).toHaveBeenCalledTimes(1);
        done();
      },
    });
  });

  it('should generate unique process IDs for concurrent requests', () => {
    const request = createMockRequest();
    const context = createMockContext(request);
    const handler = createCallHandler(of('ok'));

    interceptor.intercept(context, handler).subscribe();
    interceptor.intercept(context, handler).subscribe();

    const ids = shutdownService.registerActiveProcess.mock.calls.map((call: string[]) => call[0]);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
