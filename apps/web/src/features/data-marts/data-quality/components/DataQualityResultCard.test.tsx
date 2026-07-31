// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityResultCard } from './DataQualityResultCard';
import type { DataQualityCheckResult } from '../model/types';

const result: DataQualityCheckResult = {
  id: 'result-1',
  ruleKey: 'negative_values:field:["amount"]',
  category: 'negative_values',
  scope: { type: 'FIELD', fieldPath: ['amount'] },
  severity: 'warning',
  status: 'FAILED',
  violationCount: 7,
  description: 'Negative values were found',
  examples: [
    { values: { negative_value: -5, primary_key_value_1: 'A-1' } },
    { values: { negative_value: -2, primary_key_value_1: 'A-2' } },
    { values: { negative_value: -1, primary_key_value_1: 'A-3' } },
  ],
  sql: 'SELECT * FROM source WHERE amount < 0',
  error: null,
  redacted: false,
  createdAt: '2026-07-15T12:00:00.000Z',
};

describe('DataQualityResultCard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('keeps technical detail collapsed until requested and discloses SQL separately', () => {
    render(<DataQualityResultCard result={result} />);

    expect(screen.getByText('Negative values')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('7 violations')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-example')).not.toBeInTheDocument();
    expect(screen.queryByText('Negative values were found')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Negative values' }));

    expect(screen.getAllByTestId('quality-example')).toHaveLength(3);
    expect(screen.getByText(/A-1/)).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.queryByText(result.sql ?? '')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'SQL' }));

    expect(screen.getByText(result.sql ?? '')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'SQL for Negative values' })).toHaveAttribute(
      'tabindex',
      '0'
    );
  });

  it('does not repeat the technical run summary inside an expanded result', () => {
    render(<DataQualityResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.queryByText(result.description)).not.toBeInTheDocument();
  });

  it('keeps the check description in a hover and focus informer beside the result title', async () => {
    render(<DataQualityResultCard result={result} />);

    const card = screen.getByTestId('quality-result-result-1');
    expect(card).toHaveClass('group');

    const informer = within(card).getByRole('button', { name: 'About Negative values' });
    expect(informer).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    );
    expect(informer.previousElementSibling).toHaveTextContent('warning');

    fireEvent.focus(informer);

    const tooltips = await screen.findAllByRole('tooltip');
    expect(tooltips.find(tooltip => tooltip.dataset.slot === 'tooltip-content')).toHaveTextContent(
      'Finds numeric values below zero.'
    );
  });

  it.each([
    {
      name: 'not-applicable reason',
      result: {
        ...result,
        status: 'NOT_APPLICABLE' as const,
        violationCount: 0,
        description: 'The field is missing from the Output Schema',
        examples: [],
      },
    },
    {
      name: 'type-mismatch detail',
      result: {
        ...result,
        category: 'type_mismatch' as const,
        status: 'FAILED' as const,
        violationCount: 1,
        description: 'Actual type STRING does not match Output Schema type INTEGER',
        examples: [],
      },
    },
  ])('keeps a meaningful $name in the expanded result', ({ result: detailedResult }) => {
    render(<DataQualityResultCard result={detailedResult} />);

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText(detailedResult.description)).toBeInTheDocument();
  });

  it.each([
    ['error', 'destructive'],
    ['warning', 'warning'],
    ['notice', 'notice'],
  ] as const)('uses a border-only %s presentation for failed checks', (severity, tone) => {
    render(<DataQualityResultCard result={{ ...result, severity }} />);

    const card = screen.getByTestId('quality-result-result-1');
    expect(card).toHaveClass(`border-${tone}/40`);
    expect(card).not.toHaveClass(`bg-${tone}/5`, `bg-${tone}/10`);
    expect(screen.getByText(severity)).toHaveClass(
      `border-${tone}/40`,
      `bg-${tone}/10`,
      `text-${tone}`
    );
  });

  it('identifies a relationship by alias and join fields in the collapsed report card', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          category: 'relationship_integrity',
          scope: { type: 'RELATIONSHIP', relationshipId: 'relationship-1' },
        }}
        titleSuffix='orders'
        scopeLabel='customer_id → id'
        scopeDetails={['Relationship ID: relationship-1']}
      />
    );

    expect(screen.getByText('Relationship integrity · orders')).toBeInTheDocument();
    expect(screen.getByText('customer_id → id')).toBeInTheDocument();
    expect(screen.getByText('Relationship ID: relationship-1')).toBeInTheDocument();
  });

  it('copies the exact SQL shown in the card', async () => {
    render(<DataQualityResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Negative values' }));
    fireEvent.click(screen.getByRole('button', { name: 'SQL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy SQL' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(result.sql);
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByText(result.sql ?? '')).toBeInTheDocument();
  });

  it('distinguishes an execution failure from a data finding', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          status: 'ERROR',
          violationCount: 0,
          error: { code: 'WAREHOUSE_ERROR', message: 'Query timed out', details: null },
        }}
      />
    );

    expect(screen.getByText('Execution error')).not.toHaveClass('sr-only');
    expect(screen.getByTestId('quality-result-result-1')).toHaveClass('border-destructive/40');
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Negative values' }));
    expect(screen.getByText("Execution error — this check didn't run")).toBeInTheDocument();
    expect(screen.getByText('Query timed out')).toBeInTheDocument();
  });

  it('does not show finding severity when a check passed', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          status: 'PASSED',
          violationCount: 0,
          examples: [],
        }}
      />
    );

    expect(screen.getByText('Passed')).toHaveClass('sr-only');
    expect(screen.getByTestId('quality-result-result-1')).toHaveClass('border-success/40');
    expect(screen.getByTestId('quality-result-result-1')).not.toHaveClass(
      'bg-success/5',
      'bg-success/10'
    );
    expect(screen.queryByText('warning')).not.toBeInTheDocument();
  });

  it('keeps the Not applicable label visible on a neutral card', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          status: 'NOT_APPLICABLE',
          violationCount: 0,
          examples: [],
        }}
      />
    );

    expect(screen.getByText('Not applicable')).not.toHaveClass('sr-only');
    expect(screen.getByTestId('quality-result-result-1')).not.toHaveClass(
      'border-success/40',
      'border-destructive/40',
      'border-warning/40',
      'border-notice/40'
    );
  });

  it('shows a redaction message when relationship SQL and examples are omitted', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          category: 'relationship_integrity',
          scope: { type: 'RELATIONSHIP', relationshipId: 'relationship-1' },
          examples: [],
          sql: null,
          redacted: true,
        }}
        targetAlias='orders'
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show details for Relationship integrity' })
    );
    expect(
      screen.getByText(
        "SQL and examples are hidden because you don't have access to the target Data Mart orders. The counts above are still accurate."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy SQL' })).not.toBeInTheDocument();
  });

  it('does not infer access redaction from naturally empty relationship output', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          category: 'relationship_integrity',
          scope: { type: 'RELATIONSHIP', relationshipId: 'relationship-1' },
          status: 'NOT_APPLICABLE',
          examples: [],
          sql: null,
          redacted: false,
        }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show details for Relationship integrity' })
    );
    expect(screen.queryByText(/SQL and examples are hidden because/)).not.toBeInTheDocument();
  });
});
