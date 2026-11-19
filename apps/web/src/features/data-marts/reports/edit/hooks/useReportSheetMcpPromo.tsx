import { useState, type ReactNode } from 'react';
import { useProjectRoute } from '../../../../../shared/hooks';
import { McpPromoCard, buildMcpPrompt, useIsMcpSetupPromoAvailable } from '../../../../mcp-promo';
import { useDataMartContext } from '../../../edit/model';
import { ReportFormMode } from '../../shared';

/** Undefined when nothing renders, so the sheet keeps its default focus. */
export function useReportSheetMcpPromo(
  mode: ReportFormMode,
  destinationId: string | undefined,
  reportId: string | undefined
): ReactNode | undefined {
  const { projectId } = useProjectRoute();
  const dataMartId = useDataMartContext().dataMart?.id;
  const isMcpAvailable = useIsMcpSetupPromoAvailable();
  const isCreate = mode === ReportFormMode.CREATE;
  // The sheet clears the report when it closes. Keep the last id, so the block does not
  // vanish while the sheet animates out.
  const [openedReportId, setOpenedReportId] = useState(reportId);
  if (reportId && reportId !== openedReportId) setOpenedReportId(reportId);
  const currentReportId = reportId ?? openedReportId;
  if (
    !projectId ||
    !dataMartId ||
    !isMcpAvailable ||
    !(isCreate ? destinationId : currentReportId)
  ) {
    return undefined;
  }

  const placement = isCreate ? 'report_sheet' : 'report_sheet_maintain';
  return (
    <McpPromoCard
      variant='section'
      placement={placement}
      mcpPart='setup'
      title={isCreate ? 'Set it up with your AI assistant' : 'Maintain it with your AI assistant'}
      prompt={buildMcpPrompt(placement, {
        projectId,
        dataMartId,
        destinationId,
        reportId: currentReportId,
      })}
    />
  );
}
