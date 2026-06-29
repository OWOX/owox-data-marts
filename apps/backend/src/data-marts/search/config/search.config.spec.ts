import { loadSearchConfig } from './search.config';

describe('loadSearchConfig', () => {
  it('uses documented defaults', () => {
    expect(loadSearchConfig({})).toEqual({
      queryMaxLength: 256,
      queryMinLength: 2,
      topK: 25,
    });
  });

  it('rejects SEARCH_TOP_K above the public API max limit', () => {
    expect(() => loadSearchConfig({ SEARCH_TOP_K: '51' })).toThrow();
  });
});
