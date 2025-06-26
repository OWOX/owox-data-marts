import { Command, Flags } from '@oclif/core';
import { exec, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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
} as const;

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

  /**
   * Main execution method for the serve command
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);

    this.log('🚀 Starting OWOX Data Marts...');

    const backendPath = this.validateBackendAvailability();

    try {
      await this.killMarkedProcesses();
      this.startBackend(backendPath, flags.port);
    } catch (error) {
      this.handleStartupError(error);
    }
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
   * Handles startup errors
   * @param error - The error that occurred during startup
   */
  private handleStartupError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`Failed to start application: ${message}`, { exit: 1 });
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
   * Starts the backend application
   * @param backendPath - Path to the backend entry point
   * @param port - Port number to run the application on
   */
  private startBackend(backendPath: string, port: number): void {
    this.log('📦 Starting backend application...');
    this.log(`📦 Starting server on port ${port}...`);

    // Add process marker to arguments for zombie detection
    const argsWithMarker = [backendPath, `--${CONSTANTS.PROCESS_MARKER}`];

    const childProcess = spawn('node', argsWithMarker, {
      env: { ...process.env, PORT: port.toString() },
      stdio: 'inherit',
    });

    if (childProcess.pid) {
      this.log(`📦 Server process started with PID: ${childProcess.pid}`);
    } else {
      throw new Error('Failed to start server process');
    }
  }

  /**
   * Validates that the backend package is available and accessible
   * @returns The resolved path to the backend entry point
   * @throws Error if backend is not available or accessible
   */
  private validateBackendAvailability(): string {
    let backendPath: string;

    try {
      backendPath = require.resolve('@owox/backend');
    } catch {
      this.error(
        '@owox/backend package not found. Please ensure it is installed:\n' +
          'npm install @owox/backend',
        { exit: 1 }
      );
    }

    if (!existsSync(backendPath)) {
      this.error('@owox/backend entry point not found', { exit: 1 });
    }

    return backendPath;
  }

  /**
   * Waits for processes to cleanup
   */
  private async waitForCleanup(): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(() => resolve(), CONSTANTS.CLEANUP_DELAY_MS);
    });
  }
}
