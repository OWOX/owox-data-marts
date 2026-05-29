import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { HTTP_DATA_RUN_ID_HEADER } from './http-data.constants';

@Injectable()
export class HttpDataStreamWriter {
  initHeaders(res: Response, meta: { runId: string }): void {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(HTTP_DATA_RUN_ID_HEADER, meta.runId);
    res.flushHeaders();
  }

  serializeRow(value: Record<string, unknown>): Buffer {
    return Buffer.from(JSON.stringify(value) + '\n', 'utf-8');
  }

  async writeChunk(res: Response, chunk: Buffer, signal?: AbortSignal): Promise<void> {
    if (!res.write(chunk)) {
      await this.waitForDrain(res, signal);
    }
    (res as Response & { flush?: () => void }).flush?.();
  }

  private waitForDrain(res: Response, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        res.off('drain', onDrain);
        res.off('close', onClose);
        res.off('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Response stream closed before backpressure drained'));
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('Response stream error'));
      };
      const onAbort = () => {
        cleanup();
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new Error('Stream aborted while waiting for backpressure')
        );
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      res.once('drain', onDrain);
      res.once('close', onClose);
      res.once('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
