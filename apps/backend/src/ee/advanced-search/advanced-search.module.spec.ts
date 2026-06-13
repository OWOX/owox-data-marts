const MockCommonModule = { name: 'MockCommonModule' };
const MockIdpModule = { name: 'MockIdpModule' };
const MockDataMartsModule = { name: 'MockDataMartsModule' };
jest.mock('../../common/common.module', () => ({ CommonModule: MockCommonModule }));
jest.mock('../../idp/idp.module', () => ({ IdpModule: MockIdpModule }));
jest.mock('../../data-marts/data-marts.module', () => ({ DataMartsModule: MockDataMartsModule }));
jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { viewer: () => ({ role: 'viewer', strategy: 'parse' }) },
    Strategy: { PARSE: 'parse', INTROSPECT: 'introspect' },
  };
});

import { AdvancedSearchModule } from './advanced-search.module';
import { ADVANCED_SEARCH_CONFIG } from './config/advanced-search.config';
import { ADVANCED_SEARCH_FACADE } from '../../common/ee-contracts/advanced-search.facade';
import { DATA_MART_CATALOG } from './catalog/data-mart-catalog.port';
import { EMBEDDING_PROVIDER } from './embedding/embedding-provider';
import { LocalTransformersEmbeddingProvider } from './embedding/local-transformers.provider';

describe('AdvancedSearchModule.register()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns bare module when ADVANCED_SEARCH_ENABLED is not set', () => {
    delete process.env['ADVANCED_SEARCH_ENABLED'];
    const module = AdvancedSearchModule.register();
    expect(module.module).toBe(AdvancedSearchModule);
    expect(module.providers).toBeUndefined();
    expect(module.controllers).toBeUndefined();
    expect(module.imports).toBeUndefined();
  });

  it('returns bare module when ADVANCED_SEARCH_ENABLED=false', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'false';
    const module = AdvancedSearchModule.register();
    expect(module.module).toBe(AdvancedSearchModule);
    expect(module.providers).toBeUndefined();
    expect(module.controllers).toBeUndefined();
  });

  it('disabled branch has no global flag', () => {
    delete process.env['ADVANCED_SEARCH_ENABLED'];
    const module = AdvancedSearchModule.register();
    expect(module.global).toBeFalsy();
  });

  it('returns module with providers when ADVANCED_SEARCH_ENABLED=true', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    expect(module.module).toBe(AdvancedSearchModule);
    expect(module.providers).toBeDefined();
    const tokens = (module.providers ?? []).map(p =>
      typeof p === 'object' && 'provide' in p ? p.provide : p
    );
    expect(tokens).toContain(ADVANCED_SEARCH_CONFIG);
  });

  it('exports ADVANCED_SEARCH_FACADE when enabled', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    expect(module.exports).toContain(ADVANCED_SEARCH_FACADE);
  });

  it('registers all required DI tokens when enabled', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    const tokens = (module.providers ?? []).map(p =>
      typeof p === 'object' && 'provide' in p ? p.provide : p
    );
    expect(tokens).toContain(DATA_MART_CATALOG);
    expect(tokens).toContain(EMBEDDING_PROVIDER);
    expect(tokens).toContain(ADVANCED_SEARCH_FACADE);
  });

  it('registers AdvancedSearchController when enabled', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    expect(module.controllers).toBeDefined();
    expect((module.controllers ?? []).length).toBeGreaterThan(0);
  });

  it('imports CommonModule when enabled', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    expect(module.imports).toBeDefined();
    const importNames = (module.imports ?? []).map(m =>
      typeof m === 'object' && m !== null && 'name' in m ? (m as { name: string }).name : String(m)
    );
    expect(importNames).toContain('MockCommonModule');
  });

  it('is global when enabled', () => {
    process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
    const module = AdvancedSearchModule.register();
    expect(module.global).toBe(true);
  });

  describe('embedding provider binding', () => {
    it('binds EMBEDDING_PROVIDER to LocalTransformersEmbeddingProvider via useClass', () => {
      process.env['ADVANCED_SEARCH_ENABLED'] = 'true';
      const module = AdvancedSearchModule.register();
      const embeddingDef = (module.providers ?? []).find(
        p => typeof p === 'object' && 'provide' in p && p.provide === EMBEDDING_PROVIDER
      ) as { useClass?: unknown } | undefined;
      expect(embeddingDef).toBeDefined();
      expect(embeddingDef?.useClass).toBe(LocalTransformersEmbeddingProvider);
    });
  });
});
