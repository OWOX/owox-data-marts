import { Command, Flags } from '@oclif/core';
import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

/**
 * Constants for the serve command
 */
const CONSTANTS = {
  DEFAULT_PORT: 3000,
  SHUTDOWN_SIGNALS: ['SIGINT', 'SIGTERM'] as const,
  BUNDLE_PATH: ['dist', 'server', 'index.cjs'],
  WORKSPACE_NAME: '@owox/backend',
  COMMANDS: {
    WINDOWS: 'npm.cmd',
    UNIX: 'npm',
  },
} as const;

/**
 * Interface for process spawn options
 */
interface ProcessSpawnOptions {
  command: string;
  args: string[];
  port: number;
  cwd?: string;
}

/**
 * Command to start the OWOX Data Marts application (frontend + backend).
 * Supports both development mode (via npm) and production mode (from bundle).
 */
export default class Serve extends Command {
  static override description = 'Start the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> serve',
    '<%= config.bin %> serve --port 8080',
    '<%= config.bin %> serve -p 3001',
  ];

  static override flags = {
    port: Flags.integer({
      char: 'p',
      default: CONSTANTS.DEFAULT_PORT,
      description: 'Port number for the application',
      env: 'PORT',
    }),
  };

  private childProcess?: ChildProcess;
  private isShuttingDown = false;

  /**
   * Main execution method for the serve command
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);

    this.log('Starting OWOX Data Marts...');
    this.setupGracefulShutdown();

    const bundlePath = this.getBundlePath();
    const isProduction = this.isProductionMode(bundlePath);

    try {
      if (isProduction) {
        await this.startProductionMode(bundlePath, flags.port);
      } else {
        await this.startDevelopmentMode(flags.port);
      }
    } catch (error) {
      this.handleStartupError(error);
    }
  }

  /**
   * Gets the path to the production bundle
   * @returns The full path to the bundle file
   */
  private getBundlePath(): string {
    return join(this.config.root, ...CONSTANTS.BUNDLE_PATH);
  }

  /**
   * Checks if the application should run in production mode
   * @param bundlePath - Path to the production bundle
   * @returns True if production bundle exists
   */
  private isProductionMode(bundlePath: string): boolean {
    return existsSync(bundlePath);
  }

  /**
   * Starts the application in production mode using the bundle
   * @param bundlePath - Path to the production bundle
   * @param port - Port number to run the application on
   */
  private async startProductionMode(bundlePath: string, port: number): Promise<void> {
    this.log('Starting in production mode (from bundle)...');
    const options: ProcessSpawnOptions = {
      command: 'node',
      args: [bundlePath],
      port,
    };
    await this.spawnProcess(options);
  }

  /**
   * Starts the application in development mode using npm
   * @param port - Port number to run the application on
   */
  private async startDevelopmentMode(port: number): Promise<void> {
    this.log('Starting in development mode (via npm)...');
    const npmCommand = this.getNpmCommand();
    const options: ProcessSpawnOptions = {
      command: npmCommand,
      args: ['run', 'dev', '-w', CONSTANTS.WORKSPACE_NAME],
      port,
      cwd: process.cwd(),
    };
    await this.spawnProcess(options);
  }

  /**
   * Gets the appropriate npm command based on the operating system
   * @returns The npm command ('npm.cmd' for Windows, 'npm' for others)
   */
  private getNpmCommand(): string {
    return platform() === 'win32' ? CONSTANTS.COMMANDS.WINDOWS : CONSTANTS.COMMANDS.UNIX;
  }

  /**
   * Spawns a child process with the given options
   * @param options - Process spawn options
   */
  private async spawnProcess(options: ProcessSpawnOptions): Promise<void> {
    const env = this.createProcessEnvironment(options.port);
    this.log(`Starting server on port ${options.port}...`);

    this.childProcess = spawn(options.command, options.args, {
      env,
      stdio: 'inherit',
      cwd: options.cwd,
    });

    this.attachProcessEventHandlers();
    return this.waitForProcessCompletion();
  }

  /**
   * Creates environment variables for the child process
   * @param port - Port number to set in environment
   * @returns Environment variables object
   */
  private createProcessEnvironment(port: number): NodeJS.ProcessEnv {
    return { ...process.env, PORT: port.toString() };
  }

  /**
   * Attaches event handlers to the child process
   */
  private attachProcessEventHandlers(): void {
    if (!this.childProcess) return;

    this.childProcess.on('error', (error: Error) => {
      if (!this.isShuttingDown) {
        this.error(`Backend process error: ${error.message}`);
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      if (!this.isShuttingDown) {
        this.handleProcessExit(code, signal);
      }
    });
  }

  /**
   * Handles child process exit events
   * @param code - Exit code
   * @param signal - Exit signal
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (code !== null && code !== 0) {
      this.error(`Backend process exited with code ${code}`);
    } else if (signal) {
      this.warn(`Backend process terminated by signal ${signal}`);
    }
  }

  /**
   * Sets up graceful shutdown handlers for system signals
   */
  private setupGracefulShutdown(): void {
    for (const signal of CONSTANTS.SHUTDOWN_SIGNALS) {
      process.on(signal, () => this.handleShutdownSignal(signal));
    }
  }

  /**
   * Handles shutdown signals
   * @param signal - The received shutdown signal
   */
  private handleShutdownSignal(signal: NodeJS.Signals): void {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    this.log(`Received ${signal}, shutting down gracefully...`);

    if (this.childProcess?.kill()) {
      this.log('Stopping backend process...');
    }
  }

  /**
   * Waits for the child process to complete
   * @returns Promise that resolves when process exits successfully
   */
  private waitForProcessCompletion(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error('Failed to start child process'));
        return;
      }

      this.childProcess.on('exit', (code: number | null) => {
        if (this.isShuttingDown) {
          this.log('Backend stopped successfully.');
          resolve();
          return;
        }

        if (code === 0 || code === null) {
          this.log('Backend process exited successfully.');
          resolve();
          return;
        }

        reject(new Error(`Backend process failed with exit code ${code}`));
      });
    });
  }

  /**
   * Handles startup errors
   * @param error - The error that occurred during startup
   */
  private handleStartupError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`Failed to start application: ${message}`, { exit: 1 });
  }
}
