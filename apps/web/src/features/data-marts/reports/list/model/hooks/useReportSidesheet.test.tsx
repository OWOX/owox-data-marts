import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { REPORT_ID_URL_PARAM, useReportSidesheet } from './useReportSidesheet';

const report = {
  id: 'report-1',
  title: 'Weekly report',
  dataMart: { id: 'mart-1', title: 'Mart' },
  dataDestination: { id: 'destination-1', type: 'GOOGLE_SHEETS' },
} as unknown as DataMartReport;

function createWrapper(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function renderSidesheetHook(initialEntry: string, deepLinkReports?: DataMartReport[]) {
  return renderHook(
    () => ({
      sidesheet: useReportSidesheet(deepLinkReports ? { deepLinkReports } : undefined),
      searchParams: useSearchParams()[0],
    }),
    { wrapper: createWrapper(initialEntry) }
  );
}

describe('useReportSidesheet deep linking', () => {
  it('auto-opens the sidesheet for a matching reportId query param', () => {
    const { result } = renderSidesheetHook('/ui/project-1/data-marts/mart-1/reports?reportId=report-1', [
      report,
    ]);

    expect(result.current.sidesheet.isOpen).toBe(true);
    expect(result.current.sidesheet.editingReport?.id).toBe('report-1');
  });

  it('does not open the sidesheet when the reportId param matches none of the reports', () => {
    const { result } = renderSidesheetHook(
      '/ui/project-1/data-marts/mart-1/reports?reportId=unknown',
      [report]
    );

    expect(result.current.sidesheet.isOpen).toBe(false);
  });

  it('syncs the reportId param with open/close actions', () => {
    const { result } = renderSidesheetHook('/ui/project-1/data-marts/mart-1/reports', [report]);

    act(() => {
      result.current.sidesheet.handleEditReport(report);
    });
    expect(result.current.searchParams.get(REPORT_ID_URL_PARAM)).toBe('report-1');

    act(() => {
      result.current.sidesheet.handleCloseModal();
    });
    expect(result.current.searchParams.get(REPORT_ID_URL_PARAM)).toBeNull();
    expect(result.current.sidesheet.isOpen).toBe(false);
  });

  it('does not reopen the sidesheet from the same param after it was closed', () => {
    const { result } = renderSidesheetHook(
      '/ui/project-1/data-marts/mart-1/reports?reportId=report-1',
      [report]
    );

    act(() => {
      result.current.sidesheet.handleCloseModal();
    });

    expect(result.current.sidesheet.isOpen).toBe(false);
    expect(result.current.searchParams.get(REPORT_ID_URL_PARAM)).toBeNull();
  });

  it('leaves the URL untouched when deep linking is not enabled', () => {
    const { result } = renderSidesheetHook('/ui/project-1/data-marts/reports');

    act(() => {
      result.current.sidesheet.handleEditReport(report);
    });

    expect(result.current.sidesheet.isOpen).toBe(true);
    expect(result.current.searchParams.get(REPORT_ID_URL_PARAM)).toBeNull();
  });
});
