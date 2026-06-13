import { DynamicModule, Logger, Module } from '@nestjs/common';
import * as path from 'path';

@Module({})
class EeNotInstalledModule {}

type EeImporter = () => Promise<{ EeModule: { register(): DynamicModule } }>;

const defaultImporter: EeImporter = () =>
  import(path.join(__dirname, 'ee', 'ee.module')) as Promise<{
    EeModule: { register(): DynamicModule };
  }>;

export async function loadEeModule(importer: EeImporter = defaultImporter): Promise<DynamicModule> {
  const logger = new Logger('EeModuleLoader');

  if (process.env['EE_MODULES_ENABLED'] === 'false') {
    logger.log('EE modules disabled by EE_MODULES_ENABLED=false');
    return { module: EeNotInstalledModule };
  }

  try {
    const { EeModule } = await importer();
    return EeModule.register();
  } catch (e) {
    const isAbsent =
      e instanceof Error &&
      ('code' in e
        ? (e as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
        : e.message.includes('MODULE_NOT_FOUND') || e.message.includes('Cannot find module'));

    if (isAbsent) {
      logger.log('EE modules not present — running community edition');
    } else {
      logger.error('EE module failed to load', e);
    }

    return { module: EeNotInstalledModule };
  }
}
