/**
 * Joins a relative in-app path onto the configured public origin, producing an absolute
 * URL a caller outside the app (e.g. an MCP client) can open directly. Shared across all
 * MCP tools that link into the web app UI — not specific to any one flow/domain.
 */
export function joinPublicOrigin(publicOrigin: string, path: string): string {
  return new URL(path, `${publicOrigin.replace(/\/+$/, '')}/`).toString();
}
