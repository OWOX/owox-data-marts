import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'cross-spawn';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';

import { Core } from '@owox/connectors';

type ConfigDto = InstanceType<typeof Core.ConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

export const MAX_CAPTURED_LINE_LENGTH = 1024 * 1024;
export const TRUNCATED_OUTPUT_LINE = '[TRUNCATED connector output line: exceeded 1048576 bytes]';

/**
 * What a connector child process may inherit from the backend when the code it
 * runs is user-authored (a manifest). Never spread `...process.env` into such a
 * child — the parent (backend) process env may carry secrets (API keys, DB
 * credentials, etc.) that a project editor's arbitrary manifest/config should
 * never be able to read or exfiltrate.
 *
 * Every name here is platform plumbing that any Node child needs, and every
 * value is a filesystem path or a public trust anchor — never a credential:
 *
 * - PATH, NODE_OPTIONS: how the child is found and how it starts.
 * - NODE_EXTRA_CA_CERTS: extra trust anchors, read by Node at child bootstrap
 *   (so it must be on the child's own env, not just the backend's). A
 *   self-hosted install behind a TLS-inspecting proxy sets it; without it every
 *   custom-connector fetch fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE while
 *   bundled connectors, which still get the full spread, keep working.
 * - SSL_CERT_FILE, SSL_CERT_DIR: the OpenSSL CA store. Load-bearing whenever
 *   the already-inherited NODE_OPTIONS carries --use-openssl-ca, which replaces
 *   Node's bundled roots with OpenSSL's and makes these two the only trust
 *   source.
 * - HOME, USERPROFILE: what os.homedir() reads on POSIX / win32. snowflake-sdk,
 *   which the runner loads eagerly, resolves its config and disk cache under it,
 *   and the OS fallback fails outright for a container UID with no passwd entry.
 * - TMPDIR, TMP, TEMP, SystemRoot: what os.tmpdir() reads. On win32 it falls
 *   back to `${SystemRoot}\temp`, so with TEMP, TMP and SystemRoot all absent it
 *   returns the literal string "undefined\temp".
 *
 * Deliberately absent: proxy variables (a proxy URL routinely embeds
 * `user:password@`, and the engine's own fetch ignores them regardless — undici
 * needs an explicit dispatcher), NODE_TLS_REJECT_UNAUTHORIZED (it disables
 * certificate validation rather than extending trust) and TZ (every date the
 * engine emits is pinned to UTC via Date.UTC, the getUTC accessors and
 * toISOString, so it changes nothing).
 *
 * Shared with ConnectorTestService, which spawns the same runner for the
 * live-test panel and must not drift from this list.
 */
export const INHERITED_CONNECTOR_ENV_VARS = [
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
] as const;

/**
 * On top of the shared base, a *production* manifest run also inherits the
 * SsrfGuard gate. Both names are read by the engine, never by the manifest, and
 * they travel as a pair on purpose: SsrfGuard honors OW_ALLOW_LOCAL_EGRESS only
 * when NODE_ENV !== 'production', so forwarding the flag while dropping
 * NODE_ENV would hand a production child a non-production egress posture.
 */
const MANIFEST_RUN_INHERITED_ENV_VARS = [
  ...INHERITED_CONNECTOR_ENV_VARS,
  'NODE_ENV',
  'OW_ALLOW_LOCAL_EGRESS',
] as const;

/**
 * Copy only the named variables off the parent environment. A name that is
 * unset on the parent stays unset on the child (`spawn` drops undefined values).
 */
export function inheritConnectorEnv(
  names: readonly string[] = INHERITED_CONNECTOR_ENV_VARS
): Record<string, string | undefined> {
  return Object.fromEntries(names.map(name => [name, process.env[name]]));
}

export interface CapturedLineBuffer {
  push: (chunk: string) => void;
  flush: () => void;
}

