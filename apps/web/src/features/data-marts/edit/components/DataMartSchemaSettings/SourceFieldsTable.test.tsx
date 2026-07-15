import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { BlendedField } from '../../../shared/types/relationship.types';
import { SourceFieldsTable } from './SourceFieldsTable';

function buildBlendedField(overrides: Partial<BlendedField> = {}): BlendedField {
  return {
    name: 'src__field_a',
    sourceRelationshipId: 'rel-1',
    sourceDataMartId: 'dm-1',
    sourceDataMartTitle: 'Src DM',
    targetAlias: 'src',
    originalFieldName: 'field_a',
    type: 'STRING',
    alias: 'field_a',
    description: '',
    isHidden: false,
    aggregateFunction: 'STRING_AGG',
    transitiveDepth: 1,
    aliasPath: 'src',
    outputPrefix: 'Src DM',
    ...overrides,
  };
}

describe('SourceFieldsTable — Post-join column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Available aggregations" column header (Σ icon with aria-label)', () => {
    const fields = [buildBlendedField()];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    expect(screen.getByLabelText('Available aggregations')).toBeInTheDocument();
  });

  it('shows function names in trigger when postJoinAggregations is [MAX, MIN]', () => {
    const fields = [
      // MAX comes before MIN in REPORT_AGGREGATE_FUNCTIONS
      buildBlendedField({ originalFieldName: 'revenue', postJoinAggregations: ['MAX', 'MIN'] }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    expect(screen.getByText('MAX, MIN')).toBeInTheDocument();
  });

  it('shows "None" placeholder when postJoinAggregations is absent', () => {
    const fields = [buildBlendedField({ originalFieldName: 'revenue' })];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows "3 selected" when 3 or more functions are chosen', () => {
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        postJoinAggregations: ['MAX', 'MIN', 'AVG'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('checking an unchecked function calls onFieldOverrideChange in the supported-for-type order (numeric)', async () => {
    const onFieldOverrideChange = vi.fn();
    // Numeric supported order is [SUM, AVG, MIN, MAX, ANY_VALUE, ...].
    // aggregateFunction: 'SUM' preserves the raw INTEGER type as the effective type
    // (the default 'STRING_AGG' dedup would widen it to STRING — see the #6733 describe block below).
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
        aggregateFunction: 'SUM',
        postJoinAggregations: ['MAX', 'MIN'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    // Open the dropdown by sending pointer events (Radix UI requires pointerDown to open)
    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // AVG is unchecked — click it to add it; result order follows the numeric supported order: AVG, MIN, MAX
    const avgItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'AVG' });
    fireEvent.click(avgItem);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        postJoinAggregations: ['AVG', 'MIN', 'MAX'],
      });
    });

    const [, payload] = onFieldOverrideChange.mock.calls[0] as [
      string,
      { postJoinAggregations: string[] },
    ];
    const maxIdx = payload.postJoinAggregations.indexOf('MAX');
    const minIdx = payload.postJoinAggregations.indexOf('MIN');
    const avgIdx = payload.postJoinAggregations.indexOf('AVG');
    expect(avgIdx).toBeLessThan(minIdx);
    expect(minIdx).toBeLessThan(maxIdx);
  });

  it('unchecking a checked function removes it from the array', async () => {
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
        aggregateFunction: 'SUM',
        postJoinAggregations: ['MAX', 'MIN'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // MIN is checked — click it to remove it
    const minItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'MIN' });
    fireEvent.click(minItem);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        postJoinAggregations: ['MAX'],
      });
    });
  });

  it('toggling one function on empty postJoinAggregations produces a single-element array', async () => {
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
        aggregateFunction: 'SUM',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const sumItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'SUM' });
    fireEvent.click(sumItem);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        postJoinAggregations: ['SUM'],
      });
    });
  });
});

