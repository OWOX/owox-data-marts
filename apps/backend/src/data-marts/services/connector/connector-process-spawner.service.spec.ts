import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';

jest.mock('cross-spawn', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'cross-spawn';

describe('ConnectorProcessSpawnerService', () => {
  const createService = () => {
    const gracefulShutdownService = {
      isInShutdownMode: jest.fn().mockReturnValue(false),
    } as unknown as GracefulShutdownService;

    const service = new ConnectorProcessSpawnerService(gracefulShutdownService);

    return { service, gracefulShutdownService };
  };

  const createMockProcess = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const stdout = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[`stdout:${event}`] = listeners[`stdout:${event}`] || [];
        listeners[`stdout:${event}`].push(cb);
      }),
    };
    const stderr = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[`stderr:${event}`] = listeners[`stderr:${event}`] || [];
        listeners[`stderr:${event}`].push(cb);
      }),
    };

    return {
      pid: 12345,
      stdout,
      stderr,
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      emit: (event: string, ...args: unknown[]) => {
        (listeners[event] || []).forEach(cb => cb(...args));
      },
      emitStdout: (data: string) => {
        (listeners['stdout:data'] || []).forEach(cb => cb(Buffer.from(data)));
      },
      emitStderr: (data: string) => {
        (listeners['stderr:data'] || []).forEach(cb => cb(Buffer.from(data)));
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves when process exits with code 0', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const configMock = { toObject: () => ({ name: 'test' }) };
    const runConfigMock = { toObject: () => ({ type: 'INCREMENTAL' }) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {}
    );

    mockProcess.emit('close', 0, null);

    await expect(promise).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      'node',
      expect.any(Array),
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('drains piped output even without logCapture callbacks', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {}
    );

    mockProcess.emitStdout('uncaptured stdout\n');
    mockProcess.emitStderr('uncaptured stderr\n');
    mockProcess.emit('close', 0, null);

    await expect(promise).resolves.toBeUndefined();
    expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('rejects when process exits with non-zero code', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {}
    );

    mockProcess.emit('close', 1, null);

    await expect(promise).rejects.toThrow('Connector process exited with code 1');
  });

  it('resolves gracefully when in shutdown mode', async () => {
    const { service, gracefulShutdownService } = createService();
    (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {}
    );

    mockProcess.emit('close', 137, 'SIGTERM');

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on error event', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {}
    );

    mockProcess.emit('error', new Error('spawn failed'));

    await expect(promise).rejects.toThrow('spawn failed');
  });

  it('calls onSpawn callback with pid', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const onSpawn = jest.fn();
    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {
        logCapture: { onStdout: jest.fn(), onStderr: jest.fn() },
        onSpawn,
      }
    );

    expect(onSpawn).toHaveBeenCalledWith(12345);

    mockProcess.emit('close', 0, null);
    await promise;
  });

  it('captures stdout and stderr via logCapture callbacks', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const onStdout = jest.fn();
    const onStderr = jest.fn();
    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {
        logCapture: { onStdout, onStderr },
      }
    );

    mockProcess.emitStdout('hello stdout\n');
    mockProcess.emitStderr('hello stderr\n');

    expect(onStdout).toHaveBeenCalledWith('hello stdout');
    expect(onStderr).toHaveBeenCalledWith('hello stderr');

    mockProcess.emit('close', 0, null);
    await promise;
  });

  it('buffers stdout chunks until a full line is available', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const onStdout = jest.fn();
    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {
        logCapture: { onStdout },
      }
    );

    mockProcess.emitStdout('{"type":"updateCred');
    expect(onStdout).not.toHaveBeenCalled();

    mockProcess.emitStdout('entials","credentials":{"generated_refresh_token":"secret-token"}}\n');

    expect(onStdout).toHaveBeenCalledWith(
      '{"type":"updateCredentials","credentials":{"generated_refresh_token":"secret-token"}}'
    );

    mockProcess.emit('close', 0, null);
    await promise;
  });

  it('flushes incomplete stdout and stderr lines when process closes', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const onStdout = jest.fn();
    const onStderr = jest.fn();
    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {
        logCapture: { onStdout, onStderr },
      }
    );

    mockProcess.emitStdout('tail stdout');
    mockProcess.emitStderr('tail stderr');
    expect(onStdout).not.toHaveBeenCalled();
    expect(onStderr).not.toHaveBeenCalled();

    mockProcess.emit('close', 0, null);

    await promise;
    expect(onStdout).toHaveBeenCalledWith('tail stdout');
    expect(onStderr).toHaveBeenCalledWith('tail stderr');
  });

  it('redacts oversized stdout and stderr lines instead of forwarding raw content', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

    const onStdout = jest.fn();
    const onStderr = jest.fn();
    const configMock = { toObject: () => ({}) };
    const runConfigMock = { toObject: () => ({}) };
    const oversizedSecretLine = `${'x'.repeat(1024 * 1024)}secret-token`;
    const truncationMarker = '[TRUNCATED connector output line: exceeded 1048576 bytes]';

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as unknown,
      runConfigMock as unknown,
      {
        logCapture: { onStdout, onStderr },
      }
    );

    mockProcess.emitStdout(oversizedSecretLine);
    mockProcess.emitStderr(oversizedSecretLine);
    mockProcess.emit('close', 0, null);

    await promise;
    expect(onStdout).toHaveBeenCalledWith(truncationMarker);
    expect(onStderr).toHaveBeenCalledWith(truncationMarker);
    expect(JSON.stringify(onStdout.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(onStderr.mock.calls)).not.toContain('secret-token');
  });
});
