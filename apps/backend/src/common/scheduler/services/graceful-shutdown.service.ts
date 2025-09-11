import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Represents a process tracked by the graceful shutdown service.
 *
 * @property id Unique identifier used within the service
 * @property startTime when processing started (used to compute duration)
 * @property pid Optional OS process ID; if absent, signal delivery is skipped
 */
interface ActiveProcess {
  id: string;
  startTime: Date;
  pid?: number;
}

/**
 * Service that manages graceful shutdown for trigger runners.
 *
 * This service tracks the shutdown state and active processes, providing a configurable timeout
 * for graceful shutdown. It allows runners to check if the application is
 * shutting down and reject new trigger processing during shutdown.
 *
 * It also tracks active processes and waits for them to complete during shutdown,
 * only forcing shutdown after the timeout if there are still active processes.
 */
@Injectable()
export class GracefulShutdownService implements OnModuleDestroy {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private shutdownResolve: (() => void) | null = null;

  private activeProcesses = new Map<string, ActiveProcess>();

  private readonly shutdownTimeoutMinutes: number;

  constructor(private readonly configService: ConfigService) {
    this.shutdownTimeoutMinutes = this.configService.get<number>(
      'SCHEDULER_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES',
      15
    );
    this.logger.log(`Graceful shutdown timeout set to ${this.shutdownTimeoutMinutes}m`);
  }

  /**
   * Checks if the application is currently shutting down.
   *
   * @returns True if the application is shutting down, false otherwise
   */
  public isInShutdownMode(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Registers an active process with the shutdown service.
   *
   * @param processId A unique identifier for the process
   * @returns The process ID for later unregistration
   */
  public registerActiveProcess(processId: string): string {
    this.activeProcesses.set(processId, {
      id: processId,
      startTime: new Date(),
    });
    this.logger.debug(
      `Registered active process: ${processId}. Total active: ${this.activeProcesses.size}`
    );
    return processId;
  }

  /**
   * Unregisters an active process from the shutdown service.
   *
   * @param processId The ID of the process to unregister
   */
  public unregisterActiveProcess(processId: string): void {
    if (this.activeProcesses.has(processId)) {
      this.activeProcesses.delete(processId);
      this.logger.debug(
        `Unregistered process: ${processId}. Remaining active: ${this.activeProcesses.size}`
      );

      // If we're shutting down and there are no more active processes, complete the shutdown
      if (this.isShuttingDown && this.activeProcesses.size === 0) {
        this.logger.log('All active processes completed, finalizing shutdown');
        this.completeShutdown();
      }
    }
  }

  /**
   * Sends a signal to a specific process and handles errors appropriately.
   */
  private sendSignalToProcess(activeProcess: ActiveProcess, signal: string): void {
    if (activeProcess.pid != null) {
      try {
        process.kill(-activeProcess.pid, signal);
        this.logger.debug(
          `Sent signal ${signal} to process ${activeProcess.id} (pid: ${activeProcess.pid})`
        );
      } catch (err) {
        if (err?.code === 'ESRCH') {
          this.logger.warn(
            `Process ${activeProcess.id} (pid: ${activeProcess.pid}) not found when sending signal ${signal}`
          );
        } else {
          this.logger.error(
            `Failed to send signal ${signal} to process ${activeProcess.id} (pid: ${activeProcess.pid})`,
            err?.stack || err
          );
        }
      }
    }
  }

  /**
   * Initiates the shutdown process.
   *
   * @returns A promise that resolves when the shutdown is complete
   */
  public async initiateShutdown(signal = 'SIGTERM'): Promise<void> {
    if (this.isShuttingDown) {
      return this.shutdownPromise!;
    }

    this.isShuttingDown = true;
    this.logger.log(
      `Graceful shutdown initiated by signal "${signal}". Active processes: ${this.activeProcesses.size}`
    );

    // If there are no active processes, complete immediately
    if (this.activeProcesses.size === 0) {
      this.logger.log('No active processes, completing shutdown immediately');
      this.shutdownPromise = Promise.resolve();
      return this.shutdownPromise;
    }

    this.activeProcesses.forEach(activeProcess => {
      this.sendSignalToProcess(activeProcess, signal);
    });

    this.shutdownPromise = new Promise<void>(resolve => {
      this.shutdownResolve = resolve;

      // Set a timeout to force shutdown after the configured timeout
      setTimeout(
        () => {
          if (this.isShuttingDown && this.shutdownResolve) {
            const remainingProcesses = this.activeProcesses.size;
            if (remainingProcesses > 0) {
              this.logger.warn(
                `Forcing shutdown after timeout of ${this.shutdownTimeoutMinutes}m. ${remainingProcesses} processes still active.`
              );

              // Log details of remaining processes
              this.activeProcesses.forEach(activeProcess => {
                const durationMs = new Date().getTime() - activeProcess.startTime.getTime();
                const durationMinutes = Math.round((durationMs / 60000) * 10) / 10; // Round to 1 decimal place
                this.logger.warn(
                  `Process ${activeProcess.id} has been running for ${durationMinutes}m`
                );
                this.sendSignalToProcess(activeProcess, 'SIGKILL');
              });
            }
            this.shutdownResolve();
          }
        },
        this.shutdownTimeoutMinutes * 60 * 1000
      );
    });

    return this.shutdownPromise;
  }

  /**
   * Completes the shutdown process.
   *
   * This should be called when all pending operations are complete.
   */
  public completeShutdown(): void {
    if (this.isShuttingDown && this.shutdownResolve) {
      this.logger.log('Graceful shutdown completed');
      this.shutdownResolve();
      this.shutdownResolve = null;
    }
  }

  /**
   * Updates the OS PID for a tracked process.
   *
   * @param processId Unique identifier of the tracked process in `activeProcesses`
   * @param pid OS process ID to associate with the tracked process
   */
  public updateProcessPid(processId: string, pid: number): void {
    const activeProcess = this.activeProcesses.get(processId);
    if (!activeProcess) {
      this.logger.warn(`Process ${processId} not found`);
      return;
    }

    activeProcess.pid = pid;
  }

  /**
   * Called when the module is being destroyed.
   *
   * This is a NestJS lifecycle hook that will be called during application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    await this.initiateShutdown();
  }
}
