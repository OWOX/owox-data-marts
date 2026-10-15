import type { Request } from 'express';

export function requestAbortSignal(request: Request): {
  readonly signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  request.res?.once('close', abort);
  request.res?.once('error', abort);
  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort);
      request.res?.off('close', abort);
      request.res?.off('error', abort);
    },
  };
}
