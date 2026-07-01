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
    const fields = [
      buildBlendedField({
        originalFieldName: 'revenue',
        type: 'INTEGER',
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
    const fields = [buildBlendedField({ originalFieldName: 'revenue', type: 'INTEGER' })];
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
