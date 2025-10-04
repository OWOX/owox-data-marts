import { Injectable, Logger, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerHandler } from '../../shared/trigger-handler.interface';
import { SystemTimeService } from '../system-time.service';
import { TriggerRunnerService } from './trigger-runner.interface';
import { DirectTriggerRunnerService } from './direct-trigger-runner.service';
import { PubsubTriggerRunnerService } from './pubsub-trigger-runner.service';
import { GracefulShutdownService } from '../graceful-shutdown.service';

/**
 * Enum representing the available trigger runner types.
 * This provides type safety when referring to runner types.
 */
export enum TriggerRunnerType {
  DIRECT = 'direct',
  PUBSUB = 'pubsub',
}

/**
 * Factory for creating trigger runners based on configuration.
 * This factory makes it easy to add new runner types in the future.
 */
@Injectable()
export class TriggerRunnerFactory {
  private readonly logger = new Logger(TriggerRunnerFactory.name);
  private readonly runnerTypes = new Map<
    TriggerRunnerType,
    {
      type: Type<TriggerRunnerService<TimeBasedTrigger>>;
      configFactory: (configService: ConfigService) => Record<string, unknown>;
    }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly shutdownService: GracefulShutdownService
  ) {
    this.registerDefaultRunnerTypes();
  }

  /**
   * Registers the default runner types (direct and pubsub).
   */
  private registerDefaultRunnerTypes(): void {
    // Register direct runner
    this.registerRunnerType(TriggerRunnerType.DIRECT, {
      type: DirectTriggerRunnerService,
      configFactory: () => ({}),
    });

    // Register pubsub runner
    this.registerRunnerType(TriggerRunnerType.PUBSUB, {
      type: PubsubTriggerRunnerService,
      configFactory: (configService: ConfigService) => ({
        projectId: configService.get<string>('SCHEDULER_PUBSUB_PROJECT_ID'),
      }),
    });
  }

  /**
   * Registers a new runner type with the factory.
   *
   * @param type The type of runner (from TriggerRunnerType enum)
   * @param options Configuration for the runner type
   */
  registerRunnerType(
    type: TriggerRunnerType,
    options: {
      type: Type<TriggerRunnerService<TimeBasedTrigger>>;
      configFactory: (configService: ConfigService) => Record<string, unknown>;
    }
  ): void {
    this.runnerTypes.set(type, options);
    this.logger.log(`Registered runner type: ${type}`);
  }

  /**
   * Converts a string to a TriggerRunnerType enum value.
   * If the string doesn't match any enum value, returns the default (DIRECT).
   *
   * @param typeString The string to convert
   * @returns The corresponding TriggerRunnerType enum value
   */
  private stringToRunnerType(typeString: string): TriggerRunnerType {
    // Check if the string matches any enum value
    const enumValues = Object.values(TriggerRunnerType);
    if (enumValues.includes(typeString as TriggerRunnerType)) {
      return typeString as TriggerRunnerType;
    }

    this.logger.warn(`Invalid runner type string: ${typeString}, using default`);
    return TriggerRunnerType.DIRECT;
  }

  /**
   * Creates a trigger runner based on the configuration.
   *
   * @param triggerHandler The trigger handler to use
   * @param systemTimeService The system time service to use
   * @returns A promise that resolves to a trigger runner instance
   * @throws If the runner initialization fails
   */
  async createRunner<T extends Trigger>(
    triggerHandler: TriggerHandler<T>,
    systemTimeService: SystemTimeService
  ): Promise<TriggerRunnerService<T>> {
    const runnerTypeString = this.configService.get<string>(
      'SCHEDULER_TRIGGER_RUNNER_TYPE',
      TriggerRunnerType.DIRECT
    );
    const runnerType = this.stringToRunnerType(runnerTypeString);

    const runnerConfig = this.runnerTypes.get(runnerType);

    if (!runnerConfig) {
      this.logger.warn(`Unknown runner type: ${runnerType}, falling back to direct runner`);
      return new DirectTriggerRunnerService(
        triggerHandler,
        systemTimeService,
        this.shutdownService
      );
    }

    const { type: RunnerClass, configFactory } = runnerConfig;
    const config = configFactory(this.configService);

    // Create the runner instance with the appropriate configuration
    const runner = await this.createRunnerInstance(
      RunnerClass,
      triggerHandler,
      systemTimeService,
      config,
      this.shutdownService
    );

    this.logger.log(`Created ${runnerType} trigger runner`);
    return runner;
  }

  /**
   * Creates an instance of a runner with the appropriate configuration.
   *
   * @param RunnerClass The runner class to instantiate
   * @param triggerHandler The trigger handler to use
   * @param systemTimeService The system time service to use
   * @param config Additional configuration for the runner
   * @param shutdownService The graceful shutdown service used to manage shutdown state
   * @returns A trigger runner instance
   */
  private async createRunnerInstance<T extends Trigger>(
    RunnerClass: Type<TriggerRunnerService<Trigger>>,
    triggerHandler: TriggerHandler<T>,
    systemTimeService: SystemTimeService,
    config: Record<string, unknown>,
    shutdownService: GracefulShutdownService
  ): Promise<TriggerRunnerService<T>> {
    if (RunnerClass === PubsubTriggerRunnerService) {
      const pubSubRunner = new PubsubTriggerRunnerService(
        triggerHandler,
        systemTimeService,
        config.projectId as string,
        shutdownService
      );
      await pubSubRunner.initialize();
      return pubSubRunner;
    }

    // For DirectTriggerRunnerService or any other runner that only needs handler and systemTimeService
    return new DirectTriggerRunnerService(triggerHandler, systemTimeService, shutdownService);
  }
}
