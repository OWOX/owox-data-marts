jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    RejectApiKeyAuth: noop,
    Role: { editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PreviewDataMartService } from '../use-cases/preview-data-mart.service';
import { DataMartPreviewController } from './data-mart-preview.controller';

describe('DataMartPreviewController', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
  } as AuthorizationContext;

  const setup = () => {
    let signal: AbortSignal | undefined;
    const service = {
      run: jest.fn((_command: unknown, received: AbortSignal) => {
        signal = received;
        return Promise.resolve({ columns: [], rows: [], rowCount: 0, limit: 10, truncated: false });
      }),
    };
    const response = Object.assign(new EventEmitter(), { writableFinished: false });
    const controller = new DataMartPreviewController(service as unknown as PreviewDataMartService);
    const call = () =>
      controller.preview(context, 'dm-1', { limit: 10 } as never, response as unknown as Response);
    return { call, response, signal: () => signal as AbortSignal };
  };

  it('aborts the preview when the client drops the connection before the response finishes', async () => {
    const { call, response, signal } = setup();

    await call();
    response.emit('close');

    expect(signal().aborted).toBe(true);
  });

  it('does not abort once the response has been sent', async () => {
    const { call, response, signal } = setup();

    await call();
    response.writableFinished = true;
    response.emit('close');

    expect(signal().aborted).toBe(false);
  });
});
