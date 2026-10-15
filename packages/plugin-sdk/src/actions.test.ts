import { describe, expect, it, vi } from 'vitest';
import {
  pluginActionErrorCodePatternSource,
  pluginActionFinalStatuses,
  pluginActionReservedErrorCodePrefix,
  pluginActionReservedErrorCodes,
} from '../../../test/contracts/plugin-action-contract.mjs';
import {
  ERROR_CODE_PATTERN,
  OWOX_ERROR_CODES,
  RESERVED_ERROR_CODE_PREFIX,
} from './action-codes.js';
import { FINAL_STATUSES, createPluginActions } from './actions.js';
import { PluginTransportError } from './iframe-transport.js';
import type { PluginErrorPayload, PluginResponse } from './protocol.js';

const START_PATH = '/api/plugins/runtime/actions/update-document/executions';
const EXECUTION_PATH = '/api/plugins/runtime/executions/e1';
const POLL = { kind: 'api', method: 'GET', path: EXECUTION_PATH, query: [['waitSeconds', '20']] };

function execution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    action: 'update-document',
    status: 'RUNNING',
    trigger: 'frontend',
    startedAt: '2026-10-14T10:00:00.000Z',
    deadlineAt: '2026-10-14T10:01:00.000Z',
    finishedAt: null,
    result: null,
    error: null,
    ...overrides,
  };
}

function ok(body: unknown, status = 200): PluginResponse {
  return { id: 'response', ok: true, status, headers: {}, body };
}

function failed(error: PluginErrorPayload): PluginResponse {
  return { id: 'response', ok: false, error };
}

const STARTED = ok({ id: 'e1', status: 'RUNNING' }, 202);

function setup(...responses: PluginResponse[]) {
  const send = vi.fn();
  for (const response of responses) send.mockResolvedValueOnce(response);
  return { send, actions: createPluginActions({ send }) };
}

