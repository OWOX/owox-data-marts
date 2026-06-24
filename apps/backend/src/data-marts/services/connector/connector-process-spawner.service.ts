import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'cross-spawn';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

type ConfigDto = InstanceType<typeof Core.ConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

const MAX_CAPTURED_LINE_LENGTH = 1024 * 1024;
const TRUNCATED_OUTPUT_LINE = '[TRUNCATED connector output line: exceeded 1048576 bytes]';

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
    signal?: AbortSignal
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

      const env = {
        ...process.env,
        OW_DATAMART_ID: datamartId,
        OW_RUN_ID: runId,
        OW_CONFIG: JSON.stringify(configuration.toObject()),
        OW_RUN_CONFIG: JSON.stringify(runConfig.toObject()),
      };

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
        const stdoutBuffer = this.createLineBuffer(message => logCapture?.onStdout?.(message));
        const stderrBuffer = this.createLineBuffer(message => logCapture?.onStderr?.(message));

        node.stdout.on('data', data => {
          stdoutBuffer.push(data.toString());
        });

        node.stderr.on('data', data => {
          stderrBuffer.push(data.toString());
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

  private createLineBuffer(onLine: (message: string) => void): {
    push: (chunk: string) => void;
    flush: () => void;
  } {
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
}
