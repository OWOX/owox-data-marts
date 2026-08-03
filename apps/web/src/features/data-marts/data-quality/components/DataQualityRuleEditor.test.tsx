// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityRuleEditor } from './DataQualityRuleEditor';

describe('DataQualityRuleEditor', () => {
  it('keeps the check description in a hover and focus informer instead of the row body', async () => {
    const description = 'Checks whether the share of null values exceeds the configured threshold.';

    render(
      <DataQualityRuleEditor
        rule={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
          isApplicable: true,
        }}
        value={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
        }}
        disabled={false}
        showScopeLabel={false}
        onChange={vi.fn()}
      />
    );

    const row = screen.getByTestId('quality-rule-null_rate:field:["email"]');
    expect(row).toHaveClass('group');
    expect(within(row).queryByText(description)).not.toBeInTheDocument();

    const informer = within(row).getByRole('button', { name: 'About Null rate' });
    expect(informer).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    );

    fireEvent.focus(informer);

    const tooltips = await screen.findAllByRole('tooltip');
    expect(tooltips.find(tooltip => tooltip.dataset.slot === 'tooltip-content')).toHaveTextContent(
      description
    );
  });

  it('keeps labels and inputs inline in non-shrinking right-side control groups', () => {
    render(
      <DataQualityRuleEditor
        rule={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
          isApplicable: true,
        }}
        value={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
        }}
        disabled={false}
        showScopeLabel={false}
        onChange={vi.fn()}
      />
    );

    const row = screen.getByTestId('quality-rule-null_rate:field:["email"]');
    expect(row.firstElementChild).toHaveClass('items-center');

    const controls = screen.getByTestId('quality-rule-controls');
    expect(controls).toHaveClass('ml-auto', 'max-w-full', 'items-center', 'justify-end');

    const severity = screen.getByLabelText('Severity for Null rate');
    const severityGroup = severity.parentElement;
    expect(severityGroup).toHaveClass('flex', 'shrink-0', 'items-center');
    expect(within(severityGroup!).getByText('Severity')).toBeInTheDocument();

    const threshold = screen.getByLabelText('Null rate threshold percent');
    const thresholdGroup = threshold.parentElement;
    expect(thresholdGroup).toHaveClass('flex', 'shrink-0', 'items-center');
    expect(within(thresholdGroup!).getByText('Threshold, %')).toBeInTheDocument();
    expect(threshold).toHaveClass('w-36');
  });

  it('allows a percentage threshold to be cleared and replaced with a decimal value', () => {
    const onChange = vi.fn();
    render(
      <DataQualityRuleEditor
        rule={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 10 },
          isApplicable: true,
        }}
        value={{
          key: 'null_rate:field:["email"]',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldPath: ['email'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 10 },
        }}
        disabled={false}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Null rate threshold percent');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '3.5' } });
    expect(input).toHaveValue(3.5);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parameters: { thresholdPercent: 3.5 },
      })
    );
  });

  it('restores the last valid hours threshold when an empty input loses focus', () => {
    render(
      <DataQualityRuleEditor
        rule={{
          key: 'data_freshness:field:["updated_at"]',
          category: 'data_freshness',
          scope: { type: 'FIELD', fieldPath: ['updated_at'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdHours: 24 },
          isApplicable: true,
        }}
        value={{
          key: 'data_freshness:field:["updated_at"]',
          category: 'data_freshness',
          scope: { type: 'FIELD', fieldPath: ['updated_at'] },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdHours: 24 },
        }}
        disabled={false}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Data freshness threshold hours for updated_at');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    fireEvent.blur(input);
    expect(input).toHaveValue(24);
  });
});
