import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { Config, RunConfig } = Core;
type Config = InstanceType<typeof Core.Config>;
type RunConfig = InstanceType<typeof Core.RunConfig>;

interface ProcessOptions {
  logCapture?: {
    onStdout?: (message: string) => void;
    onStderr?: (message: string) => void;
  };
  onSpawn?: (pid: number | undefined) => void;
}

/**
 * Service for managing connector process execution
 * Handles spawning, monitoring, and communication with connector processes
 */
@Injectable()
export class ConnectorProcessService {
  private readonly logger = new Logger(ConnectorProcessService.name);

  /**
   * Spawn and run a connector process
   * @param datamartId - ID of the data mart
   * @param runId - ID of the run
   * @param configuration - Connector configuration
   * @param runConfig - Run configuration
   * @param options - Process options for logging and callbacks
   * @returns Promise that resolves when process completes successfully
   */
  async runConnector(
    datamartId: string,
    runId: string,
    configuration: Config,
    runConfig: RunConfig,
    options: ProcessOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = this.spawnConnectorProcess(datamartId, runId, configuration, runConfig);

      this.setupProcessCallbacks(process, options, resolve, reject);
    });
  }

  /**
   * Spawn connector process with environment configuration
   */
  private spawnConnectorProcess(
    datamartId: string,
    runId: string,
    configuration: Config,
    runConfig: RunConfig
  ): ChildProcess {
    const env = this.prepareEnvironment(datamartId, runId, configuration, runConfig);
    const runnerPath = require.resolve('@owox/connectors/runner');

    return spawn('node', [runnerPath], {
      stdio: 'pipe',
      env,
      detached: true,
    });
  }

  /**
   * Prepare environment variables for connector process
   */
  private prepareEnvironment(
    datamartId: string,
    runId: string,
    configuration: Config,
    runConfig: RunConfig
  ): NodeJS.ProcessEnv {
    return {
      ...process.env,
      OW_DATAMART_ID: datamartId,
      OW_RUN_ID: runId,
      OW_CONFIG: JSON.stringify(configuration.toObject()),
      OW_RUN_CONFIG: JSON.stringify(runConfig),
    };
  }

  /**
   * Setup event handlers and callbacks for the process
   */
  private setupProcessCallbacks(
    process: ChildProcess,
    options: ProcessOptions,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    // Call onSpawn callback if provided
    if (options.onSpawn) {
      try {
        options.onSpawn(process.pid);
      } catch (error) {
        this.logger.error(
          `Failed to call onSpawn callback: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Setup log capture if provided
    if (options.logCapture) {
      this.setupLogCapture(process, options.logCapture);
    }

    // Setup process completion handlers
    process.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Connector process exited with code ${code}`));
      }
    });

    process.on('error', error => {
      reject(error);
    });
  }

  /**
   * Setup stdout/stderr log capture
   */
  private setupLogCapture(
    process: ChildProcess,
    logCapture: NonNullable<ProcessOptions['logCapture']>
  ): void {
    if (process.stdout && logCapture.onStdout) {
      process.stdout.on('data', data => {
        const message = data.toString();
        logCapture.onStdout!(message);
      });
    }

    if (process.stderr && logCapture.onStderr) {
      process.stderr.on('data', data => {
        const message = data.toString();
        logCapture.onStderr!(message);
      });
    }
  }
}
