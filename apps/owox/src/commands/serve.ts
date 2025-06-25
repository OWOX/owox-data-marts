import { Command, Flags } from '@oclif/core';
import { ChildProcess, exec, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

/**
 * Constants for the serve command
 */
const CONSTANTS = {
  CLEANUP_DELAY_MS: 1000,
  DEFAULT_PORT: 3000,
  PROCESS_MARKER: 'owox-app',
  SHUTDOWN_SIGNALS: ['SIGINT', 'SIGTERM'] as const,
} as const;

/**
 * Interface for process spawn options
 */
interface ProcessSpawnOptions {
  args: string[];
  command: string;
  port: number;
}

/**
 * Command to start the OWOX Data Marts application.
 * Requires @owox/backend to be installed.
 */
export default class Serve extends Command {
  static override description = 'Start the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> serve',
    '<%= config.bin %> serve --port 8080',
    '<%= config.bin %> serve -p 3001',
    '$ PORT=8080 <%= config.bin %> serve',
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

    this.log('🚀 Starting OWOX Data Marts...');
    this.setupGracefulShutdown();

    const backendPath = this.getBackendPath();

    if (!this.isBackendAvailable(backendPath)) {
      this.error(
        '@owox/backend package not found. Please ensure it is installed:\n' +
          'npm install @owox/backend',
        { exit: 1 }
      );
    }

    try {
      await this.killMarkedProcesses();
      await this.startBackend(backendPath, flags.port);
    } catch (error) {
      this.handleStartupError(error);
    }
  }

  /**
   * Attaches event handlers to the child process
   */
  private attachProcessEventHandlers(): void {
    if (!this.childProcess) return;

    this.childProcess.on('error', (error: Error) => {
      if (!this.isShuttingDown) {
        this.error(`Application process error: ${error.message}`);
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      if (!this.isShuttingDown) {
        this.handleProcessExit(code, signal);
      }
    });
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
   * Extracts PID from ps command output line
   */
  private extractPidFromProcessLine(processLine: string): null | number {
    const pid = processLine.trim().split(/\s+/)[1];
    const numericPid = Number.parseInt(pid, 10);
    return !Number.isNaN(numericPid) && numericPid > 0 ? numericPid : null;
  }

  /**
   * Gets the path to the backend package
   * @returns The full path to the backend entry point
   */
  private getBackendPath(): string {
    try {
      // Try to resolve using Node.js module resolution
      return require.resolve('@owox/backend');
    } catch {
      // Fallback to node_modules path for ESM compatibility
      return join(this.config.root, 'node_modules', '@owox/backend', 'dist', 'main.js');
    }
  }

  /**
   * Handles child process exit events
   * @param code - Exit code
   * @param signal - Exit signal
   */
  private handleProcessExit(code: null | number, signal: NodeJS.Signals | null): void {
    if (code !== null && code !== 0) {
      this.error(`Application process exited with code ${code}`);
    } else if (signal) {
      this.warn(`Application process terminated by signal ${signal}`);
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
      this.log('Stopping application...');
    }
  }

  /**
   * Handles startup errors
   * @param error - The error that occurred during startup
   */
  private handleStartupError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`Failed to start application: ${message}`, { exit: 1 });
  }

  /**
   * Checks if the backend package is available
   * @param backendPath - Path to the backend entry point
   * @returns True if backend package exists and is accessible
   */
  private isBackendAvailable(backendPath: string): boolean {
    return existsSync(backendPath);
  }

  /**
   * Kills all processes marked with PROCESS_MARKER
   */
  private async killMarkedProcesses(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        `ps -ef | grep "${CONSTANTS.PROCESS_MARKER}" | grep -v grep`
      );

      if (!stdout.trim()) {
        this.log(`🔍 No previous zombie processes found`);
        return;
      }

      const processes = stdout.trim().split('\n');
      this.warn(`🧹 Found ${processes.length} zombie processes, cleaning up...`);

      const killPromises = processes.map(async processLine => {
        const pid = this.extractPidFromProcessLine(processLine);
        if (pid) {
          await this.killProcess(pid);
        }
      });

      await Promise.all(killPromises);
      await this.waitForCleanup();
      this.log(`✅ Zombie cleanup completed`);
    } catch {
      // This is normal if no previous processes are found
      this.log(`🔍 No previous zombie processes found`);
    }
  }

  /**
   * Kills a process by PID
   */
  private async killProcess(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGTERM');
      this.log(`💀 Killed zombie process PID: ${pid}`);
    } catch {
      this.log(`🔍 Process ${pid} already terminated`);
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
   * Spawns a child process with the given options
   * @param options - Process spawn options
   */
  private async spawnProcess(options: ProcessSpawnOptions): Promise<void> {
    const env = this.createProcessEnvironment(options.port);
    this.log(`📦 Starting server on port ${options.port}...`);

    // Add process marker to arguments
    const argsWithMarker = [...options.args, `--${CONSTANTS.PROCESS_MARKER}`];

    this.childProcess = spawn(options.command, argsWithMarker, {
      env,
      stdio: 'inherit',
    });

    if (this.childProcess.pid) {
      this.log(`📦 Server process started with PID: ${this.childProcess.pid}`);
    } else {
      throw new Error('Failed to start server process');
    }

    this.attachProcessEventHandlers();
    return this.waitForProcessCompletion();
  }

  /**
   * Starts the backend application
   * @param backendPath - Path to the backend entry point
   * @param port - Port number to run the application on
   */
  private async startBackend(backendPath: string, port: number): Promise<void> {
    this.log('Starting backend application...');
    const options: ProcessSpawnOptions = {
      args: [backendPath],
      command: 'node',
      port,
    };
    await this.spawnProcess(options);
  }

  /**
   * Waits for processes to cleanup
   */
  private async waitForCleanup(): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(() => resolve(), CONSTANTS.CLEANUP_DELAY_MS);
    });
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

      this.childProcess.on('exit', (code: null | number) => {
        if (this.isShuttingDown) {
          this.log('Application stopped successfully.');
          resolve();
        } else if (code === 0 || code === null) {
          this.log('Application process exited successfully.');
          resolve();
        } else {
          reject(new Error(`Application process failed with exit code ${code}`));
        }
      });
    });
  }
}
