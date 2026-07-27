import { describe, expect, it } from 'vitest';
import { getDisplayType, getRunSummaryParts, parseLogEntry } from './utils';
import { DataMartRunType } from '../../../shared';
import { LogLevel } from './types';
import type { DataMartRunItem } from '../../model';

// Verbatim entries from a persisted connector run. The backend stores logs/errors as
// raw JSON strings, so the message type is a cross-package string contract with no
// shared type to enforce it — these pin the parsing end of it.
const PERSISTED_WARNING =
  '{"type":"addWarningToCurrentStatus","at":"2026-07-27T14:16:21.365Z","warning":"HttpRequestException: Error validating access token: Session has expired.\\n    at FacebookMarketingSource._validateResponse (/app/index.cjs:436:11)"}';
const PERSISTED_ERROR =
  '{"type":"error","at":"2026-07-27T14:16:21.365Z","error":"ApiError: Syntax error: Unexpected end of script"}';

describe('parseLogEntry', () => {
  it('renders a persisted warning envelope as WARNING, not ERROR', () => {
    // isError is true because it comes from the run\'s errors array
    const entry = parseLogEntry(PERSISTED_WARNING, 0, true);

    expect(entry.level).toBe(LogLevel.WARNING);
    expect(entry.message).toContain('Session has expired');
  });

  it('keeps the whole stack trace inside one entry', () => {
    const entry = parseLogEntry(PERSISTED_WARNING, 0, true);

    expect(entry.message).toContain('at FacebookMarketingSource._validateResponse');
  });

  it('still renders a persisted error envelope as ERROR', () => {
    const entry = parseLogEntry(PERSISTED_ERROR, 0, true);

    expect(entry.level).toBe(LogLevel.ERROR);
  });

  it('labels warnings for display without leaking the raw message type', () => {
    expect(getDisplayType(parseLogEntry(PERSISTED_WARNING, 0, true))).toBe('Warning');
  });
});

describe('getRunSummaryParts', () => {
  it('labels HTTP_DATA runs as "HTTP Data" with no report title', () => {
    const run = {
      type: DataMartRunType.HTTP_DATA,
      triggerType: 'manual',
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual HTTP Data run');
    expect(title).toBe('');
  });

  it('labels MCP_QUERY runs as "MCP query" with no report title', () => {
    const run = {
      type: DataMartRunType.MCP_QUERY,
      triggerType: 'manual',
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual MCP query run');
    expect(title).toBe('');
  });
});
