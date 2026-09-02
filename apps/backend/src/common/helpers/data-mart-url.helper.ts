/**
 * Helper functions for building DataMart URLs
 */

/**
 * Builds a URL to a data mart or data marts list
 *
 * @param baseUrl - The base URL (e.g., https://example.com or http://localhost:3000)
 * @param projectId - The project ID
 * @param dataMartId - Optional data mart ID. If not provided, returns URL to the data marts list
 * @param tab - Optional tab path (e.g., '/run-history', '/reports'). Will be appended after dataMartId if provided
 * @returns The complete URL
 *
 * @example
 * // Data mart detail page
 * buildDataMartUrl('https://example.com', 'proj-123', 'dm-456')
 * // Returns: 'https://example.com/ui/proj-123/data-marts/dm-456'
 *
 * @example
 * // Data mart with tab
 * buildDataMartUrl('https://example.com', 'proj-123', 'dm-456', '/run-history')
 * // Returns: 'https://example.com/ui/proj-123/data-marts/dm-456/run-history'
 *
 * @example
 * // Data marts list (no dataMartId)
 * buildDataMartUrl('https://example.com', 'proj-123')
 * // Returns: 'https://example.com/ui/proj-123/data-marts'
 */
export function buildDataMartUrl(
  baseUrl: string,
  projectId: string,
  dataMartId?: string,
  tab?: string
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash if present
  const normalizedTab = tab ? (tab.startsWith('/') ? tab : `/${tab}`) : '';

  if (dataMartId) {
    return `${normalizedBaseUrl}/ui/${projectId}/data-marts/${dataMartId}${normalizedTab}`;
  }

  return `${normalizedBaseUrl}/ui/${projectId}/data-marts`;
}

/**
 * Query parameter the web UI reads to open a report's sidesheet on the
 * Data Mart Reports tab. Kept in sync with `REPORT_ID_URL_PARAM` in
 * `apps/web` — the deep link behind the report sidesheet's "Copy link".
 */
const REPORT_ID_URL_PARAM = 'reportId';

/**
 * Builds a deep link that opens the Data Mart Reports tab with the given
 * report's sidesheet already expanded — the same link the report sidesheet
 * offers under "Copy link".
 *
 * @param baseUrl - The base URL (e.g., https://example.com or http://localhost:3000)
 * @param projectId - The project ID
 * @param dataMartId - The ID of the Data Mart the report belongs to
 * @param reportId - The report ID
 * @returns The complete URL
 *
 * @example
 * buildReportUrl('https://example.com', 'proj-123', 'dm-456', 'rep-789')
 * // Returns: 'https://example.com/ui/proj-123/data-marts/dm-456/reports?reportId=rep-789'
 */
export function buildReportUrl(
  baseUrl: string,
  projectId: string,
  dataMartId: string,
  reportId: string
): string {
  const reportsUrl = buildDataMartUrl(baseUrl, projectId, dataMartId, '/reports');
  return `${reportsUrl}?${REPORT_ID_URL_PARAM}=${encodeURIComponent(reportId)}`;
}
