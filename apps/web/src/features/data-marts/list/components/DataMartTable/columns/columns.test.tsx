// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getDataMartColumns } from './columns';
import { DataMartColumnKey } from './columnKeys';

describe('getDataMartColumns', () => {
  it('does not include Quality in the visible Data Marts columns', () => {
    const columns = getDataMartColumns();

    expect(DataMartColumnKey.QUALITY).toBe('quality');
    expect(columns.some(column => column.id === DataMartColumnKey.QUALITY)).toBe(false);
  });
});
