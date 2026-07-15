// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityRunHistoryDetails } from './DataQualityRunHistoryDetails';
import { useDataQualityRun } from '../../../data-quality/model/use-data-quality-workspace';

vi.mock('../../../data-quality/model/use-data-quality-workspace', () => ({
  useDataQualityRun: vi.fn(),
}));

describe('DataQualityRunHistoryDetails', () => {
  it('lazy-loads and renders the full snapshot, examples, and every executed SQL statement', () => {
    vi.mocked(useDataQualityRun).mockReturnValue({
      data: {
        id: 'quality-run-1',
        dataMartRunId: 'run-1',
        snapshot: {
          config: {
            timezone: 'Europe/Kiev',
            rules: [
              {
                key: 'negative_values:field:amount',
                category: 'negative_values',
                scope: { type: 'FIELD', fieldId: 'amount' },
                severity: 'warning',
                enabled: true,
                parameters: {},
                isApplicable: true,
              },
            ],
          },
          schema: { fields: [{ id: 'amount', type: 'NUMBER' }] },
          relationships: [{ id: 'rel-1', targetDataMartId: 'mart-2' }],
          timezone: 'Europe/Kiev',
        },
        summary: {
          state: 'ISSUES',
          enabledChecks: 1,
          totalChecks: 1,
          passedChecks: 0,
          failedChecks: 1,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 1,
          errorFindings: 0,
          violationCount: 2,
          highestSeverity: 'warning',
        },
        results: [
          {
            id: 'result-1',
            ruleKey: 'negative_values:field:amount',
            category: 'negative_values',
            scope: { type: 'FIELD', fieldId: 'amount' },
            severity: 'warning',
            status: 'FAILED',
            violationCount: 2,
            description: 'Negative values found',
            examples: [{ values: { amount: -10, id: 'A-1' } }],
            executedSql: [
              'SELECT COUNT(*) FROM source',
              'SELECT amount FROM source WHERE amount < 0',
            ],
            reproductionSql: 'SELECT * FROM source WHERE amount < 0',
            error: null,
            redacted: false,
          },
        ],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: '2026-07-15T12:00:01.000Z',
        finishedAt: '2026-07-15T12:00:10.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useDataQualityRun>);

    render(
      <DataQualityRunHistoryDetails projectId='project-1' dataMartId='mart-1' runId='run-1' />
    );

    expect(useDataQualityRun).toHaveBeenCalledWith('project-1', 'mart-1', 'run-1');
    expect(screen.getByText('Run snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Europe\/Kiev/)).toBeInTheDocument();
    expect(screen.getByText(/targetDataMartId/)).toBeInTheDocument();
    expect(screen.getByText(/A-1/)).toBeInTheDocument();
    expect(screen.getByText('Executed SQL (2)')).toBeInTheDocument();
    expect(screen.getByText('SELECT COUNT(*) FROM source')).toBeInTheDocument();
    expect(screen.getByText('SELECT amount FROM source WHERE amount < 0')).toBeInTheDocument();
    expect(screen.getByText('SELECT * FROM source WHERE amount < 0')).toBeInTheDocument();
  });
});
