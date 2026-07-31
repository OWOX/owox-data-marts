import { describe, expect, it } from 'vitest';
import {
  ALL_HIDDEN,
  isAllHidden,
  isNothingHidden,
  NOTHING_HIDDEN,
  parseObjectLabelsHidden,
  serializeObjectLabelsHidden,
  toggleObjectLabelPart,
} from './object-labels';

describe('object labels state', () => {
  it('defaults to nothing hidden when no preference is stored', () => {
    expect(parseObjectLabelsHidden(null)).toEqual(NOTHING_HIDDEN);
  });

  it('round-trips through serialization', () => {
    const hidden = { source: true, fields: false, status: true };
    expect(parseObjectLabelsHidden(serializeObjectLabelsHidden(hidden))).toEqual(hidden);
  });

  it('ignores unknown tokens so future parts default to visible', () => {
    expect(parseObjectLabelsHidden('source, bogus ,status')).toEqual({
      source: true,
      fields: false,
      status: true,
    });
  });

  it('toggles a single part without touching the others', () => {
    const next = toggleObjectLabelPart(NOTHING_HIDDEN, 'fields');
    expect(next).toEqual({ source: false, fields: true, status: false });
    expect(toggleObjectLabelPart(next, 'fields')).toEqual(NOTHING_HIDDEN);
  });

  it('detects the two extremes', () => {
    expect(isNothingHidden(NOTHING_HIDDEN)).toBe(true);
    expect(isNothingHidden(ALL_HIDDEN)).toBe(false);
    expect(isAllHidden(ALL_HIDDEN)).toBe(true);
    expect(isAllHidden({ source: true, fields: true, status: false })).toBe(false);
  });
});
