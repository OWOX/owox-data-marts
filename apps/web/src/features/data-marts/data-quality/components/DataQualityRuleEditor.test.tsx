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
          key: 'null_rate:field:email',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldId: 'email' },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
          isApplicable: true,
        }}
        value={{
          key: 'null_rate:field:email',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldId: 'email' },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
        }}
        disabled={false}
        showScopeLabel={false}
        onChange={vi.fn()}
      />
    );

    const row = screen.getByTestId('quality-rule-null_rate:field:email');
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
          key: 'null_rate:field:email',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldId: 'email' },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
          isApplicable: true,
        }}
        value={{
          key: 'null_rate:field:email',
          category: 'null_rate',
          scope: { type: 'FIELD', fieldId: 'email' },
          severity: 'warning',
          enabled: true,
          parameters: { thresholdPercent: 0 },
        }}
        disabled={false}
        showScopeLabel={false}
        onChange={vi.fn()}
      />
    );

    const row = screen.getByTestId('quality-rule-null_rate:field:email');
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
});
