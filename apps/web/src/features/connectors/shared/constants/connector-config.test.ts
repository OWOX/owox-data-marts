import { DATA_LEVEL_CONFIG_KEY, resolveEffectiveDataLevel } from './connector-config.ts';

const spec = [{ name: DATA_LEVEL_CONFIG_KEY, default: 'AUCTION_AD' }];

describe('resolveEffectiveDataLevel', () => {
  it('prefers the value set in the configuration', () => {
    expect(resolveEffectiveDataLevel({ DataLevel: 'AUCTION_ADVERTISER' }, spec)).toBe(
      'AUCTION_ADVERTISER'
    );
  });

  it('falls back to the spec default when the config omits Data Level', () => {
    // The regression this guards: config form does not push an unchanged spec default into
    // configuration, so leaving Data Level at its default leaves it absent here. Without the
    // fallback, reconciliation would skip and a run defaulting to AUCTION_AD fails on ad_id.
    expect(resolveEffectiveDataLevel({}, spec)).toBe('AUCTION_AD');
  });

  it('ignores a non-string configured value and uses the spec default', () => {
    expect(resolveEffectiveDataLevel({ DataLevel: 123 }, spec)).toBe('AUCTION_AD');
  });

  it('returns undefined when neither config nor spec provides a string data level', () => {
    expect(resolveEffectiveDataLevel({}, [])).toBeUndefined();
    expect(resolveEffectiveDataLevel({}, null)).toBeUndefined();
    expect(resolveEffectiveDataLevel({}, [{ name: DATA_LEVEL_CONFIG_KEY }])).toBeUndefined();
  });
});
