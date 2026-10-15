jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { resolve4: jest.fn(), resolve6: jest.fn() },
}));

import { Logger } from '@nestjs/common';
import dns from 'node:dns/promises';
import { guardedDispatcher } from '../../common/helpers/guarded-dispatcher';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { PluginActionDispatcherService } from './plugin-action-dispatcher.service';
import { PluginActionExecutionService } from './plugin-action-execution.service';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const TOKEN = 'execution-token-value';
const BACKEND_URL = 'https://acme-docs.acme.workers.dev/owox';

const resolve4 = dns.resolve4 as jest.Mock;
const resolve6 = dns.resolve6 as jest.Mock;

function execution(overrides: Partial<PluginActionExecution> = {}): PluginActionExecution {
  return {
    id: 'e1',
    action: 'update-document',
    input: { note: 'INPUT-MARKER' },
    status: PluginActionExecutionStatus.RUNNING,
    startedAt: new Date(NOW),
    deadlineAt: new Date(NOW + 60_000),
    ...overrides,
  } as PluginActionExecution;
}

function setup(options: { status?: PluginActionExecutionStatus; recorded?: boolean } = {}) {
  const executions = {
    finish: jest.fn().mockResolvedValue(options.recorded ?? true),
    findStatus: jest.fn().mockResolvedValue(options.status ?? PluginActionExecutionStatus.RUNNING),
  };
  const shutdown = {
    registerActiveProcess: jest.fn((id: string) => id),
    unregisterActiveProcess: jest.fn(),
  };
  const config = { publicOrigin: 'https://app.owox.com' } as PluginHostConfigService;
  const service = new PluginActionDispatcherService(
    executions as unknown as PluginActionExecutionService,
    shutdown as unknown as GracefulShutdownService,
    config
  );
  return { service, executions, shutdown };
}

const answer = (status: number, body: BodyInit | null, headers: Record<string, string> = {}) =>
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, { status, headers }));

function hang() {
  return jest.spyOn(global, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        );
      })
  );
}

const fakeClock = () => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask'] });

