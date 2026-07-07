/**
 * Path for the minimal, chrome-free "Connect Google Sheets" page (ConnectFlowLayout in the
 * web app) — an authenticated, project-scoped page: opening it relies entirely on the
 * normal OWOX sign-in/project-membership guards, no token is embedded in the URL. The route
 * itself isn't MCP-specific (it's a generic "connect" flow any external client can link to)
 * — only this function, which the add_destination MCP tool uses to build the link, is.
 *
 * Deliberately takes no title/name option: the page never pre-fills its Title field from the
 * URL — a query param isn't proof of what the caller actually intends, and displaying or
 * pre-filling untrusted content from a link is exactly the kind of risk this flow avoids.
 * The user always sets the name directly in the form instead.
 */
export function buildConnectGoogleSheetsUiPath(projectId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/connect/google-sheets`;
}
