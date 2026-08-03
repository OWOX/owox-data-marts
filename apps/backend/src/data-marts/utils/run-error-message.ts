/**
 * Pulls the human-readable text out of a persisted run entry.
 *
 * `warning` is part of the chain because a failed run's `errors` array holds classified
 * warnings alongside genuine errors, and those carry their text under `warning` rather
 * than `error`. Without it they fall through to the raw JSON, which is what then reaches
 * customers in failure emails and MCP report status.
 */
export function extractRunErrorMessage(errorStr: string): string {
  try {
    const parsed = JSON.parse(errorStr) as Record<string, unknown>;
    const message = parsed['error'] ?? parsed['message'] ?? parsed['msg'] ?? parsed['warning'];
    return typeof message === 'string' ? message : errorStr;
  } catch {
    return errorStr;
  }
}
