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
