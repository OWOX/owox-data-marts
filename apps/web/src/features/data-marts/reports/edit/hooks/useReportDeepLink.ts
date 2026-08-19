import { useProjectRoute } from '../../../../../shared/hooks';
import { REPORT_ID_URL_PARAM } from '../../list/model/hooks';
import type { DataMartReport } from '../../shared/model/types/data-mart-report';

/**
 * Builds a shareable deep link that opens the Data Mart Reports tab
 * with the given report sidesheet already open.
 * Returns null when there is no report to link to or the project is unresolved.
 */
export function useReportDeepLink(report: DataMartReport | undefined | null): string | null {
  const { scope, projectId } = useProjectRoute();

  if (!report || !projectId) {
    return null;
  }

  return `${window.location.origin}${scope(
    `/data-marts/${encodeURIComponent(report.dataMart.id)}/reports?${REPORT_ID_URL_PARAM}=${encodeURIComponent(report.id)}`
  )}`;
}
