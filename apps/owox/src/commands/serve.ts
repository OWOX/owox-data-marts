// eslint-disable-next-line n/no-extraneous-import
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { BootstrapOptions } from '@owox/backend';

import { Flags } from '@oclif/core';
import { IdpProtocolMiddleware } from '@owox/idp-protocol';
import express from 'express';
import { createRequire } from 'node:module';

import { IdpFactory } from '../idp/factory.js';
import { setupWebStaticAssets } from '../web/index.js';
import { BaseCommand } from './base.js';

const require = createRequire(import.meta.url);
const packageInfo = require('../../package.json');

interface ServeFlags {
  'log-format': string;
  port: number;
  'web-enabled': boolean;
}

export default class Serve extends BaseCommand {
  static override description = 'Start the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> serve',
    '<%= config.bin %> serve --port 8080',
    '<%= config.bin %> serve -p 3001 --log-format=json',
    '<%= config.bin %> serve --no-web-enabled',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
    port: Flags.integer({
      char: 'p',
      default: 3000,
      description: 'Port number for the application',
      env: 'PORT',
    }),
    'web-enabled': Flags.boolean({
      allowNo: true,
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

  private setupGracefulShutdown(): void {
    const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of shutdownSignals) {
      process.on(signal, () => this.handleShutdownSignal(signal));
    }
  }

  private async startApplication(flags: ServeFlags): Promise<void> {
    this.log(`📦 Starting server on port ${flags.port} with ${flags['log-format']} logs...`);

    const { bootstrap } = await import('@owox/backend');

    const expressApp = express();

    const idpProvider = await IdpFactory.createFromEnvironment(this);
    await idpProvider.initialize();
    const idpProtocolMiddleware = new IdpProtocolMiddleware(idpProvider);
    idpProtocolMiddleware.register(expressApp);
    expressApp.set('idp', idpProvider);

    // Configure web static assets if web interface is enabled
    if (flags['web-enabled']) {
      const staticAssetsConfigured = setupWebStaticAssets(expressApp);

      if (staticAssetsConfigured) {
        this.log('🌐 Web interface static assets configured');
      } else {
        this.warn('⚠️  Web static assets not found, continuing without web interface');
      }
    } else {
      this.log('🚫 Web interface disabled');
    }

    try {
      this.app = await bootstrap({
        express: expressApp,
        logFormat: flags['log-format'],
        port: flags.port,
        webEnabled: flags['web-enabled'],
      } as BootstrapOptions);

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
