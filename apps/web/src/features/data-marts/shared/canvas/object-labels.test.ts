import { describe, expect, it } from 'vitest';
import {
  ALL_HIDDEN,
  isAllHidden,
  isNothingHidden,
  NOTHING_HIDDEN,
  parseObjectLabelsHidden,
  serializeObjectLabelsHidden,
  toFieldRowLabels,
  toggleObjectLabelPart,
} from './object-labels';

describe('object labels state', () => {
  it('defaults to nothing hidden when no preference is stored', () => {
    expect(parseObjectLabelsHidden(null)).toEqual(NOTHING_HIDDEN);
  });

  it('round-trips through serialization', () => {
    const hidden = { ...NOTHING_HIDDEN, source: true, status: true, fieldDescription: true };
    expect(parseObjectLabelsHidden(serializeObjectLabelsHidden(hidden))).toEqual(hidden);
  });

  it('ignores unknown tokens so future parts default to visible', () => {
    expect(parseObjectLabelsHidden('source, bogus ,status')).toEqual({
      ...NOTHING_HIDDEN,
      source: true,
      status: true,
    });
  });

  it('keeps the field-row parts visible for a preference stored before they existed', () => {
    const legacy = parseObjectLabelsHidden('source,fields,status');
    expect(legacy.fieldAlias).toBe(false);
    expect(legacy.fieldDescription).toBe(false);
    // Which also means an old "everything hidden" preference is no longer "all hidden".
    expect(isAllHidden(legacy)).toBe(false);
  });

  it('toggles a single part without touching the others', () => {
    const next = toggleObjectLabelPart(NOTHING_HIDDEN, 'fields');
    expect(next).toEqual({ ...NOTHING_HIDDEN, fields: true });
    expect(toggleObjectLabelPart(next, 'fields')).toEqual(NOTHING_HIDDEN);
  });

  it('detects the two extremes', () => {
    expect(isNothingHidden(NOTHING_HIDDEN)).toBe(true);
    expect(isNothingHidden(ALL_HIDDEN)).toBe(false);
    expect(isAllHidden(ALL_HIDDEN)).toBe(true);
    expect(isAllHidden({ ...ALL_HIDDEN, status: false })).toBe(false);
  });

  it('maps the field-row parts to the shape the rows consume', () => {
    expect(toFieldRowLabels(NOTHING_HIDDEN)).toEqual({ alias: true, description: true });
    expect(toFieldRowLabels({ ...NOTHING_HIDDEN, fieldAlias: true })).toEqual({
      alias: false,
      description: true,
    });
    expect(toFieldRowLabels(ALL_HIDDEN)).toEqual({ alias: false, description: false });
  });
});
