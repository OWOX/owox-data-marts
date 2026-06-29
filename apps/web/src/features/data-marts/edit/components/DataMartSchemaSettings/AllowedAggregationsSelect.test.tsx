import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { AllowedAggregationsSelect } from './AllowedAggregationsSelect';

describe('AllowedAggregationsSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger button', () => {
    render(
      <AllowedAggregationsSelect
        value={[]}
        onChange={() => {}}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for test_field'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Post-join aggregations for test_field' })
    ).toBeInTheDocument();
  });

  it('shows "None" when value is empty', () => {
    render(
      <AllowedAggregationsSelect
        value={[]}
        onChange={() => {}}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for test_field'
      />
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows joined names when 1–2 functions are selected', () => {
    const value: ReportAggregateFunction[] = ['MIN', 'MAX'];
    render(
      <AllowedAggregationsSelect
        value={value}
        onChange={() => {}}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for test_field'
      />
    );

    expect(screen.getByText('MIN, MAX')).toBeInTheDocument();
  });

  it('shows "N selected" when 3 or more functions are selected', () => {
    const value: ReportAggregateFunction[] = ['MIN', 'MAX', 'AVG'];
    render(
      <AllowedAggregationsSelect
        value={value}
        onChange={() => {}}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for test_field'
      />
    );

    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('only offers the aggregations supported by the field type — DATE has no percentiles/SUM', async () => {
    render(
      <AllowedAggregationsSelect
        value={[]}
        onChange={() => {}}
        fieldType='DATE'
        ariaLabel='Aggregations for created_at'
      />
    );

    const trigger = screen.getByRole('button', { name: 'Aggregations for created_at' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    // DATE supports MIN/MAX/ANY_VALUE/COUNT/COUNT_DISTINCT/STRING_AGG — and NOT percentiles or SUM.
    expect(
      await within(document.body).findByRole('menuitemcheckbox', { name: 'MIN' })
    ).toBeInTheDocument();
    expect(
      within(document.body).getByRole('menuitemcheckbox', { name: 'COUNT_DISTINCT' })
    ).toBeInTheDocument();
    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'P50' })
    ).not.toBeInTheDocument();
    expect(
      within(document.body).queryByRole('menuitemcheckbox', { name: 'SUM' })
    ).not.toBeInTheDocument();
  });

  it('checking an unchecked function calls onChange in the supported-for-type order (numeric)', async () => {
    const onChange = vi.fn();
    // Numeric supported order is [SUM, AVG, MIN, MAX, ANY_VALUE, ...]; start with MAX+MIN.
    const value: ReportAggregateFunction[] = ['MAX', 'MIN'];
    render(
      <AllowedAggregationsSelect
        value={value}
        onChange={onChange}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for revenue'
      />
    );

    const trigger = screen.getByRole('button', { name: 'Post-join aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const avgItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'AVG' });
    fireEvent.click(avgItem);

    // Result follows the numeric supported order: AVG, MIN, MAX.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['AVG', 'MIN', 'MAX']);
    });

    const [result] = onChange.mock.calls[0] as [ReportAggregateFunction[]];
    expect(result.indexOf('AVG')).toBeLessThan(result.indexOf('MIN'));
    expect(result.indexOf('MIN')).toBeLessThan(result.indexOf('MAX'));
  });

  it('unchecking a checked function removes it from the array', async () => {
    const onChange = vi.fn();
    const value: ReportAggregateFunction[] = ['MAX', 'MIN'];
    render(
      <AllowedAggregationsSelect
        value={value}
        onChange={onChange}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for revenue'
      />
    );

    const trigger = screen.getByRole('button', { name: 'Post-join aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const minItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'MIN' });
    fireEvent.click(minItem);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['MAX']);
    });
  });

  it('toggling one function on empty value produces a single-element array', async () => {
    const onChange = vi.fn();
    render(
      <AllowedAggregationsSelect
        value={[]}
        onChange={onChange}
        fieldType='INTEGER'
        ariaLabel='Post-join aggregations for revenue'
      />
    );

    const trigger = screen.getByRole('button', { name: 'Post-join aggregations for revenue' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const sumItem = await within(document.body).findByRole('menuitemcheckbox', { name: 'SUM' });
    fireEvent.click(sumItem);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['SUM']);
    });
  });
});
