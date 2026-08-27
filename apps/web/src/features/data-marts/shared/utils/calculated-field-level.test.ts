import { describe, expect, it } from 'vitest';
import { isRowLevelCalculatedField } from './calculated-field-level';

describe('isRowLevelCalculatedField', () => {
  it('reads a derived row-level field as row-level', () => {
    expect(isRowLevelCalculatedField({ level: 'column' })).toBe(true);
  });

  it('reads an aggregate-level field as NOT row-level', () => {
    expect(isRowLevelCalculatedField({ level: 'metric' })).toBe(false);
  });

  // The two shapes that must fall to the aggregate reading, because that is the one offering
  // nothing: a field authored in this session (the save has not derived a level yet), and a
  // field that is not calculated at all.
  it('reads an absent level as an aggregate, exactly as the backend does', () => {
    expect(isRowLevelCalculatedField({})).toBe(false);
    expect(isRowLevelCalculatedField(undefined)).toBe(false);
  });
});
