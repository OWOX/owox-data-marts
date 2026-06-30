export function buildDataMartUiPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/data-setup`;
}

export function joinPublicOrigin(publicOrigin: string, path: string): string {
  return new URL(path, `${publicOrigin.replace(/\/+$/, '')}/`).toString();
}
