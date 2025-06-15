import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  private activeProcesses = new Map<string, { id: string; startTime: Date }>();

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
   * Initiates the shutdown process.
   *
   * @returns A promise that resolves when the shutdown is complete
   */
  public async initiateShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return this.shutdownPromise!;
    }

    this.isShuttingDown = true;
    this.logger.log(`Graceful shutdown initiated. Active processes: ${this.activeProcesses.size}`);

    // If there are no active processes, complete immediately
    if (this.activeProcesses.size === 0) {
      this.logger.log('No active processes, completing shutdown immediately');
      this.shutdownPromise = Promise.resolve();
      return this.shutdownPromise;
    }

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
              this.activeProcesses.forEach((process, id) => {
                const durationMs = new Date().getTime() - process.startTime.getTime();
                const durationMinutes = Math.round((durationMs / 60000) * 10) / 10; // Round to 1 decimal place
                this.logger.warn(`Process ${id} has been running for ${durationMinutes}m`);
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
   * Called when the module is being destroyed.
   *
   * This is a NestJS lifecycle hook that will be called during application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    await this.initiateShutdown();
  }
}