/**
 * Reassembles a child's stdout/stderr chunks into whole lines, bounded by
 * {@link MAX_CAPTURED_LINE_LENGTH}.
 *
 * The bound is the point: a connector's output is produced by user-authored code
 * calling an API we do not control, so a single response echoed to stdout without a
 * newline can be arbitrarily large. Once the pending line crosses the cap the buffer
 * emits {@link TRUNCATED_OUTPUT_LINE} in its place and discards the rest of that line,
 * so the heap holds at most one capped line per stream no matter what the child writes.
 *
 * Module-level and shared with ConnectorTestService, which spawns the same runner for
 * the live-test panel: two copies of this would be two different caps, and the live-test
 * child is the one that runs many at a time.
 */
export function createCapturedLineBuffer(onLine: (message: string) => void): CapturedLineBuffer {
  let buffer = '';
  let discardingOversizedLine = false;

  const emit = (line: string): void => {
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
  };

  return {
    push: (chunk: string): void => {
      const parts = chunk.split('\n');

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1;

        if (discardingOversizedLine) {
          if (!isLastPart) {
            discardingOversizedLine = false;
            buffer = '';
          }
          return;
        }

        if (buffer.length + part.length > MAX_CAPTURED_LINE_LENGTH) {
          emit(TRUNCATED_OUTPUT_LINE);
          buffer = '';
          discardingOversizedLine = isLastPart;
          return;
        }

        buffer += part;

        if (!isLastPart) {
          emit(buffer);
          buffer = '';
        }
      });
    },
    flush: (): void => {
      if (discardingOversizedLine) {
        discardingOversizedLine = false;
        buffer = '';
        return;
      }

      if (!buffer) {
        return;
      }

      emit(buffer);
      buffer = '';
    },
  };
}

@Injectable()
export class ConnectorProcessSpawnerService {
  private readonly logger = new Logger(ConnectorProcessSpawnerService.name);

  constructor(private readonly gracefulShutdownService: GracefulShutdownService) {}

