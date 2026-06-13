import { loadAdvancedSearchConfig } from './advanced-search.config';

describe('loadAdvancedSearchConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadAdvancedSearchConfig({});
    expect(config.modelCacheDir).toBeNull();
    expect(config.reconcileCron).toBe('*/10 * * * *');
    expect(config.topK).toBe(3);
    expect(config.indexBatchSize).toBe(20);
  });

  it('applies custom cache dir', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_MODEL_CACHE_DIR: '/data/models' });
    expect(config.modelCacheDir).toBe('/data/models');
  });

  it('applies custom reconcile cron', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_RECONCILE_CRON: '*/5 * * * *' });
    expect(config.reconcileCron).toBe('*/5 * * * *');
  });

  it('applies custom topK and indexBatchSize', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_TOP_K: '10',
      ADVANCED_SEARCH_INDEX_BATCH_SIZE: '50',
    });
    expect(config.topK).toBe(10);
    expect(config.indexBatchSize).toBe(50);
  });

  it('rejects non-numeric topK', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_TOP_K: 'abc' })).toThrow();
  });

  it('rejects non-numeric indexBatchSize', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_INDEX_BATCH_SIZE: 'xyz' })).toThrow();
  });

  it('rejects zero topK', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_TOP_K: '0' })).toThrow();
  });

  it('rejects negative indexBatchSize', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_INDEX_BATCH_SIZE: '-1' })).toThrow();
  });
});
