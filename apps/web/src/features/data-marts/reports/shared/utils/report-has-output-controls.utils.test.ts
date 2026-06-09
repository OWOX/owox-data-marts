import { describe, expect, it } from 'vitest';
import { reportHasOutputControls } from './report-has-output-controls.utils';
import type { DataMartReport } from '../model/types/data-mart-report';

function makeReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'r1',
    title: 'Test Report',
    dataMart: { id: 'dm1', title: 'Test Data Mart' },
    dataDestination: {} as any,
    destinationConfig: {} as any,
    columnConfig: null,
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    lastRunDate: null,
    lastRunStatus: null,
    lastRunError: null,
    runsCount: 0,
    createdAt: new Date(),
    modifiedAt: new Date(),
    canRun: true,
    canManageTriggers: true,
    canEditConfig: true,
    ...overrides,
  };
}

describe('reportHasOutputControls', () => {
  it('returns false when all configs are null', () => {
    expect(reportHasOutputControls(makeReport())).toBe(false);
  });

  it('returns false when filterConfig and sortConfig are empty arrays', () => {
    expect(reportHasOutputControls(makeReport({ filterConfig: [], sortConfig: [] }))).toBe(false);
  });

  it('returns true when filterConfig has items', () => {
    expect(
      reportHasOutputControls(
        makeReport({ filterConfig: [{ field: 'x', operator: 'eq', value: '1' } as any] })
      )
    ).toBe(true);
  });

  it('returns true when sortConfig has items', () => {
    expect(
      reportHasOutputControls(makeReport({ sortConfig: [{ field: 'x', direction: 'asc' } as any] }))
    ).toBe(true);
  });

  it('returns true when limitConfig is set', () => {
    expect(reportHasOutputControls(makeReport({ limitConfig: 100 }))).toBe(true);
  });
});
