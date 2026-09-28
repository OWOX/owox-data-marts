import { describe, expect, it } from 'vitest';
import {
  ALL_HIDDEN,
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
    const legacy = parseObjectLabelsHidden('source,fields');
    expect(legacy.fieldAlias).toBe(false);
    expect(legacy.fieldDescription).toBe(false);
  });

  it('keeps an old "title only" preference down to the title', () => {
    // Stored before the per-badge parts: source, fields and status hidden meant title only.
    expect(parseObjectLabelsHidden('source,fields,status')).toEqual({
      ...ALL_HIDDEN,
      fieldAlias: false,
      fieldDescription: false,
    });
  });

  it('never re-hides the newer parts in a preference written by this version', () => {
    const hidden = { ...NOTHING_HIDDEN, source: true, fields: true, status: true };
    expect(parseObjectLabelsHidden(serializeObjectLabelsHidden(hidden))).toEqual(hidden);
    expect(parseObjectLabelsHidden(serializeObjectLabelsHidden(NOTHING_HIDDEN))).toEqual(
      NOTHING_HIDDEN
    );
  });

  it('toggles a single part without touching the others', () => {
    const next = toggleObjectLabelPart(NOTHING_HIDDEN, 'fields');
    expect(next).toEqual({ ...NOTHING_HIDDEN, fields: true });
    expect(toggleObjectLabelPart(next, 'fields')).toEqual(NOTHING_HIDDEN);
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