describe('ctx.actions', () => {
  it('invokes an action: starts it marked for cancel on close, then long-polls to the result', async () => {
    const { send, actions } = setup(
      STARTED,
      ok(execution()),
      ok(execution({ status: 'SUCCEEDED', result: { count: 3 } }))
    );

    await expect(actions.invoke('update-document', { documentId: 'd1' })).resolves.toEqual({
      count: 3,
    });

    expect(send.mock.calls.map(call => call[0])).toEqual([
      {
        kind: 'api',
        method: 'POST',
        path: START_PATH,
        body: { input: { documentId: 'd1' } },
        cancelOnClose: true,
      },
      POLL,
      POLL,
    ]);
  });

  it('sends a null input when invoke is called without one', async () => {
    const { send, actions } = setup(STARTED, ok(execution({ status: 'SUCCEEDED', result: null })));

    await expect(actions.invoke('update-document')).resolves.toBeNull();

    expect(send.mock.calls[0]![0]).toMatchObject({ body: { input: null } });
  });

  it('rejects a refused start with the API code and no execution id', async () => {
    const { actions } = setup(
      failed({
        code: 'HTTP_ERROR',
        status: 400,
        message: 'Input does not match the action schema',
        apiCode: 'INVALID_INPUT',
        details: { errors: [{ instancePath: '/documentId', message: 'must be string' }] },
      })
    );

    await expect(actions.invoke('update-document', { documentId: 1 })).rejects.toMatchObject({
      name: 'PluginActionError',
      code: 'INVALID_INPUT',
      message: 'Input does not match the action schema',
      executionId: undefined,
      errors: [{ instancePath: '/documentId', message: 'must be string' }],
    });
  });

  it.each([undefined, { pluginId: 'p1' }, { errors: 'not a list' }])(
    'leaves errors undefined for refusal details %j',
    async details => {
      const { actions } = setup(
        failed({ code: 'HTTP_ERROR', status: 404, message: 'Not declared', apiCode: 'X', details })
      );

      const rejection = await actions.start('update-document').catch((caught: unknown) => caught);

      expect(rejection).toMatchObject({ name: 'PluginActionError', code: 'X', errors: undefined });
    }
  );

  it('names a 413 without an API code INPUT_TOO_LARGE', async () => {
    const { actions } = setup(
      failed({ code: 'HTTP_ERROR', status: 413, message: 'Request failed with 413' })
    );

    await expect(actions.start('update-document', 'x')).rejects.toMatchObject({
      name: 'PluginActionError',
      code: 'INPUT_TOO_LARGE',
    });
  });

  it.each<PluginErrorPayload>([
    { code: 'HTTP_ERROR', status: 500, message: 'Internal server error' },
    { code: 'SUSPENDED', status: 400, message: 'Plugin suspended', apiCode: 'PLUGIN_SUSPENDED' },
    { code: 'TIMEOUT', message: 'The host did not answer' },
  ])('keeps a $code start failure as a PluginTransportError', async error => {
    const { actions } = setup(failed(error));

    const rejection = await actions.invoke('update-document').catch((caught: unknown) => caught);

    expect(rejection).toBeInstanceOf(PluginTransportError);
    expect((rejection as PluginTransportError).payload).toEqual(error);
  });

  it('rejects a FAILED execution with its error code and execution id', async () => {
    const { actions } = setup(
      STARTED,
      ok(
        execution({
          status: 'FAILED',
          finishedAt: '2026-10-14T10:00:05.000Z',
          error: { code: 'DOCUMENT_LOCKED', message: 'The document is locked' },
        })
      )
    );

    await expect(actions.invoke('update-document')).rejects.toMatchObject({
      name: 'PluginActionError',
      code: 'DOCUMENT_LOCKED',
      message: 'The document is locked',
      executionId: 'e1',
    });
  });

  it.each(['TIMED_OUT', 'CANCELLED'])(
    'rejects a %s execution with its status as the code',
    async status => {
      const { actions } = setup(STARTED, ok(execution({ status, error: null })));

      await expect(actions.invoke('update-document')).rejects.toMatchObject({
        name: 'PluginActionError',
        code: status,
        message: `The action ended ${status}`,
        executionId: 'e1',
      });
    }
  );

  it('polls again after a poll times out in the host', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(STARTED)
      .mockRejectedValueOnce(
        new PluginTransportError({ code: 'TIMEOUT', message: 'The host did not answer' })
      )
      .mockResolvedValueOnce(ok(execution({ status: 'SUCCEEDED', result: 'done' })));

    await expect(createPluginActions({ send }).invoke('update-document')).resolves.toBe('done');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('cancels without a signal and rejects with the abort reason when the signal aborts', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(STARTED)
      .mockImplementationOnce(
        (_request: unknown, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
          })
      )
      .mockResolvedValueOnce(ok(execution({ status: 'CANCELLED' })));
    const controller = new AbortController();
    const reason = new Error('The member closed the dialog');

    const invoked = createPluginActions({ send }).invoke(
      'update-document',
      {},
      { signal: controller.signal }
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    controller.abort(reason);

    await expect(invoked).rejects.toBe(reason);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls[2]![0]).toEqual({
      kind: 'api',
      method: 'POST',
      path: '/api/plugins/runtime/executions/e1/cancel',
    });
    expect(send.mock.calls[2]![1]).toBeUndefined();
  });

  it('cancels an execution whose start was still pending when the signal aborted', async () => {
    let answerStart: (response: PluginResponse) => void = () => undefined;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise(resolve => (answerStart = resolve)))
      .mockResolvedValueOnce(ok(execution({ status: 'CANCELLED' })));
    const controller = new AbortController();
    const reason = new Error('The member closed the dialog');

    const invoked = createPluginActions({ send }).invoke(
      'update-document',
      {},
      { signal: controller.signal }
    );
    controller.abort(reason);
    answerStart(STARTED);

    await expect(invoked).rejects.toBe(reason);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]![1]).toBeUndefined();
    expect(send.mock.calls[1]![0]).toEqual({
      kind: 'api',
      method: 'POST',
      path: '/api/plugins/runtime/executions/e1/cancel',
    });
    expect(send.mock.calls[1]![1]).toBeUndefined();
  });

  it('sends nothing when the signal is already aborted', async () => {
    const send = vi.fn();
    const reason = new Error('Already closed');

    await expect(
      createPluginActions({ send }).invoke(
        'update-document',
        {},
        { signal: AbortSignal.abort(reason) }
      )
    ).rejects.toBe(reason);
    expect(send).not.toHaveBeenCalled();
  });

  it('starts without the cancel-on-close mark and returns the id at once', async () => {
    const { send, actions } = setup(STARTED);

    await expect(actions.start('update-document', { documentId: 'd1' })).resolves.toEqual({
      id: 'e1',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual({
      kind: 'api',
      method: 'POST',
      path: START_PATH,
      body: { input: { documentId: 'd1' } },
    });
    expect(send.mock.calls[0]![0]).not.toHaveProperty('cancelOnClose');
  });

  it('refuses a start answer that carries no execution id', async () => {
    const { actions } = setup(ok({}, 202));

    await expect(actions.start('update-document')).rejects.toMatchObject({
      name: 'PluginTransportError',
      payload: { code: 'PROTOCOL_ERROR' },
    });
  });

  it('reads once with get, waits with wait, and cancels with cancel', async () => {
    const { send, actions } = setup(
      ok(execution()),
      ok(execution({ status: 'SUCCEEDED', result: 7 })),
      ok(execution({ status: 'CANCELLED' }))
    );

    await expect(actions.get('e1')).resolves.toEqual(execution());
    await expect(actions.wait('e1')).resolves.toBe(7);
    await expect(actions.cancel('e1')).resolves.toMatchObject({ status: 'CANCELLED' });

    expect(send.mock.calls.map(call => call[0])).toEqual([
      { kind: 'api', method: 'GET', path: EXECUTION_PATH, query: [['waitSeconds', '0']] },
      POLL,
      { kind: 'api', method: 'POST', path: `${EXECUTION_PATH}/cancel` },
    ]);
  });

  it('encodes an id into a single path segment', async () => {
    const { send, actions } = setup(ok(execution({ id: 'a/b' })));

    await actions.get('a/b');

    expect(send.mock.calls[0]![0]).toMatchObject({
      path: '/api/plugins/runtime/executions/a%2Fb',
    });
  });
});

// OWOX and the host bridge keep their own copies; each suite compares its copy with the oracle.
describe('the shared action contract', () => {
  it('uses the same error-code pattern', () => {
    expect(ERROR_CODE_PATTERN).toEqual(new RegExp(pluginActionErrorCodePatternSource));
  });

  it('reserves the same error codes', () => {
    expect([...OWOX_ERROR_CODES].sort()).toEqual([...pluginActionReservedErrorCodes].sort());
  });

  it('reserves the same error-code prefix', () => {
    expect(RESERVED_ERROR_CODE_PREFIX).toBe(pluginActionReservedErrorCodePrefix);
  });

  it('treats the same statuses as final', () => {
    expect([...FINAL_STATUSES].sort()).toEqual([...pluginActionFinalStatuses].sort());
  });
});
