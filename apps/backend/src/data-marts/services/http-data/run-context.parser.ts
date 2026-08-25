import { RunContextSchema, type RunContext } from '../../dto/schemas/http-data-run-metadata.schema';

/**
 * Carries which workbook and worksheet a pulled run wrote into.
 *
 * A header rather than a query parameter: the endpoint validates its query strictly and refuses
 * what it does not recognise, and this describes the caller rather than the data being asked
 * for — which also keeps worksheet names out of request logs.
 */
export const RUN_CONTEXT_HEADER = 'x-owox-run-context';

/** Base64, because headers carry bytes and a worksheet may well be named outside ASCII. */
function decodeBase64Json(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

/**
 * Reads the header, or gives up quietly.
 *
 * Every failure is the same answer: no context. The value is a note about where a run happened,
 * so a malformed one must never cost the run its rows — a client on an older build, a truncating
 * proxy, or someone typing a header by hand are all reasons to record less, not to refuse the
 * request.
 *
 * Nothing here is trusted. The schema caps every length because a worksheet name is whatever a
 * user typed, and this is a path from their keyboard into everyone else's run history.
 */
export function parseRunContext(headerValue: string | undefined): RunContext | undefined {
  if (!headerValue) return undefined;

  try {
    const parsed = RunContextSchema.safeParse(decodeBase64Json(headerValue));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
