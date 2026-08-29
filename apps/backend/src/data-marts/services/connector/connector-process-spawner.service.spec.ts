import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import {
  ConnectorProcessSpawnerService,
  INHERITED_CONNECTOR_ENV_VARS,
  inheritConnectorEnv,
} from './connector-process-spawner.service';
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

  /**
   * `data` arrives as a STRING, not a Buffer: the service puts both pipes in utf8 mode, so
   * the stream decodes and the handler never sees bytes. Modelling it as a Buffer here
   * would let a per-chunk decode back into the service unnoticed -- see the chunk-boundary
   * case at the bottom of this file for what that costs.
   */
  const createMockProcess = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const stdout = {
      setEncoding: jest.fn(),
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[`stdout:${event}`] = listeners[`stdout:${event}`] || [];
        listeners[`stdout:${event}`].push(cb);
      }),
    };
    const stderr = {
      setEncoding: jest.fn(),
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
        (listeners['stdout:data'] || []).forEach(cb => cb(data));
      },
      emitStderr: (data: string) => {
        (listeners['stderr:data'] || []).forEach(cb => cb(data));
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

  it('sets OW_MANIFEST env when a manifest is provided', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    let capturedEnv: Record<string, string> = {};
    (spawn as unknown as jest.Mock).mockImplementation((_cmd, _args, opts) => {
      capturedEnv = opts.env;
      return mockProcess;
    });

    const configMock = { toObject: () => ({ name: 'MyCustomApi' }) };
    const runConfigMock = { toObject: () => ({}) };
    const manifest = { version: '1.0', name: 'MyCustomApi', nodes: {} };

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      configMock as never,
      runConfigMock as never,
      {},
      undefined,
      manifest
    );
    mockProcess.emit('close', 0, null);
    await promise;

    expect(capturedEnv.OW_MANIFEST).toBe(JSON.stringify(manifest));
  });

  it('does not set OW_MANIFEST env when no manifest is provided', async () => {
    const { service } = createService();
    const mockProcess = createMockProcess();
    let capturedEnv: Record<string, string> = {};
    (spawn as unknown as jest.Mock).mockImplementation((_cmd, _args, opts) => {
      capturedEnv = opts.env;
      return mockProcess;
    });

    const promise = service.spawnConnector(
      'dm-1',
      'run-1',
      { toObject: () => ({ name: 'GitHub' }) } as never,
      { toObject: () => ({}) } as never,
      {}
    );
    mockProcess.emit('close', 0, null);
    await promise;

    expect(capturedEnv.OW_MANIFEST).toBeUndefined();
  });

  describe('child env', () => {
    const spawnWith = async (manifest?: Record<string, unknown>) => {
      const { service } = createService();
      const mockProcess = createMockProcess();
      let capturedEnv: Record<string, string | undefined> = {};
      (spawn as unknown as jest.Mock).mockImplementation((_cmd, _args, opts) => {
        capturedEnv = opts.env;
        return mockProcess;
      });

      const promise = service.spawnConnector(
        'dm-1',
        'run-1',
        { toObject: () => ({ name: 'X' }) } as never,
        { toObject: () => ({}) } as never,
        {},
        undefined,
        manifest
      );
      mockProcess.emit('close', 0, null);
      await promise;

      return capturedEnv;
    };

    const withEnv = async <T>(
      overrides: Record<string, string>,
      fn: () => Promise<T>
    ): Promise<T> => {
      const previous = Object.entries(overrides).map(
        ([key]) => [key, process.env[key]] as [string, string | undefined]
      );
      Object.assign(process.env, overrides);
      try {
        return await fn();
      } finally {
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    };

    it('never hands a manifest-driven child an arbitrary backend env var', async () => {
      const env = await withEnv(
        {
          SENTINEL_BACKEND_SECRET: 'backend-db-password',
          AWS_SECRET_ACCESS_KEY: 'ambient-aws-secret',
        },
        () => spawnWith({ version: '1.0', name: 'MyCustomApi', nodes: {} })
      );

      // A manifest is user-authored: the backend's own env must never reach it.
      expect(env.SENTINEL_BACKEND_SECRET).toBeUndefined();
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(JSON.stringify(env)).not.toContain('backend-db-password');
      expect(JSON.stringify(env)).not.toContain('ambient-aws-secret');
    });

    it('never lets a credential-shaped var ride along with the platform allow-list', async () => {
      const env = await withEnv(
        {
          OAUTH_CLIENT_SECRET: 'oauth-app-secret',
          // A proxy URL routinely embeds `user:password@`, which is why the
          // allow-list carries no proxy variable even though the storage
          // clients would honor one.
          HTTPS_PROXY: 'http://proxy-user:proxy-password@proxy.corp:3128',
          // Would silently disable certificate validation for user-authored
          // code; NODE_EXTRA_CA_CERTS is the additive, non-weakening answer.
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        },
        () => spawnWith({ version: '1.0', name: 'MyCustomApi', nodes: {} })
      );

      expect(env.OAUTH_CLIENT_SECRET).toBeUndefined();
      expect(env.HTTPS_PROXY).toBeUndefined();
      expect(env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
      expect(JSON.stringify(env)).not.toContain('oauth-app-secret');
      expect(JSON.stringify(env)).not.toContain('proxy-password');
    });

    it('gives a manifest-driven child the platform plumbing any Node child needs', async () => {
      // Every one of these is a filesystem path or a trust anchor — never a
      // credential — and each has a reader inside the child: Node reads
      // NODE_EXTRA_CA_CERTS at bootstrap and SSL_CERT_FILE/SSL_CERT_DIR
      // whenever the (already inherited) NODE_OPTIONS carries --use-openssl-ca;
      // os.homedir()/os.tmpdir() read the rest, and snowflake-sdk calls both.
      const platform = {
        NODE_EXTRA_CA_CERTS: '/etc/ssl/corp-ca.pem',
        SSL_CERT_FILE: '/etc/ssl/certs/ca-bundle.crt',
        SSL_CERT_DIR: '/etc/ssl/certs',
        HOME: '/home/owox',
        USERPROFILE: 'C:\\Users\\owox',
        TMPDIR: '/var/tmp/owox',
        TMP: '/var/tmp/owox',
        TEMP: '/var/tmp/owox',
        SystemRoot: 'C:\\Windows',
      };

      const env = await withEnv(platform, () =>
        spawnWith({ version: '1.0', name: 'MyCustomApi', nodes: {} })
      );

      for (const [name, value] of Object.entries(platform)) {
        expect([name, env[name]]).toEqual([name, value]);
      }
    });

    it('leaves a platform var the parent does not have unset on the child, never empty', async () => {
      const names = ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'USERPROFILE'];
      const previous = names.map(name => [name, process.env[name]] as [string, string | undefined]);
      for (const name of names) delete process.env[name];

      try {
        const env = await spawnWith({ version: '1.0', name: 'MyCustomApi', nodes: {} });

        for (const name of names) {
          // `spawn` omits an undefined value entirely. Coercing to '' instead
          // would hand the child a real (and wrong) value — an empty
          // NODE_EXTRA_CA_CERTS makes Node warn on every start.
          expect([name, env[name]]).toEqual([name, undefined]);
        }
      } finally {
        for (const [name, value] of previous) {
          if (value !== undefined) process.env[name] = value;
        }
      }
    });

    it('still gives a manifest-driven child everything the runner genuinely needs', async () => {
      const env = await withEnv({ OW_ALLOW_LOCAL_EGRESS: '1', NODE_ENV: 'test' }, () =>
        spawnWith({ version: '1.0', name: 'MyCustomApi', nodes: {} })
      );

      expect(env.PATH).toBe(process.env.PATH);
      expect(env.OW_DATAMART_ID).toBe('dm-1');
      expect(env.OW_RUN_ID).toBe('run-1');
      expect(env.OW_CONFIG).toBe(JSON.stringify({ name: 'X' }));
      expect(env.OW_RUN_CONFIG).toBe(JSON.stringify({}));
      expect(env.OW_MANIFEST).toBeDefined();
      // SsrfGuard reads these two and only honors OW_ALLOW_LOCAL_EGRESS when
      // NODE_ENV !== 'production'; forwarding the flag without NODE_ENV would
      // give a production child a non-production egress posture.
      expect(env.OW_ALLOW_LOCAL_EGRESS).toBe('1');
      expect(env.NODE_ENV).toBe('test');
    });

    it('keeps the full parent env for a bundled connector (ambient OAuth app credentials)', async () => {
      // Bundled sources read ambient env directly — e.g. GoogleAds reads
      // OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN, TikTokAds reads OAUTH_TIKTOK_ADS_APP_SECRET.
      // Narrowing this path would break OAuth for those connectors.
      const env = await withEnv({ OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token' }, () =>
        spawnWith()
      );

      expect(env.OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN).toBe('dev-token');
    });
  });

  describe('inheritConnectorEnv', () => {
    it('shares the platform plumbing with the live-test panel but not the egress gate', () => {
      // ConnectorTestService calls inheritConnectorEnv() with no argument, so
      // this base list is exactly what the builder's live-test child gets. It
      // makes the same outbound HTTPS calls as a production run and needs the
      // same trust anchors — but it must never get OW_ALLOW_LOCAL_EGRESS, which
      // would let a live test reach a private host.
      const base = Object.keys(inheritConnectorEnv());

      expect(base).toEqual(
        expect.arrayContaining([
          'PATH',
          'NODE_OPTIONS',
          'NODE_EXTRA_CA_CERTS',
          'SSL_CERT_FILE',
          'SSL_CERT_DIR',
          'HOME',
          'USERPROFILE',
          'TMPDIR',
          'TMP',
          'TEMP',
          'SystemRoot',
        ])
      );
      expect(base).not.toContain('NODE_ENV');
      expect(base).not.toContain('OW_ALLOW_LOCAL_EGRESS');
      expect(INHERITED_CONNECTOR_ENV_VARS).not.toContain('NODE_ENV');
      expect(INHERITED_CONNECTOR_ENV_VARS).not.toContain('OW_ALLOW_LOCAL_EGRESS');
    });

    it('copies only the named variables, by value, off the parent', () => {
      const previous = process.env.SENTINEL_NOT_ALLOWED;
      process.env.SENTINEL_NOT_ALLOWED = 'nope';

      try {
        const copied = inheritConnectorEnv(['PATH']);

        expect(copied).toEqual({ PATH: process.env.PATH });
      } finally {
        if (previous === undefined) delete process.env.SENTINEL_NOT_ALLOWED;
        else process.env.SENTINEL_NOT_ALLOWED = previous;
      }
    });
  });

  /**
   * A pipe hands over bytes, not characters, so a multi-byte UTF-8 sequence is routinely
   * split across two chunks -- at every 64 KiB boundary of a large write, which is the size
   * at which a connector echoes real payload data. Decoding each chunk on its own turns the
   * split character into U+FFFD in both halves, and these lines are what the run log shows
   * the user and what the credential-update protocol is parsed out of.
   *
   * Real streams here rather than the hand-rolled mock above: where a pipe splits is the
   * kernel's decision, so the split has to be written explicitly, and only a real Readable
   * decodes across chunks the way the fix relies on.
   */
  describe('output whose characters straddle a chunk boundary', () => {
    const settle = () => new Promise(resolve => setImmediate(resolve));

    const createStreamingMockProcess = () =>
      Object.assign(new EventEmitter(), {
        pid: 12345,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });

    it('reassembles a character split across two chunks on both streams', async () => {
      const { service } = createService();
      const mockProcess = createStreamingMockProcess();
      (spawn as unknown as jest.Mock).mockReturnValue(mockProcess);

      const onStdout = jest.fn();
      const onStderr = jest.fn();
      const promise = service.spawnConnector(
        'dm-1',
        'run-1',
        { toObject: () => ({}) } as unknown,
        { toObject: () => ({}) } as unknown,
        { logCapture: { onStdout, onStderr } }
      );

      // 0xF0 leads the four bytes of '🚀' (U+1F680); two past it is mid-sequence.
      const stdoutLine = Buffer.from('загрузка 🚀\n', 'utf8');
      const stdoutSplit = stdoutLine.indexOf(0xf0) + 2;
      mockProcess.stdout.write(stdoutLine.subarray(0, stdoutSplit));
      await settle();
      mockProcess.stdout.write(stdoutLine.subarray(stdoutSplit));
      await settle();

      // 0xC3 leads the two bytes of 'é' (U+00E9); one past it is between them.
      const stderrLine = Buffer.from('requête échouée\n', 'utf8');
      const stderrSplit = stderrLine.indexOf(0xc3) + 1;
      mockProcess.stderr.write(stderrLine.subarray(0, stderrSplit));
      await settle();
      mockProcess.stderr.write(stderrLine.subarray(stderrSplit));
      await settle();

      mockProcess.emit('close', 0, null);
      await promise;

      expect(onStdout).toHaveBeenCalledWith('загрузка 🚀');
      expect(onStderr).toHaveBeenCalledWith('requête échouée');
    });
  });
});
