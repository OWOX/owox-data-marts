// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityResultCard } from './DataQualityResultCard';
import type { DataQualityCheckResult } from '../model/types';

const result: DataQualityCheckResult = {
  id: 'result-1',
  dataQualityRunId: 'quality-run-1',
  ruleKey: 'negative_values:field:amount',
  category: 'negative_values',
  scope: { type: 'FIELD', fieldId: 'amount' },
  severity: 'warning',
  status: 'FAILED',
  violationCount: 7,
  description: 'Negative values were found',
  examples: [
    { values: { value: -5, order_id: 'A-1' } },
    { values: { value: -2, order_id: 'A-2' } },
    { values: { value: -1, order_id: 'A-3' } },
  ],
  executedSql: ['SELECT COUNT(*) FROM source WHERE amount < 0'],
  reproductionSql: 'SELECT * FROM source WHERE amount < 0',
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

  it('renders severity, violation count, three examples and executed SQL', () => {
    render(<DataQualityResultCard result={result} />);

    expect(screen.getByText('Negative values')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('7 violations')).toBeInTheDocument();
    expect(screen.getAllByTestId('quality-example')).toHaveLength(3);
    expect(screen.getByText(/A-1/)).toBeInTheDocument();
    expect(screen.getByText('Executed SQL (1)')).toBeInTheDocument();
  });

  it('copies the unlimited reproduction SQL', async () => {
    render(<DataQualityResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy SQL' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(result.reproductionSql);
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows a redaction message when relationship SQL and examples are omitted', () => {
    render(
      <DataQualityResultCard
        result={{
          ...result,
          category: 'relationship_integrity',
          scope: { type: 'RELATIONSHIP', relationshipId: 'relationship-1' },
          examples: [],
          executedSql: [],
          reproductionSql: null,
          redacted: true,
        }}
      />
    );

    expect(
      screen.getByText('SQL and examples are hidden because the target Data Mart is not visible.')
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
          executedSql: [],
          reproductionSql: null,
          redacted: false,
        }}
      />
    );

    expect(
      screen.queryByText('SQL and examples are hidden because the target Data Mart is not visible.')
    ).not.toBeInTheDocument();
  });
});
