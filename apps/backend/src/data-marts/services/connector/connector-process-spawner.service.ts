import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'cross-spawn';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

type ConfigDto = InstanceType<typeof Core.ConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

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
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let spawnStdio: 'inherit' | 'pipe' | Array<string | number> = 'inherit';
      let logCapture: {
        onStdout?: (message: string) => void;
        onStderr?: (message: string) => void;
      } | null = null;
      let onSpawn: ((pid: number | undefined) => void) | null = null;

      if (stdio && typeof stdio === 'object') {
        if (stdio.logCapture) {
          logCapture = stdio.logCapture;
          spawnStdio = 'pipe';
        }
        if (typeof stdio.onSpawn === 'function') {
          onSpawn = stdio.onSpawn;
        }
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

      if (logCapture && node.stdout && node.stderr) {
        node.stdout.on('data', data => {
          const message = data.toString();
          if (logCapture.onStdout) {
            logCapture.onStdout(message);
          }
        });

        node.stderr.on('data', data => {
          const message = data.toString();
          if (logCapture.onStderr) {
            logCapture.onStderr(message);
          }
        });
      }

      node.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        if (this.gracefulShutdownService.isInShutdownMode()) {
          this.logger.log(
            `Connector process terminated during graceful shutdown: code=${String(code)}, signal=${String(signal)}`
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
}