  spawnConnector(
    datamartId: string,
    runId: string,
    configuration: ConfigDto,
    runConfig: RunConfigDto,
    stdio: {
      logCapture?: { onStdout?: (message: string) => void; onStderr?: (message: string) => void };
      onSpawn?: (pid: number | undefined) => void;
    },
    signal?: AbortSignal,
    manifest?: Record<string, unknown> | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const spawnStdio = 'pipe' as const;
      let logCapture: {
        onStdout?: (message: string) => void;
        onStderr?: (message: string) => void;
      } | null = null;
      let onSpawn: ((pid: number | undefined) => void) | null = null;
      let flushCapturedOutput: (() => void) | null = null;

      if (stdio && typeof stdio === 'object' && stdio.logCapture) {
        logCapture = stdio.logCapture;
      }

      if (stdio && typeof stdio === 'object' && typeof stdio.onSpawn === 'function') {
        onSpawn = stdio.onSpawn;
      }

      const env = this.buildChildEnv(datamartId, runId, configuration, runConfig, manifest);

      this.logger.log(
        `Spawning new process for connector runner execution for datamart ${datamartId} and run ${runId}`,
        { datamartId, runId }
      );

      const runnerPath = require.resolve('@owox/connectors/runner');
      const node = spawn('node', ['--no-deprecation', runnerPath], {
        stdio: spawnStdio,
        env,
        detached: true,
      });

      if (onSpawn) {
        try {
          onSpawn(node.pid);
        } catch (error) {
          this.logger.error(
            `Failed to call onSpawn callback: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (node.stdout && node.stderr) {
        const stdoutBuffer = createCapturedLineBuffer(message => logCapture?.onStdout?.(message));
        const stderrBuffer = createCapturedLineBuffer(message => logCapture?.onStderr?.(message));

        // Decode on the STREAM, not per chunk. A pipe hands over bytes, so a multi-byte
        // UTF-8 character is routinely split across two chunks -- at every 64 KiB boundary
        // of a large write. Decoding each chunk on its own turns that character into U+FFFD
        // in both halves, and these lines are both what the run log shows the user and what
        // the credential-update protocol is parsed out of. setEncoding holds the partial
        // sequence until its remaining bytes arrive.
        node.stdout.setEncoding('utf8');
        node.stderr.setEncoding('utf8');

        node.stdout.on('data', (data: string) => {
          stdoutBuffer.push(data);
        });

        node.stderr.on('data', (data: string) => {
          stderrBuffer.push(data);
        });

        node.stdout.on('end', () => {
          stdoutBuffer.flush();
        });

        node.stderr.on('end', () => {
          stderrBuffer.flush();
        });

        flushCapturedOutput = () => {
          stdoutBuffer.flush();
          stderrBuffer.flush();
        };
      }

      if (signal) {
        const onAbort = () => {
          this.logger.log(`Aborting connector process for datamart ${datamartId}, run ${runId}`, {
            datamartId,
            runId,
            pid: node.pid,
          });
          if (node.pid) {
            try {
              process.kill(-node.pid, 'SIGTERM');
            } catch {
              // Process may have already exited
            }
          }
        };

        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
          node.on('close', () => signal.removeEventListener('abort', onAbort));
        }
      }

      node.on('close', (code, closeSignal) => {
        flushCapturedOutput?.();

        if (code === 0) {
          resolve();
          return;
        }

        if (signal?.aborted) {
          this.logger.log(
            `Connector process aborted: code=${String(code)}, signal=${String(closeSignal)}`,
            { datamartId, runId }
          );
          reject(new Error('Connector process was aborted'));
          return;
        }

        if (this.gracefulShutdownService.isInShutdownMode()) {
          this.logger.log(
            `Connector process terminated during graceful shutdown: code=${String(code)}, signal=${String(closeSignal)}`
          );
          resolve();
          return;
        }

        reject(new Error(`Connector process exited with code ${code}`));
      });

      node.on('error', error => {
        reject(error);
      });
    });
  }

  /**
   * Build the child process environment.
   *
   * A manifest means the connector body is authored by a project editor, so the
   * child gets an allow-list instead of the backend's whole environment — the
   * same reasoning ConnectorTestService applies to the live-test panel. The
   * declarative engine reads no arbitrary variables (only NODE_ENV and
   * OW_ALLOW_LOCAL_EGRESS, both forwarded above); the rest of the allow-list is
   * the platform plumbing Node itself and the storage clients need, so nothing
   * is lost.
   *
   * A bundled connector deliberately keeps the full spread: bundled sources read
   * ambient variables directly — GoogleAds reads OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN,
   * LinkedInAds/LinkedInPages/MicrosoftAds/TikTokAds read their own OAUTH_*
   * client id/secret — and that set is open-ended, so narrowing it here would
   * silently break OAuth for those connectors and for any bundled source added
   * later. Storage adapters are safe either way: all five (BigQuery, Athena,
   * Redshift, Snowflake, Databricks) take every credential, and the AWS region,
   * from OW_CONFIG via context.getParameter — never from the environment. What
   * they do read off the environment is non-secret platform plumbing (HOME and
   * the tmp dir), which the allow-list above carries.
   *
   * `protected` purely as a test seam, mirroring ConnectorTestService.runnerPath():
   * custom-connector-run.e2e-spec.ts subclasses this service to append OW_TEST and
   * OW_ALLOW_LOCAL_EGRESS so a real runner child can be driven against a local mock
   * upstream. Appending to the result of `super.buildChildEnv()` keeps the whole
   * production env contract (allow-list, OW_CONFIG/OW_RUN_CONFIG/OW_MANIFEST
   * serialization) under test instead of reimplemented in the double. Nothing in
   * production overrides it.
   */
  protected buildChildEnv(
    datamartId: string,
    runId: string,
    configuration: ConfigDto,
    runConfig: RunConfigDto,
    manifest?: Record<string, unknown> | null
  ): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {
      ...(manifest ? inheritConnectorEnv(MANIFEST_RUN_INHERITED_ENV_VARS) : { ...process.env }),
      OW_DATAMART_ID: datamartId,
      OW_RUN_ID: runId,
      OW_CONFIG: JSON.stringify(configuration.toObject()),
      OW_RUN_CONFIG: JSON.stringify(runConfig.toObject()),
    };

    if (manifest) {
      env.OW_MANIFEST = JSON.stringify(manifest);
    }

    return env;
  }
}