describe('SourceFieldsTable — available aggregations follow the dedup EFFECTIVE type (#6733)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a STRING field deduped with COUNT_DISTINCT offers arithmetic aggregations (SUM) in the menu', async () => {
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'STRING',
        aggregateFunction: 'COUNT_DISTINCT',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      await within(document.body).findByRole('menuitemcheckbox', { name: 'SUM' })
    ).toBeInTheDocument();
    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'STRING_AGG' })
    ).not.toBeInTheDocument();
  });

  it('bases the available-aggregations menu on the RAW sourceFieldType, not the already-effective type', async () => {
    // A type-preserving dedup (MIN) whose persisted `type` is the effective INTEGER but whose
    // raw base is STRING must offer the STRING menu (STRING_AGG present, SUM absent) — resolving
    // off the already-effective `type` would wrongly surface the numeric (SUM) menu.
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
        sourceFieldType: 'STRING',
        aggregateFunction: 'MIN',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      await within(document.body).findByRole('menuitemcheckbox', { name: 'STRING_AGG' })
    ).toBeInTheDocument();
    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'SUM' })
    ).not.toBeInTheDocument();
  });

  it('a STRING field deduped with STRING_AGG (default) does NOT offer arithmetic aggregations', async () => {
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'STRING',
        aggregateFunction: 'STRING_AGG',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    const trigger = screen.getByRole('button', { name: 'Available aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'SUM' })
    ).not.toBeInTheDocument();
    expect(
      await within(document.body).findByRole('menuitemcheckbox', { name: 'STRING_AGG' })
    ).toBeInTheDocument();
  });

  it('changing dedup to COUNT_DISTINCT RESETS the available set to the new effective type default (not pruned to none)', async () => {
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'STRING',
        sourceFieldType: 'STRING',
        aggregateFunction: 'STRING_AGG',
        // The backend's STRING default. Pruning it against the COUNT_DISTINCT-effective INTEGER
        // supported set would wipe it to [] (none allowed) — the #6733 regression. It must instead
        // RESET to the INTEGER default so SUM surfaces and the funnel can sum per-key counts.
        postJoinAggregations: ['COUNT', 'COUNT_DISTINCT'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const dedupTrigger = screen.getByRole('combobox');
    fireEvent.pointerDown(dedupTrigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    const countDistinctOption = await within(document.body).findByRole('option', {
      name: 'COUNT_DISTINCT',
    });
    fireEvent.click(countDistinctOption);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        aggregateFunction: 'COUNT_DISTINCT',
        postJoinAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
      });
    });
  });

  it('reverting a type-changing dedup resolves the reset off the RAW sourceFieldType, not the already-effective type', async () => {
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'hitId',
        // `type` is already the COUNT_DISTINCT effective type (backend overwrote STRING→INTEGER);
        // `sourceFieldType` preserves the true base so reverting to MIN resolves off STRING.
        type: 'INTEGER',
        sourceFieldType: 'STRING',
        aggregateFunction: 'COUNT_DISTINCT',
        postJoinAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const dedupTrigger = screen.getByRole('combobox');
    fireEvent.pointerDown(dedupTrigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    const minOption = await within(document.body).findByRole('option', { name: 'MIN' });
    fireEvent.click(minOption);

    // MIN preserves the effective type → base STRING → the STRING governance default, NOT the
    // INTEGER default [SUM,AVG,MIN,MAX] that resolving off the stale `type: INTEGER` would give.
    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('hitId', {
        aggregateFunction: 'MIN',
        postJoinAggregations: ['COUNT', 'COUNT_DISTINCT'],
      });
    });
  });

  it('a dedup change WITHIN the same category (SUM→MIN) keeps the analyst selection (no reset)', async () => {
    // Both SUM and MIN preserve the raw INTEGER type → both effective INTEGER (same numeric
    // category). Narrowing to ['SUM'] then switching SUM→MIN must NOT silently re-expand the
    // available set — the override omits postJoinAggregations so the current selection stands.
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
        sourceFieldType: 'INTEGER',
        aggregateFunction: 'SUM',
        postJoinAggregations: ['SUM'],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const dedupTrigger = screen.getByRole('combobox');
    fireEvent.pointerDown(dedupTrigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    const minOption = await within(document.body).findByRole('option', { name: 'MIN' });
    fireEvent.click(minOption);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        aggregateFunction: 'MIN',
      });
    });
    const [, payload] = onFieldOverrideChange.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('postJoinAggregations');
  });

  it('a category-changing dedup PRESERVES an explicit empty set (analyst turned all off)', async () => {
    // `[]` is a deliberate "none allowed" choice, distinct from "unset". A dedup change that
    // crosses categories must NOT silently re-enable aggregations the analyst switched off —
    // the override omits postJoinAggregations so the explicit `[]` stands (product decision).
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'hitId',
        type: 'STRING',
        sourceFieldType: 'STRING',
        aggregateFunction: 'STRING_AGG',
        postJoinAggregations: [],
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const dedupTrigger = screen.getByRole('combobox');
    fireEvent.pointerDown(dedupTrigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    const countDistinctOption = await within(document.body).findByRole('option', {
      name: 'COUNT_DISTINCT',
    });
    fireEvent.click(countDistinctOption);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('hitId', {
        aggregateFunction: 'COUNT_DISTINCT',
      });
    });
    const [, payload] = onFieldOverrideChange.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('postJoinAggregations');
  });

  it('shows the RAW sourceFieldType in the Data type cell, not the dedup effective type', () => {
    // A STRING field deduped COUNT_DISTINCT has an effective `type` of INTEGER; the authoring
    // table must still display the analyst's RAW type (STRING), not the effective INTEGER.
    const fields = [
      buildBlendedField({
        originalFieldName: 'hitId',
        type: 'INTEGER',
        sourceFieldType: 'STRING',
        aggregateFunction: 'COUNT_DISTINCT',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    expect(screen.getByText('STRING')).toBeInTheDocument();
    expect(screen.queryByText('INTEGER')).not.toBeInTheDocument();
  });

  it('falls back to field.type for the Data type cell and the available-aggregations menu when sourceFieldType is absent (legacy payload)', async () => {
    // A payload persisted before #6733 added `sourceFieldType` to the DTO has no such property.
    // Both the display cell and the effective-type menu must fall back to `field.type` without
    // crashing, and must resolve the SAME effective type they would if sourceFieldType had been
    // explicitly set to the same value (STRING → COUNT_DISTINCT → integer-ish menu with SUM).
    const fields = [
      buildBlendedField({
        originalFieldName: 'hitId',
        type: 'STRING',
        sourceFieldType: undefined,
        aggregateFunction: 'COUNT_DISTINCT',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={() => {}} />);

    // Data type cell falls back to field.type
    expect(screen.getByText('STRING')).toBeInTheDocument();

    // Available-aggregations menu resolves off the fallback STRING base, not a crash/blank menu
    const trigger = screen.getByRole('button', { name: 'Available aggregations for hitId' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      await within(document.body).findByRole('menuitemcheckbox', { name: 'SUM' })
    ).toBeInTheDocument();
    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'STRING_AGG' })
    ).not.toBeInTheDocument();
  });

  it('changing dedup does NOT materialize postJoinAggregations when it was previously unset', async () => {
    const onFieldOverrideChange = vi.fn();
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'STRING',
        aggregateFunction: 'STRING_AGG',
      }),
    ];
    render(<SourceFieldsTable fields={fields} onFieldOverrideChange={onFieldOverrideChange} />);

    const dedupTrigger = screen.getByRole('combobox');
    fireEvent.pointerDown(dedupTrigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    const countDistinctOption = await within(document.body).findByRole('option', {
      name: 'COUNT_DISTINCT',
    });
    fireEvent.click(countDistinctOption);

    await waitFor(() => {
      expect(onFieldOverrideChange).toHaveBeenCalledWith('revenue', {
        aggregateFunction: 'COUNT_DISTINCT',
      });
    });
    const [, payload] = onFieldOverrideChange.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('postJoinAggregations');
  });
});
