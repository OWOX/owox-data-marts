import type { ConnectorTestResultDto } from '../api/types';
import { asText } from './asText';

/** A test that an AI assistant prepared: `get_custom_connector_test_link` writes these. */
export interface BuilderTestPrefill {
  node: string;
  values: Record<string, string>;
  credentialId?: string;
  maxRows?: number;
}

const MAX_TEST_ROWS = 1000;

/** Reads `?test=<node>&credential=<id>&rows=<n>&config=<JSON>` from a Builder link. */
export function testPrefillFrom(params: URLSearchParams): BuilderTestPrefill | undefined {
  const node = params.get('test');
  if (!node) return undefined;
  let values: Record<string, string> = {};
  try {
    const config: unknown = JSON.parse(params.get('config') ?? '{}');
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      values = Object.fromEntries(
        Object.entries(config).map(([name, value]) => [name, asText(value)])
      );
    }
  } catch {
    /* A link cut short still opens the test; the user fills in the values. */
  }
  const rows = Number(params.get('rows'));
  // The test API takes 1..1000 rows; a hand-edited link must not block every run.
  return {
    node,
    values,
    ...(params.get('credential') ? { credentialId: params.get('credential') ?? '' } : {}),
    ...(Number.isInteger(rows) && rows > 0 ? { maxRows: Math.min(rows, MAX_TEST_ROWS) } : {}),
  };
}

const MAX_CHAT_ROWS = 25;
const MAX_CHAT_SAMPLE = 5;
const MAX_CHAT_LOG_LINES = 50;
const MAX_CHAT_LOG_LINE = 500;

/**
 * The test result as text to paste into an AI chat: what was tested, then a bounded JSON body.
 * The server masks Credential values; `secrets` are the key values typed in the test settings.
 */
export function testResultForChat(input: {
  connectorId: string | null;
  connectorName: string;
  version: number | null;
  unsavedEdits: boolean;
  node: string;
  result: ConnectorTestResultDto;
  secrets: string[];
}): string {
  const { result } = input;
  const logs = result.logs
    .slice(-MAX_CHAT_LOG_LINES)
    .map(line =>
      line.length > MAX_CHAT_LOG_LINE ? `${line.slice(0, MAX_CHAT_LOG_LINE)}… [cut]` : line
    );
  const body = {
    error: result.error,
    rows: result.rows.slice(0, MAX_CHAT_ROWS),
    ...(result.rows.length > MAX_CHAT_ROWS
      ? { rowsNotShown: result.rows.length - MAX_CHAT_ROWS }
      : {}),
    sample: (result.sample ?? []).slice(0, MAX_CHAT_SAMPLE),
    logs:
      result.logs.length > logs.length
        ? [`… ${result.logs.length - logs.length} earlier log lines not shown`, ...logs]
        : logs,
  };
  const text = [
    'OWOX Connector Builder test result',
    `Connector: ${input.connectorName} (${input.connectorId ?? 'not saved'}), version ${input.version ?? 'none'}${input.unsavedEdits ? ', with unsaved edits' : ''}`,
    `Node: ${input.node}`,
    `Status: ${result.error ? 'error' : `OK, ${result.rows.length} rows`}`,
    '```json',
    JSON.stringify(body, null, 2),
    '```',
  ].join('\n');
  // A value is in the text as typed, JSON-escaped and URL-encoded. Longest first, so a secret
  // that starts with a shorter one is not left half masked.
  return input.secrets
    .filter(secret => secret.length >= 4)
    .flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)])
    .sort((a, b) => b.length - a.length)
    .reduce((masked, secret) => masked.split(secret).join('[REDACTED]'), text);
}
