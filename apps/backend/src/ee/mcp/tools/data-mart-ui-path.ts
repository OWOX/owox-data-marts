export function buildDataMartUiPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/data-setup`;
}

export function buildReportsUiPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/reports`;
}

export function buildDataDestinationsUiPath(projectId: string, destinationId?: string): string {
  const base = `/ui/${encodeURIComponent(projectId)}/data-destinations`;
  return destinationId ? `${base}?id=${encodeURIComponent(destinationId)}` : base;
}

export function buildReportSchedulesUiPath(projectId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/schedules`;
}
