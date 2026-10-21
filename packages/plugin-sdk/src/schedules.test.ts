import { describe, expect, it, vi } from 'vitest';
import { PluginTransportError } from './iframe-transport.js';
import type { PluginErrorPayload, PluginResponse } from './protocol.js';
import { createPluginScheduleReader, createPluginSchedules } from './schedules.js';

const PATH = '/api/plugins/runtime/schedules';

const SCHEDULE = {
  id: 's1',
  name: 'Morning export',
  action: 'export',
  parameters: { documentId: 'd1' },
  cron: '0 9 * * *',
  timeZone: 'Europe/Kyiv',
  enabled: true,
  disabledReason: null,
  nextRunAt: '2026-10-17T06:00:00.000Z',
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
};

function ok(body: unknown, status = 200): PluginResponse {
  return { id: 'response', ok: true, status, headers: {}, body };
}

function failed(error: PluginErrorPayload): PluginResponse {
  return { id: 'response', ok: false, error };
}

function setup(...responses: PluginResponse[]) {
  const send = vi.fn();
  for (const response of responses) send.mockResolvedValueOnce(response);
  return { send, schedules: createPluginSchedules({ send }) };
}

describe('ctx.schedules', () => {
  it('lists schedules and unwraps the envelope', async () => {
    const { send, schedules } = setup(ok({ schedules: [SCHEDULE] }));

    await expect(schedules.list()).resolves.toEqual([SCHEDULE]);

    expect(send.mock.calls[0]![0]).toEqual({ kind: 'api', method: 'GET', path: PATH });
  });

  it('refuses a list answer without a schedules array', async () => {
    const { schedules } = setup(ok({}));

    const rejection = await schedules.list().catch((caught: unknown) => caught);

    expect(rejection).toBeInstanceOf(PluginTransportError);
    expect((rejection as PluginTransportError).payload.code).toBe('PROTOCOL_ERROR');
  });

  it.each([
    ['get', (s: ReturnType<typeof setup>['schedules']) => s.get('s1')],
    [
      'create',
      (s: ReturnType<typeof setup>['schedules']) =>
        s.create({ action: 'export', cron: '* * * * *', timeZone: 'UTC' }),
    ],
    ['update', (s: ReturnType<typeof setup>['schedules']) => s.update('s1', { name: null })],
    ['pause', (s: ReturnType<typeof setup>['schedules']) => s.pause('s1')],
    ['resume', (s: ReturnType<typeof setup>['schedules']) => s.resume('s1')],
  ])('refuses a %s answer without a schedule id', async (_name, call) => {
    for (const body of [undefined, {}, { id: 1 }, 'text']) {
      const { schedules } = setup(ok(body));

      const rejection = await call(schedules).catch((caught: unknown) => caught);

      expect(rejection).toBeInstanceOf(PluginTransportError);
      expect((rejection as PluginTransportError).payload).toEqual({
        code: 'PROTOCOL_ERROR',
        message: 'The host answered a schedule without an id',
      });
    }
  });

  it('reads one schedule by an encoded id', async () => {
    const { send, schedules } = setup(ok(SCHEDULE));

    await expect(schedules.get('a/b?c')).resolves.toEqual(SCHEDULE);

    expect(send.mock.calls[0]![0]).toEqual({
      kind: 'api',
      method: 'GET',
      path: `${PATH}/a%2Fb%3Fc`,
    });
  });

  it('creates a schedule with a POST of the given fields', async () => {
    const { send, schedules } = setup(ok(SCHEDULE, 201));
    const draft = {
      action: 'export',
      parameters: { documentId: 'd1' },
      cron: '0 9 * * *',
      timeZone: 'Europe/Kyiv',
      enabled: false,
      name: 'Morning export',
    };

    await expect(schedules.create(draft)).resolves.toEqual(SCHEDULE);

    expect(send.mock.calls[0]![0]).toEqual({
      kind: 'api',
      method: 'POST',
      path: PATH,
      body: draft,
    });
  });

  it('updates a schedule with a PATCH of the given fields', async () => {
    const { send, schedules } = setup(ok(SCHEDULE));

    await schedules.update('s 1', { cron: '0 10 * * *', name: null });

    expect(send.mock.calls[0]![0]).toEqual({
      kind: 'api',
      method: 'PATCH',
      path: `${PATH}/s%201`,
      body: { cron: '0 10 * * *', name: null },
    });
  });

  it.each(['pause', 'resume'] as const)('%ss a schedule with a POST and no body', async verb => {
    const { send, schedules } = setup(ok(SCHEDULE));

    await expect(schedules[verb]('s1')).resolves.toEqual(SCHEDULE);

    const request = send.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toEqual({ kind: 'api', method: 'POST', path: `${PATH}/s1/${verb}` });
    expect(request).not.toHaveProperty('body');
  });

  it('deletes a schedule and resolves with nothing on 204', async () => {
    const { send, schedules } = setup(ok(undefined, 204));

    await expect(schedules.delete('s1')).resolves.toBeUndefined();

    expect(send.mock.calls[0]![0]).toEqual({ kind: 'api', method: 'DELETE', path: `${PATH}/s1` });
  });

  it('gives the server only the read half', () => {
    const reader = createPluginScheduleReader({ send: vi.fn() });

    expect(Object.keys(reader).sort()).toEqual(['get', 'list']);
  });

  describe('refusals', () => {
    const calls: [
      string,
      (schedules: ReturnType<typeof setup>['schedules']) => Promise<unknown>,
    ][] = [
      ['list', schedules => schedules.list()],
      ['get', schedules => schedules.get('s1')],
      [
        'create',
        schedules => schedules.create({ action: 'export', cron: '* * * * *', timeZone: 'UTC' }),
      ],
      ['update', schedules => schedules.update('s1', { cron: '* * * * *' })],
      ['pause', schedules => schedules.pause('s1')],
      ['resume', schedules => schedules.resume('s1')],
      ['delete', schedules => schedules.delete('s1')],
    ];

    it.each(calls)('rejects %s with the API code and the failed fields', async (_name, call) => {
      const { schedules } = setup(
        failed({
          code: 'HTTP_ERROR',
          status: 400,
          message: 'Parameters do not match the action schema',
          apiCode: 'INVALID_PARAMETERS',
          details: { errors: [{ instancePath: '/documentId', message: 'must be string' }] },
        })
      );

      await expect(call(schedules)).rejects.toMatchObject({
        name: 'PluginActionError',
        code: 'INVALID_PARAMETERS',
        message: 'Parameters do not match the action schema',
        executionId: undefined,
        errors: [{ instancePath: '/documentId', message: 'must be string' }],
      });
    });

    it.each(calls.filter(([name]) => ['create', 'update'].includes(name)))(
      'names a bare 413 from %s PARAMETERS_TOO_LARGE',
      async (_name, call) => {
        const { schedules } = setup(
          failed({ code: 'HTTP_ERROR', status: 413, message: 'Request failed with 413' })
        );

        await expect(call(schedules)).rejects.toMatchObject({
          name: 'PluginActionError',
          code: 'PARAMETERS_TOO_LARGE',
        });
      }
    );

    // These calls carry no parameters, so a 413 cannot be about them.
    it.each(calls.filter(([name]) => !['create', 'update'].includes(name)))(
      'keeps a bare 413 from %s a PluginTransportError',
      async (_name, call) => {
        const error: PluginErrorPayload = {
          code: 'HTTP_ERROR',
          status: 413,
          message: 'Request failed with 413',
        };
        const { schedules } = setup(failed(error));

        const rejection = await call(schedules).catch((caught: unknown) => caught);

        expect(rejection).toBeInstanceOf(PluginTransportError);
        expect((rejection as PluginTransportError).payload).toEqual(error);
      }
    );

    it.each<PluginErrorPayload>([
      { code: 'HTTP_ERROR', status: 500, message: 'Internal server error' },
      { code: 'SUSPENDED', status: 400, message: 'Plugin suspended', apiCode: 'PLUGIN_SUSPENDED' },
      { code: 'TIMEOUT', message: 'The host did not answer' },
    ])('keeps a $code failure as a PluginTransportError', async error => {
      const { schedules } = setup(failed(error));

      const rejection = await schedules.pause('s1').catch((caught: unknown) => caught);

      expect(rejection).toBeInstanceOf(PluginTransportError);
      expect((rejection as PluginTransportError).payload).toEqual(error);
    });

    it.each([
      ['a string', 'oops'],
      ['null', null],
      ['an array', []],
    ])('refuses %s as the answer to a schedule call', async (_label, body) => {
      const { schedules } = setup(ok(body), ok(body));

      for (const rejection of [
        await schedules.get('s1').catch((caught: unknown) => caught),
        await schedules.list().catch((caught: unknown) => caught),
      ]) {
        expect(rejection).toBeInstanceOf(PluginTransportError);
        expect((rejection as PluginTransportError).payload.code).toBe('PROTOCOL_ERROR');
      }
    });

    it('refuses an answer without a body', async () => {
      const { schedules } = setup({ id: 'response', ok: true, status: 200, headers: {} });

      const rejection = await schedules.get('s1').catch((caught: unknown) => caught);

      expect((rejection as PluginTransportError).payload.code).toBe('PROTOCOL_ERROR');
    });

    it('lets a transport timeout reject as it came', async () => {
      const timeout = new PluginTransportError({
        code: 'TIMEOUT',
        message: 'The host did not answer',
      });
      const send = vi.fn().mockRejectedValue(timeout);

      await expect(createPluginSchedules({ send }).list()).rejects.toBe(timeout);
    });
  });
});
