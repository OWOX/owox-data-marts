// eslint-disable-next-line n/no-extraneous-import
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { BootstrapOptions, HealthProbeAware } from '@owox/backend';
import type { IdpProvider } from '@owox/idp-protocol';

import { Flags } from '@oclif/core';
import { IdpProtocolMiddleware } from '@owox/idp-protocol';
import express from 'express';

import { IdpFactory } from '../idp/factory.js';
import { getPackageInfo } from '../utils/package-info.js';
import {
  registerHealthRoutes,
  registerPublicFlagsRoute,
  setupWebStaticAssets,
} from '../web/index.js';
import { BaseCommand } from './base.js';

/**
 * Interface defining the flags available for the serve command.
 * @interface ServeFlags
 */
interface ServeFlags {
  /** Log format configuration (e.g., 'json', 'pretty') */
  'log-format': string;
  /** Port number for the application server */
  port: number;
  /** Whether the web interface should be enabled */
  'web-enabled': boolean;
}

/**
 * Command class for starting the OWOX Data Marts application server.
 *
 * This command bootstraps and runs the main OWOX Data Marts application with support for:
 * - Configurable port and logging format
 * - Optional web interface
 * - Identity provider (IDP) integration
 * - Graceful shutdown handling
 * - Static asset serving
 *
 * @augments BaseCommand
 * @example
 * ```bash
 * # Start server with default settings
 * owox serve
 *
 * # Start on custom port with JSON logging
 * owox serve --port 3000 --log-format json
 *
 * # Start without web interface
 * owox serve --no-web-enabled
 * ```
 */
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
      description: 'Port number for the application',
    }),
    'web-enabled': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Enable web interface',
    }),
  } as const;
  /** The NestJS application instance, available after successful bootstrap */
  private app?: NestExpressApplication;
  /** Flag to prevent multiple shutdown attempts */
  private isShuttingDown = false;

  /**
   * Main entry point for the serve command.
   *
   * Parses command flags, loads environment variables, sets up graceful shutdown handlers,
   * and starts the application server. Logs startup information and handles any startup errors.
   *
   * @returns Promise that resolves when the command execution is complete
   * @throws {Error} When application startup fails
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);
    this.loadEnvironment(flags);

    const packageInfo = getPackageInfo();
    this.log(`Starting OWOX Data Marts (v${packageInfo.version})...`);

    this.setupGracefulShutdown();

    try {
      await this.startApplication(flags as unknown as ServeFlags);
    } catch (error) {
      this.handleStartupError(error);
    }
  }

  /**
   * Handles graceful shutdown when receiving termination signals.
   *
   * Prevents multiple shutdown attempts, logs the shutdown process, waits for
   * pending operations to complete, closes the NestJS application, and exits the process.
   *
   * @param signal - The Node.js signal that triggered the shutdown (SIGINT, SIGTERM)
   * @returns Promise that resolves when shutdown is complete
   * @private
   */
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

  /**
   * Sets up listeners for graceful shutdown signals.
   *
   * Registers handlers for SIGINT and SIGTERM signals to ensure the application
   * can shut down gracefully when requested.
   *
   * @private
   */
  private setupGracefulShutdown(): void {
    const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of shutdownSignals) {
      process.on(signal, () => this.handleShutdownSignal(signal));
    }
  }

  /**
   * Starts the OWOX Data Marts application server.
   *
   * This method:
   * 1. Configures Express server with trust proxy
   * 2. Initializes and registers IDP (Identity Provider) middleware
   * 3. Sets up web static assets if web interface is enabled
   * 4. Bootstraps the NestJS application
   * 5. Logs startup information and waits for shutdown
   *
   * @param flags - Configuration flags parsed from command line
   * @returns Promise that resolves when the application starts successfully
   * @throws {Error} When application fails to start
   * @private
   */
  private async startApplication(flags: ServeFlags): Promise<void> {
    const port = process.env.PORT;
    const logFormat = process.env.LOG_FORMAT;

    this.log(`Starting server on port ${port} with ${logFormat} logs...`);

    const { bootstrap, createHealthProbe } = await import('@owox/backend');

    const expressApp = express();
    expressApp.set('trust proxy', 1);

    // Holders for late-bound dependencies used by early health routes
    let currentIdp: IdpProvider | null = null;
    let currentBackendApp: HealthProbeAware | null = null;
    registerHealthRoutes(
      expressApp,
      () => currentIdp,
      () => currentBackendApp,
      () => this.isShuttingDown
    );

    const idpProvider = await IdpFactory.createFromEnvironment(this);
    await idpProvider.initialize();
    const idpProtocolMiddleware = new IdpProtocolMiddleware(idpProvider);
    idpProtocolMiddleware.register(expressApp);
    expressApp.set('idp', idpProvider);
    currentIdp = idpProvider;

    // Register public route to expose whitelisted flags
    registerPublicFlagsRoute(expressApp);

    // Configure web static assets if web interface is enabled
    if (flags['web-enabled']) {
      const staticAssetsConfigured = setupWebStaticAssets(expressApp);

      if (staticAssetsConfigured) {
        this.log('Web interface static assets configured');
      } else {
        this.warn(' Web static assets not found, continuing without web interface');
      }
    } else {
      this.log('Web interface disabled');
    }

    try {
      this.app = await bootstrap({ express: expressApp } as BootstrapOptions);
      currentBackendApp = createHealthProbe(this.app);

      this.log(`Process ID: ${process.pid}`);
      this.log(`Server started successfully. Open http://localhost:${port} in your browser.`);

      // Keep process alive until shutdown
      await this.waitForShutdown();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start application: ${message}`);
    }
  }

  /**
   * Keeps the process alive until shutdown is initiated.
   *
   * Creates a promise that resolves only when the isShuttingDown flag becomes true,
   * effectively preventing the process from exiting until a shutdown signal is received.
   *
   * @returns Promise that resolves when shutdown is initiated
   * @private
   */
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
