// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getDataMartColumns } from './columns';
import { DataMartColumnKey } from './columnKeys';

describe('getDataMartColumns', () => {
  it('includes a distinct visible Quality column', () => {
    const columns = getDataMartColumns();

    expect(DataMartColumnKey.QUALITY).toBe('quality');
    expect(columns.filter(column => column.id === DataMartColumnKey.QUALITY)).toHaveLength(1);
  });
});
