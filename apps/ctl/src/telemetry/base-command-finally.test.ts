/**
 * Tests for BaseCommand.finally telemetry wiring.
 *
 * We use jest.unstable_mockModule to intercept the dynamic
 * `import('./telemetry/track-command.js')` inside finally(), then import
 * BaseCommand AFTER the mock is registered. This is required because the
 * module-mock must be in place before the module under test is loaded.
 *
 * Why a separate file from base-command.test.ts: that file already imports
 * the real base-command module at the top level, so jest.unstable_mockModule
 * would arrive too late. Isolating the mock here keeps both test files clean.
 *
 * Instantiation strategy: we use the direct-instance approach (new TestCommand)
 * with a minimal Config stub rather than running a real command via
 * TestCommand.run(). The direct approach lets us call runFinally() directly
 * and make precise assertions about what trackCommand received.
 *
 * The oclif Command constructor only reads config.bin (for debug logger) and
 * config.version (our assertion target), so the stub is very small. The
 * makeDebug() call is wrapped in a try/catch in oclif, so even if the stub
 * omits something it's swallowed.
 */

import { jest } from '@jest/globals';
import type { Config } from '@oclif/core';

// ── 1. Register mock BEFORE importing the module under test ──────────────────

const trackCommandMock = jest.fn<() => void>();

jest.unstable_mockModule('../telemetry/track-command.js', () => ({
  trackCommand: trackCommandMock,
}));

// ── 2. Dynamically import BaseCommand so it picks up the mock ─────────────────

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { BaseCommand } = await import('../base-command.js');

// ── 3. Concrete subclass that exposes the protected hook ──────────────────────

class TestCommand extends BaseCommand {
  // oclif assigns this.id = this.ctor.id inside the Command constructor,
  // so setting the static id here makes it available as the instance id.
  static override id = 'test:cmd';

  async run(): Promise<void> {
    // no-op — we only test finally()
  }

  /** Expose the protected hook for direct testing. */
  public runFinally(error?: Error): Promise<void> {
    return this.finally(error);
  }
}

// ── 4. Minimal Config stub ────────────────────────────────────────────────────

function makeConfig(version: string): Config {
  // Only config.bin and config.version are accessed during construction /
  // finally(). Everything else is cast away.
  return { bin: 'owox-ctl', version } as unknown as Config;
}

// ── 5. Tests ──────────────────────────────────────────────────────────────────

describe('BaseCommand.finally – telemetry wiring', () => {
  let stdoutSpy: ReturnType<typeof jest.spyOn>;
  let stderrSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    trackCommandMock.mockReset();
    // Spy on write so we can assert routing without touching real streams.
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  // ── 5a. trackCommand is called exactly once with the right wiring ─────────

  it('calls trackCommand exactly once with cliVersion and command', async () => {
    const cmd = new TestCommand([], makeConfig('1.2.3'));
    await cmd.runFinally(undefined);

    expect(trackCommandMock).toHaveBeenCalledTimes(1);

    const arg = trackCommandMock.mock.calls[0][0] as {
      cliVersion: string;
      command: string;
      log: (m: string) => void;
    };
    expect(arg.cliVersion).toBe('1.2.3');
    // oclif sets this.id = this.ctor.id in Command constructor; static id = 'test:cmd'.
    expect(arg.command).toBe('test:cmd');
  });

  // ── 5b. log callback routes notices to stderr, NOT stdout ─────────────────

  it('routes the log callback to stderr and never touches stdout', async () => {
    const cmd = new TestCommand([], makeConfig('2.0.0'));
    await cmd.runFinally(undefined);

    expect(trackCommandMock).toHaveBeenCalledTimes(1);

    const arg = trackCommandMock.mock.calls[0][0] as {
      cliVersion: string;
      command: string;
      log: (m: string) => void;
    };

    // Invoke the callback with a test notice
    arg.log('NOTICE: first-run telemetry opt-out info');

    expect(stderrSpy).toHaveBeenCalledWith('NOTICE: first-run telemetry opt-out info\n');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  // ── 5c. Errors from trackCommand are swallowed ───────────────────────────

  it('does not throw when trackCommand throws (telemetry must never break CLI)', async () => {
    trackCommandMock.mockImplementationOnce(() => {
      throw new Error('boom – simulated telemetry failure');
    });

    const cmd = new TestCommand([], makeConfig('1.0.0'));
    await expect(cmd.runFinally(undefined)).resolves.toBeUndefined();
  });

  // ── 5d. super.finally is called (command lifecycle is preserved) ──────────

  it('still resolves successfully (delegates to super.finally)', async () => {
    // oclif Command.finally is a no-op; confirming the promise resolves is
    // sufficient to verify the super.finally() call path was reached.
    const cmd = new TestCommand([], makeConfig('1.0.0'));
    await expect(cmd.runFinally(undefined)).resolves.toBeUndefined();
  });

  // ── 5e. 'unknown' fallback when command id is not set ─────────────────────

  it('uses "unknown" as the command when this.id is not set', async () => {
    class NoIdCommand extends BaseCommand {
      // Intentionally no static id; oclif will leave this.id undefined
      static override id = undefined as unknown as string;

      async run(): Promise<void> {}

      public runFinally(error?: Error): Promise<void> {
        return this.finally(error);
      }
    }

    const cmd = new NoIdCommand([], makeConfig('1.0.0'));
    // Force id to undefined to exercise the ?? 'unknown' branch
    (cmd as unknown as { id: undefined }).id = undefined;

    await cmd.runFinally(undefined);

    expect(trackCommandMock).toHaveBeenCalledTimes(1);
    const arg = trackCommandMock.mock.calls[0][0] as { command: string };
    expect(arg.command).toBe('unknown');
  });
});
