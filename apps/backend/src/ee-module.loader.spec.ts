import { DynamicModule, Module } from '@nestjs/common';
import { loadEeModule } from './ee-module.loader';

@Module({})
class FakeEeModule {
  static register(): DynamicModule {
    return { module: FakeEeModule, imports: [FakeEeModule] };
  }
}

describe('loadEeModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns stub module when EE_MODULES_ENABLED=false', async () => {
    process.env['EE_MODULES_ENABLED'] = 'false';
    const result = await loadEeModule();
    expect(result.module).toBeDefined();
    expect((result as DynamicModule).imports).toBeUndefined();
  });

  it('returns stub module without throwing when ee directory is absent', async () => {
    delete process.env['EE_MODULES_ENABLED'];
    const absentImporter = () => Promise.reject(new Error('Cannot find module'));
    const result = await loadEeModule(absentImporter);
    expect(result.module).toBeDefined();
    expect((result as DynamicModule).imports).toBeUndefined();
  });

  it('does not throw when ee import fails', async () => {
    delete process.env['EE_MODULES_ENABLED'];
    const absentImporter = () => Promise.reject(new Error('Cannot find module'));
    await expect(loadEeModule(absentImporter)).resolves.not.toThrow();
  });

  it('returns EeModule result when ee is present', async () => {
    delete process.env['EE_MODULES_ENABLED'];
    const presentImporter = () => Promise.resolve({ EeModule: FakeEeModule });
    const result = await loadEeModule(presentImporter);
    expect(result.module).toBe(FakeEeModule);
    expect((result as DynamicModule).imports).toBeDefined();
  });

  it('logs error and returns stub when ee import throws non-absent error', async () => {
    delete process.env['EE_MODULES_ENABLED'];
    const brokenImporter = () => Promise.reject(new Error('Unexpected syntax error'));
    const result = await loadEeModule(brokenImporter);
    expect(result.module).toBeDefined();
    expect((result as DynamicModule).imports).toBeUndefined();
  });
});
