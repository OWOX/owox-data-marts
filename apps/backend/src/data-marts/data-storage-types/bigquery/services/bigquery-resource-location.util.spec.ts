import type { StorageResourceLeaf } from '../../interfaces/storage-resource-browser.interface';
import { flagLocationMismatches } from './bigquery-resource-location.util';

function leaf(id: string, location?: string): StorageResourceLeaf {
  return {
    id,
    groupId: 'analytics',
    type: 'TABLE',
    fullyQualifiedName: `my-project.analytics.${id}`,
    ...(location ? { location } : {}),
  };
}

describe('flagLocationMismatches', () => {
  it('flags leaves stored outside the storage location', () => {
    const result = flagLocationMismatches([leaf('eu_table', 'EU'), leaf('us_table', 'US')], 'EU');

    expect(result).toEqual([
      { ...leaf('eu_table', 'EU'), locationMismatch: false },
      { ...leaf('us_table', 'US'), locationMismatch: true },
    ]);
  });

  it('compares location names case-insensitively', () => {
    const [result] = flagLocationMismatches([leaf('orders', 'europe-west1')], 'EUROPE-WEST1');

    expect(result.locationMismatch).toBe(false);
  });

  it('treats a multi-region and a region inside it as different locations', () => {
    const [result] = flagLocationMismatches([leaf('orders', 'us-central1')], 'US');

    expect(result.locationMismatch).toBe(true);
  });

  it('leaves everything untouched when the storage auto-detects its location', () => {
    const leaves = [leaf('eu_table', 'EU'), leaf('us_table', 'US')];

    expect(flagLocationMismatches(leaves, undefined)).toBe(leaves);
  });

  it('does not flag a leaf whose location is unknown', () => {
    const [result] = flagLocationMismatches([leaf('orders')], 'EU');

    expect(result).not.toHaveProperty('locationMismatch');
  });
});
