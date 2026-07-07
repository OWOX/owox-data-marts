export function buildDataMartUiPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/data-setup`;
}

export function buildReportsUiPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/reports`;
}