describe('PluginActionDispatcherService', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue([]);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const logged = () => log.mock.calls.map(call => String(call[0])).join('\n');

  it('posts the execution id with the token through the guarded dispatcher and no redirects', async () => {
    const fetchMock = answer(200, JSON.stringify({ result: { count: 3 } }));
    const { service } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(fetchMock).toHaveBeenCalledWith(
      BACKEND_URL,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        dispatcher: guardedDispatcher,
        headers: { 'content-type': 'application/json', 'x-owox-execution-token': TOKEN },
        body: JSON.stringify({ owox: 1, host: 'https://app.owox.com', executionId: 'e1' }),
      })
    );
  });

  it('records the result of a 200 answer', async () => {
    answer(200, JSON.stringify({ result: { count: 3 } }));
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: { count: 3 },
    });
  });

  it("records the plugin's own error code", async () => {
    answer(409, JSON.stringify({ error: { code: 'DOC_LOCKED', message: 'Locked' } }));
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'DOC_LOCKED',
      errorMessage: 'Locked',
    });
  });

  it('records a redirect as an invalid response instead of following it', async () => {
    const fetchMock = answer(302, null, { location: 'https://elsewhere.example.com' });
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_INVALID_RESPONSE',
      errorMessage: 'The backend answered 302',
    });
  });

  it('stops reading a streamed body that grows past the cap', async () => {
    answer(200, 'x'.repeat(1024 * 1024 + 1025));
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        errorCode: 'BACKEND_INVALID_RESPONSE',
        errorMessage: 'The backend answer is larger than allowed',
      })
    );
  });

  it('cancels a body whose declared length is over the cap without reading it', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-length': String(2 * 1024 * 1024) }),
      body: { cancel, getReader: () => fail('the body must not be read') },
    } as unknown as Response);
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(executions.finish).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ errorCode: 'BACKEND_INVALID_RESPONSE' })
    );
  });

  it('refuses a localhost backend without calling it', async () => {
    const fetchMock = answer(200, '{"result":1}');
    const { service, executions } = setup();

    await service.dispatch(execution(), 'https://localhost/owox', TOKEN, 2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_UNREACHABLE',
      errorMessage: 'The backend could not be reached (internal-host)',
    });
  });

  it('refuses a backend whose name resolves to a private address', async () => {
    resolve4.mockResolvedValue(['10.0.0.5']);
    const fetchMock = answer(200, '{"result":1}');
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(executions.finish).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ errorCode: 'BACKEND_UNREACHABLE' })
    );
  });

  it('records a connection failure as unreachable with its cause', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      );
    const { service, executions } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_UNREACHABLE',
      errorMessage: 'The backend could not be reached (ECONNREFUSED)',
    });
  });

  it('aborts the call and records TIMED_OUT at the deadline, naming the declared timeout', async () => {
    fakeClock();
    const fetchMock = hang();
    const { service, executions } = setup();

    const done = service.dispatch(
      execution({ deadlineAt: new Date(NOW + 2000) }),
      BACKEND_URL,
      TOKEN,
      1
    );
    await jest.advanceTimersByTimeAsync(2000);
    await done;

    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(executions.finish).toHaveBeenCalledWith('e1', {
      status: PluginActionExecutionStatus.TIMED_OUT,
      errorMessage: 'The action did not finish within 1 s',
    });
  });

  it('aborts the call within five seconds of a cancel recorded elsewhere, and writes nothing', async () => {
    fakeClock();
    const fetchMock = hang();
    const { service, executions } = setup({ status: PluginActionExecutionStatus.CANCELLED });

    const done = service.dispatch(execution(), BACKEND_URL, TOKEN, 2);
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(executions.findStatus).toHaveBeenCalledWith('e1');
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(executions.finish).not.toHaveBeenCalled();
    expect(logged()).toContain('status=CANCELLED');
  });

  it('keeps waiting while the execution is still RUNNING', async () => {
    fakeClock();
    const fetchMock = hang();
    const { service, executions } = setup();

    const done = service.dispatch(execution(), BACKEND_URL, TOKEN, 2);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(executions.findStatus).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(50_000);
    await done;
    expect(executions.finish).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ status: PluginActionExecutionStatus.TIMED_OUT })
    );
  });

  it('logs the status another writer recorded when its own compare-and-set loses', async () => {
    answer(200, '{"result":1}');
    const { service } = setup({ recorded: false, status: PluginActionExecutionStatus.CANCELLED });

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(logged()).toContain('status=CANCELLED');
  });

  it('logs one line without the input, the result or the token', async () => {
    answer(200, JSON.stringify({ result: { note: 'RESULT-MARKER' } }));
    const { service } = setup();

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    const line = logged();
    expect(log).toHaveBeenCalledTimes(1);
    expect(line).toMatch(
      /^Plugin action finished executionId=e1 action=update-document status=SUCCEEDED errorCode=- durationMs=\d+$/
    );
    expect(line).not.toContain('INPUT-MARKER');
    expect(line).not.toContain('RESULT-MARKER');
    expect(line).not.toContain(TOKEN);
  });

  it('records FAILED when the database refuses to store the result', async () => {
    answer(200, JSON.stringify({ result: { note: 'RESULT-MARKER' } }));
    const { service, executions } = setup();
    executions.finish.mockRejectedValueOnce(new Error('ER_JSON_DOCUMENT_TOO_DEEP'));

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledTimes(2);
    expect(executions.finish).toHaveBeenLastCalledWith('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_INVALID_RESPONSE',
      errorMessage: 'The result could not be stored',
    });
    expect(logged()).toContain('status=FAILED errorCode=BACKEND_INVALID_RESPONSE');
    expect(error).toHaveBeenCalledTimes(1);
    const errorLines = error.mock.calls.flat().map(String).join('\n');
    expect(errorLines).toContain('ER_JSON_DOCUMENT_TOO_DEEP');
    expect(errorLines).not.toContain('RESULT-MARKER');
    expect(errorLines).not.toContain(TOKEN);
  });

  it('does not retry a FAILED outcome the database refused', async () => {
    answer(409, JSON.stringify({ error: { code: 'DOC_LOCKED', message: 'Locked' } }));
    const { service, executions } = setup();
    executions.finish.mockRejectedValue(new Error('database is gone'));

    await service.dispatch(execution(), BACKEND_URL, TOKEN, 2);

    expect(executions.finish).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('never rejects and always unregisters from graceful shutdown, even when recording fails', async () => {
    answer(200, '{"result":1}');
    const { service, executions, shutdown } = setup();
    executions.finish.mockRejectedValue(new Error('database is gone'));

    await expect(service.dispatch(execution(), BACKEND_URL, TOKEN, 2)).resolves.toBeUndefined();

    expect(shutdown.registerActiveProcess).toHaveBeenCalledWith('plugin-action-e1');
    expect(shutdown.unregisterActiveProcess).toHaveBeenCalledWith('plugin-action-e1');
    expect(executions.finish).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1][0])).toBe('Plugin action e1 could not record its outcome');
  });
});
