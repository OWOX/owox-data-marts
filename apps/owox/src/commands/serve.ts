// eslint-disable-next-line n/no-extraneous-import
import type { NestExpressApplication } from '@nestjs/platform-express';

import { Flags } from '@oclif/core';
import express from 'express';
import { createRequire } from 'node:module';

import { BaseCommand } from './base.js';

const require = createRequire(import.meta.url);
const packageInfo = require('../../package.json');

interface ServeFlags {
  idpProvider: string;
  logFormat: string;
  port: number;
  webEnabled: boolean;
}

export default class Serve extends BaseCommand {
  static override description = 'Start the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> serve',
    '<%= config.bin %> serve --port 8080',
    '<%= config.bin %> serve -p 3001 --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
    'idp-provider': Flags.string({
      default: 'none',
      description: 'Identity provider to use',
      options: ['better-auth', 'logto', 'none'],
    }),
    port: Flags.integer({
      char: 'p',
      default: 3000,
      description: 'Port number for the application',
      env: 'PORT',
    }),
    'web-enabled': Flags.boolean({
      default: true,
      description: 'Enable web interface',
    }),
  } as const;
  private app?: NestExpressApplication;
  private isShuttingDown = false;

  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);

    this.initializeLogging(flags);
    this.log(`🚀 Starting OWOX Data Marts (v${packageInfo.version})...`);

    this.setupGracefulShutdown();

    try {
      await this.validateBackendAvailability();
      await this.startApplication(flags as unknown as ServeFlags);
    } catch (error) {
      this.handleStartupError(error);
    }
  }

  private async handleShutdownSignal(signal: NodeJS.Signals): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    this.log(`Received ${signal}, shutting down gracefully...`);

    try {
      if (this.app) {
        // Additional protection for graceful shutdown
        // Give a brief moment for any pending operations to complete
        await new Promise(resolve => setTimeout(resolve, 500)); // eslint-disable-line no-promise-executor-return
        await this.app.close();
        this.log('Application stopped successfully.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(`Error during shutdown: ${message}`);
    }

    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
    process.exit(0);
  }

  private handleStartupError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`Failed to start application: ${message}`, { exit: 1 });
  }

  private setupGracefulShutdown(): void {
    const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of shutdownSignals) {
      process.on(signal, () => this.handleShutdownSignal(signal));
    }
  }

  private async startApplication(flags: ServeFlags): Promise<void> {
    this.log(`📦 Starting server on port ${flags.port} with ${flags.logFormat} logs...`);

    try {
      // Import bootstrap function from backend
      const { bootstrap } = await import('@owox/backend');

      // Start application in the same process
      this.app = await bootstrap({
        express: express(),
        idpProvider: flags.idpProvider,
        logFormat: flags.logFormat,
        port: flags.port,
        webEnabled: flags.webEnabled,
      });

      this.log(`📝 Process ID: ${process.pid}`);
      this.log(
        `✅ Server started successfully. Open http://localhost:${flags.port} in your browser.`
      );

      // Keep process alive until shutdown
      await this.waitForShutdown();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start application: ${message}`);
    }
  }

  private async validateBackendAvailability(): Promise<void> {
    try {
      // Try to import the bootstrap function
      await import('@owox/backend');
    } catch {
      this.error(
        '@owox/backend package not found or invalid. Please ensure it is installed and built:\n' +
          'npm run build -w @owox/backend',
        { exit: 1 }
      );
    }
  }

  private async waitForShutdown(): Promise<void> {
    return new Promise<void>(resolve => {
      // This promise will resolve when shutdown is initiated
      const checkShutdown = () => {
        if (this.isShuttingDown) {
          resolve();
        } else {
          setTimeout(checkShutdown, 100);
        }
      };

      checkShutdown();
    });
  }
}
