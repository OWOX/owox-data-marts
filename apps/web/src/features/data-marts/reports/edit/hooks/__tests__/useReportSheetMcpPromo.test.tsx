import { isValidElement } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportFormMode } from '../../../shared';
import { useReportSheetMcpPromo } from '../useReportSheetMcpPromo';

vi.mock('../../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ projectId: 'project-1' }),
}));
vi.mock('../../../../edit/model', () => ({
  useDataMartContext: () => ({ dataMart: { id: 'data-mart-1' } }),
}));
vi.mock('../../../../../mcp-promo', () => ({
  useIsMcpSetupPromoAvailable: () => true,
  McpPromoCard: () => null,
  buildMcpPrompt: (placement: string, ids: { reportId?: string }) =>
    `${placement} ${ids.reportId ?? ''}`,
}));

interface Props {
  mode: ReportFormMode;
  reportId?: string;
}

function promptOf(element: unknown) {
  return isValidElement<{ prompt: string }>(element) ? element.props.prompt : undefined;
}

describe('useReportSheetMcpPromo', () => {
  it('keeps the maintain block while the sheet clears the report at close', () => {
    const { result, rerender } = renderHook(
      ({ mode, reportId }: Props) => useReportSheetMcpPromo(mode, 'destination-1', reportId),
      { initialProps: { mode: ReportFormMode.EDIT, reportId: 'report-1' } as Props }
    );
    expect(promptOf(result.current)).toBe('report_sheet_maintain report-1');

    rerender({ mode: ReportFormMode.EDIT, reportId: undefined });
    expect(promptOf(result.current)).toBe('report_sheet_maintain report-1');

    rerender({ mode: ReportFormMode.EDIT, reportId: 'report-2' });
    expect(promptOf(result.current)).toBe('report_sheet_maintain report-2');
  });

  it('returns nothing for an edit sheet that never had a report', () => {
    const { result } = renderHook(() =>
      useReportSheetMcpPromo(ReportFormMode.EDIT, 'destination-1', undefined)
    );
    expect(result.current).toBeUndefined();
  });
});
