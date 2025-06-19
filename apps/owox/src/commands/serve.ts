import { Command, Flags } from '@oclif/core';
import { ChildProcess, spawn } from 'node:child_process';
import { platform } from 'node:os';

export default class Serve extends Command {
  static override description = 'Start the OWOX Data Marts application (frontend + backend)';
  static override examples = ['<%= config.bin %> serve', '<%= config.bin %> serve --port 8080'];
  static override flags = {
    port: Flags.integer({
      char: 'p',
      default: 3000,
      description: 'Port number for the application',
      env: 'PORT',
    }),
  };
  private childProcess?: ChildProcess;
  private isShuttingDown = false;

  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);

    this.log('🚀 Starting OWOX Data Marts...');

    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();

    try {
      await this.startBackend(flags.port);
    } catch (error) {
      this.error(
        `Failed to start application: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of signals) {
      process.on(signal, () => {
        if (this.isShuttingDown) {
          return;
        }

        this.isShuttingDown = true;
        this.log(`\n📛 Received ${signal}, shutting down gracefully...`);

        if (this.childProcess && !this.childProcess.killed) {
          this.log('🛑 Stopping backend process...');

          // Send signal to child process
          this.childProcess.kill(signal);

          // Wait for graceful shutdown for 10 seconds
          const timeout = setTimeout(() => {
            if (this.childProcess && !this.childProcess.killed) {
              this.log('⚠️  Forcefully terminating backend process...');
              this.childProcess.kill('SIGKILL');
            }
          }, 10_000);

          this.childProcess.on('exit', () => {
            clearTimeout(timeout);
            this.log('✅ Backend stopped successfully');
          });
        }
      });
    }
  }

  private async startBackend(port: number): Promise<void> {
    const isWindows = platform() === 'win32';
    const npmCommand = isWindows ? 'npm.cmd' : 'npm';

    // Prepare environment with PORT
    const env = {
      ...process.env,
      PORT: port.toString(),
    };

    this.log(`📦 Starting backend on port ${port}...`);

    // Start backend via npm run serve
    this.childProcess = spawn(npmCommand, ['run', 'serve', '--prefix', 'apps/backend'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });

    // Handle child process errors
    this.childProcess.on('error', (error: Error) => {
      if (!this.isShuttingDown) {
        this.error(`Backend process error: ${error.message}`);
      }
    });

    // Handle child process exit
    this.childProcess.on('exit', (code: null | number, signal: NodeJS.Signals | null) => {
      if (!this.isShuttingDown) {
        if (code !== null && code !== 0) {
          this.error(`Backend process exited with code ${code}`);
        } else if (signal) {
          this.log(`Backend process terminated by signal ${signal}`);
        } else {
          this.log('Backend process exited successfully');
        }
      }
    });

    // Wait for process to complete
    return new Promise<void>((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error('Failed to start child process'));
        return;
      }

      this.childProcess.on('exit', (code: null | number) => {
        if (this.isShuttingDown) {
          resolve();
        } else if (code !== null && code !== 0) {
          reject(new Error(`Backend process failed with exit code ${code}`));
        }
      });
    });
  }
}
