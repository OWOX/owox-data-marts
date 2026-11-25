import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateConfig } from '../../config/env-validation.config';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { RunsNotificationProcessor } from './runs-notification.processor';
import { SendNotificationProcessor } from './send-notification.processor';

/**
 * Both notification processors are switched on and off by NOTIFICATIONS_ENABLED.
 *
 * An environment variable is always a string, and the schema in env-validation.config.ts is
 * the only place that turns it into a boolean. These cases read the variable the way the app
 * does, through ConfigModule with that schema as `validate`, so they fail if the variable
 * ever leaves the schema again: the string 'false' is truthy, and `NOTIFICATIONS_ENABLED=false`
 * then enabled the very notifications it was set to turn off.
 */
async function configServiceWith(notificationsEnabled: string | undefined): Promise<ConfigService> {
  const previous = process.env.NOTIFICATIONS_ENABLED;
  if (notificationsEnabled === undefined) {
    delete process.env.NOTIFICATIONS_ENABLED;
  } else {
    process.env.NOTIFICATIONS_ENABLED = notificationsEnabled;
  }

  try {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, validate: validateConfig })],
    }).compile();
    return moduleRef.get(ConfigService);
  } finally {
    // ConfigModule copies validated defaults back into process.env; leave no trace for other specs.
    if (previous === undefined) {
      delete process.env.NOTIFICATIONS_ENABLED;
    } else {
      process.env.NOTIFICATIONS_ENABLED = previous;
    }
  }
}

const stub = {} as never;

const processors: [string, (config: ConfigService) => BaseSystemTaskProcessor][] = [
  [
    'RunsNotificationProcessor',
    config => new RunsNotificationProcessor(stub, stub, stub, stub, config),
  ],
  ['SendNotificationProcessor', config => new SendNotificationProcessor(stub, stub, stub, config)],
];

describe.each(processors)('%s.isEnabled', (_name, createProcessor) => {
  it.each([['true'], ['TRUE'], [' true ']])(
    'is enabled by NOTIFICATIONS_ENABLED=%p',
    async value => {
      const processor = createProcessor(await configServiceWith(value));

      expect(processor.isEnabled()).toBe(true);
    }
  );

  it.each([['false'], ['FALSE'], [' false ']])(
    'is disabled by NOTIFICATIONS_ENABLED=%p',
    async value => {
      const processor = createProcessor(await configServiceWith(value));

      expect(processor.isEnabled()).toBe(false);
    }
  );

  it.each([[undefined], ['']])('is disabled when NOTIFICATIONS_ENABLED is %p', async value => {
    const processor = createProcessor(await configServiceWith(value));

    expect(processor.isEnabled()).toBe(false);
  });
});
