// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataQualityRunHistoryDetails } from './DataQualityRunHistoryDetails';
import { useDataQualityRun } from '../../../data-quality/model/use-data-quality-workspace';

vi.mock('../../../data-quality/model/use-data-quality-workspace', () => ({
  useDataQualityRun: vi.fn(),
}));

describe('DataQualityRunHistoryDetails', () => {
  it('lazy-loads a prioritized DQ report with progressive disclosure for results and snapshot', () => {
    vi.mocked(useDataQualityRun).mockReturnValue({
      data: {
        id: 'run-1',
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
              {
                key: 'column_uniqueness:field:customer_id',
                category: 'column_uniqueness',
                scope: { type: 'FIELD', fieldId: 'customer_id' },
                severity: 'error',
                enabled: false,
                parameters: {},
                isApplicable: true,
              },
            ],
          },
          schema: { fields: [{ id: 'amount', type: 'NUMBER' }] },
          relationships: [{ id: 'rel-1', targetDataMartId: 'mart-2' }],
          timezone: 'Europe/Kiev',
          definitionType: 'SQL',
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
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataQualityRun>);

    render(
      <MemoryRouter>
        <DataQualityRunHistoryDetails projectId='project-1' dataMartId='mart-1' runId='run-1' />
      </MemoryRouter>
    );

    expect(useDataQualityRun).toHaveBeenCalledWith('project-1', 'mart-1', 'run-1');
    expect(screen.getByRole('heading', { name: 'Run overview' })).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('9 sec')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.queryByText('1 failed')).not.toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText(/A-1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Negative values/ }));

    expect(screen.getByText(/A-1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Executed SQL (2)' })).toBeInTheDocument();
    expect(screen.queryByText('SELECT COUNT(*) FROM source')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Executed SQL (2)' }));

    expect(screen.getByText('SELECT COUNT(*) FROM source')).toBeInTheDocument();
    expect(screen.getByText('SELECT amount FROM source WHERE amount < 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy reproduction SQL' })).toBeInTheDocument();
    expect(screen.queryByText('SELECT * FROM source WHERE amount < 0')).not.toBeInTheDocument();

    expect(screen.getByText('Run snapshot')).toBeInTheDocument();
    expect(screen.getByText('Europe/Kiev')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run snapshot' }));

    expect(screen.getAllByText('Europe/Kiev')).toHaveLength(2);
    expect(screen.getAllByText('Negative values')).toHaveLength(2);
    expect(screen.queryByText('Column uniqueness')).not.toBeInTheDocument();
    expect(screen.queryByText(/targetDataMartId/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View raw JSON' }));

    expect(screen.queryByText(/targetDataMartId/)).not.toBeInTheDocument();
    expect(screen.queryByText(/column_uniqueness/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Data Quality' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/mart-1/quality'
    );
  });

  it('renders the requested older run results instead of the latest run results', () => {
    vi.mocked(useDataQualityRun).mockImplementation((_projectId, _dataMartId, runId) => {
      const isOlderRun = runId === 'run-older';
      return {
        data: buildRun(runId ?? '', isOlderRun ? 'Older run finding' : 'Latest run finding'),
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useDataQualityRun>;
    });

    const { rerender } = render(
      <MemoryRouter>
        <DataQualityRunHistoryDetails
          projectId='project-1'
          dataMartId='mart-1'
          runId='run-latest'
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Negative values/ }));
    expect(screen.getByText('Latest run finding')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <DataQualityRunHistoryDetails projectId='project-1' dataMartId='mart-1' runId='run-older' />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Negative values/ }));
    expect(screen.getByText('Older run finding')).toBeInTheDocument();
    expect(screen.queryByText('Latest run finding')).not.toBeInTheDocument();
    expect(useDataQualityRun).toHaveBeenLastCalledWith('project-1', 'mart-1', 'run-older');
  });

  it('shows relationship aliases and join fields from the historical run snapshot', () => {
    vi.mocked(useDataQualityRun).mockReturnValue({
      data: {
        id: 'run-relationship',
        dataMartRunId: 'run-relationship',
        snapshot: {
          config: { timezone: 'UTC', rules: [] },
          schema: null,
          relationships: [
            {
              id: 'rel-1',
              sourceDataMartId: 'mart-1',
              targetDataMartId: 'mart-orders',
              targetAlias: 'orders',
              joinConditions: [
                { sourceFieldName: 'customer_id', targetFieldName: 'id' },
                { sourceFieldName: 'region_id', targetFieldName: 'region_id' },
              ],
            },
          ],
          timezone: 'UTC',
          definitionType: 'TABLE',
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
            id: 'relationship-result',
            ruleKey: 'relationship_integrity:relationship:rel-1',
            category: 'relationship_integrity',
            scope: { type: 'RELATIONSHIP', relationshipId: 'rel-1' },
            severity: 'warning',
            status: 'FAILED',
            violationCount: 2,
            description: 'Missing target rows',
            examples: [],
            executedSql: [],
            reproductionSql: null,
            error: null,
            redacted: false,
          },
        ],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: '2026-07-15T12:00:01.000Z',
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataQualityRun>);

    render(
      <MemoryRouter>
        <DataQualityRunHistoryDetails
          projectId='project-1'
          dataMartId='mart-1'
          runId='run-relationship'
        />
      </MemoryRouter>
    );

    const resultCard = screen.getByTestId('quality-result-relationship-result');
    expect(screen.getByText('Relationship integrity · orders')).toBeInTheDocument();
    expect(screen.getByText('customer_id → id, region_id → region_id')).toBeInTheDocument();
    expect(screen.getByText('Relationship ID: rel-1')).toBeInTheDocument();
    expect(resultCard).toContainElement(screen.getByText('Relationship integrity · orders'));
  });

  it('keeps a detail-load failure local to the row and retries on demand', () => {
    const refetch = vi.fn();
    vi.mocked(useDataQualityRun).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('warehouse unavailable'),
      refetch,
    } as unknown as ReturnType<typeof useDataQualityRun>);

    render(
      <DataQualityRunHistoryDetails projectId='project-1' dataMartId='mart-1' runId='run-1' />
    );

    expect(
      screen.getByText(
        "Couldn't load the details of this run. The rest of the history is unaffected."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

function buildRun(runId: string, description: string) {
  return {
    id: runId,
    dataMartRunId: runId,
    summary: {
      state: 'ISSUES' as const,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: 0,
      failedChecks: 1,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 1,
      errorFindings: 0,
      violationCount: 1,
      highestSeverity: 'warning' as const,
    },
    results: [
      {
        id: `result-${runId}`,
        ruleKey: 'negative_values:field:amount',
        category: 'negative_values' as const,
        scope: { type: 'FIELD' as const, fieldId: 'amount' },
        severity: 'warning' as const,
        status: 'FAILED' as const,
        violationCount: 1,
        description,
        examples: [],
        executedSql: [],
        reproductionSql: null,
        error: null,
        redacted: false,
      },
    ],
    createdAt: '2026-07-15T12:00:00.000Z',
    startedAt: '2026-07-15T12:00:01.000Z',
    finishedAt: '2026-07-15T12:00:10.000Z',
  };
}
