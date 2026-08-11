import { describe, expect, it } from 'vitest';
import {
  getDisplayType,
  getRunSummaryParts,
  parseLogEntry,
  processJSONMessage,
  sortLogEntries,
} from './utils';
import { DataMartRunType } from '../../../shared';
import { LogLevel } from './types';
import type { DataMartRunItem } from '../../model';
import { LogCategory, LogSeverity } from './log-category';
import type { LogEntry } from './types';

describe('sortLogEntries', () => {
  const e = (id: string, sortTime: number): LogEntry => ({
    id,
    level: LogLevel.INFO,
    message: id,
    timestamp: 'N/A',
    category: LogCategory.LOG,
    severity: LogSeverity.NORMAL,
    sortTime,
  });

  it('desc: newer time first; within an equal-timestamp tie the later-emitted entry wins', () => {
    // a and b share the same ms (like a "MERGE completed" log + its rows_written
    // analytic emitted right after); a is inserted before b, c is later.
    const input = [e('a', 100), e('b', 100), e('c', 200)];
    expect(sortLogEntries(input, 'desc').map(x => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('asc: older time first; ties keep emission order', () => {
    const input = [e('a', 100), e('b', 100), e('c', 200)];
    expect(sortLogEntries(input, 'asc').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [e('a', 200), e('b', 100)];
    const snapshot = input.map(x => x.id);
    sortLogEntries(input, 'desc');
    expect(input.map(x => x.id)).toEqual(snapshot);
  });
});

// Verbatim entries from a persisted connector run. The backend stores logs/errors as
// raw JSON strings, so the message type is a cross-package string contract with no
// shared type to enforce it — these pin the parsing end of it.
// A warning carries only its message: it is customer-facing, and the connector logs the
// stack separately. An error carries the stack, which is why it is the one that exercises
// multi-line content surviving as a single entry.
const PERSISTED_WARNING =
  '{"type":"addWarningToCurrentStatus","at":"2026-07-27T14:16:21.365Z","warning":"HttpRequestException: Error validating access token: Session has expired."}';
const PERSISTED_ERROR =
  '{"type":"error","at":"2026-07-27T14:16:21.365Z","error":"ApiError: Syntax error: Unexpected end of script\\n    at FacebookMarketingSource._validateResponse (/app/index.cjs:436:11)"}';

describe('parseLogEntry', () => {
  it('renders a persisted warning envelope as WARNING, not ERROR', () => {
    // isError is true because it comes from the run's errors array
    const entry = parseLogEntry(PERSISTED_WARNING, 0, true);

    expect(entry.level).toBe(LogLevel.WARNING);
    expect(entry.message).toContain('Session has expired');
  });

  it('leads a warning with the readable message, not a stack frame', () => {
    // Failure emails render only the first 300 characters of this text
    const entry = parseLogEntry(PERSISTED_WARNING, 0, true);

    expect(entry.message.startsWith('HttpRequestException:')).toBe(true);
    expect(entry.message).not.toContain('    at ');
  });

  it('keeps the whole stack trace inside one entry', () => {
    const entry = parseLogEntry(PERSISTED_ERROR, 0, true);

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

  it('labels DATA_QUALITY runs and exposes their lightweight finding summary', () => {
    const run = {
      type: DataMartRunType.DATA_QUALITY,
      triggerType: 'manual',
      qualitySummary: {
        state: 'ISSUES',
        warningFindings: 2,
        errorFindings: 0,
        noticeFindings: 0,
      },
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual data quality run');
    expect(title).toBe('2 findings');
  });

  it('labels scheduled DATA_QUALITY runs through the existing Run History description', () => {
    const run = {
      type: DataMartRunType.DATA_QUALITY,
      triggerType: 'scheduled',
      qualitySummary: {
        state: 'PASSED',
        warningFindings: 0,
        errorFindings: 0,
        noticeFindings: 0,
      },
    } as unknown as DataMartRunItem;

    const [description] = getRunSummaryParts(run, null);

    expect(description).toBe('Scheduled data quality run');
  });

  it('labels a restricted DATA_QUALITY run', () => {
    const run = {
      type: DataMartRunType.DATA_QUALITY,
      triggerType: 'manual',
      qualitySummary: {
        state: 'RESTRICTED',
        warningFindings: 0,
        errorFindings: 0,
        noticeFindings: 0,
      },
    } as unknown as DataMartRunItem;

    const [, title] = getRunSummaryParts(run, null);

    expect(title).toBe('Restricted');
  });

  it('describes a wholly not-applicable Data Quality run without calling it passed', () => {
    const run = {
      type: DataMartRunType.DATA_QUALITY,
      triggerType: 'manual',
      qualitySummary: {
        state: 'PASSED',
        totalChecks: 4,
        passedChecks: 0,
        notApplicableChecks: 4,
        warningFindings: 0,
        errorFindings: 0,
        noticeFindings: 0,
      },
    } as unknown as DataMartRunItem;

    const [, title] = getRunSummaryParts(run, null);

    expect(title).toBe('Nothing to check · all not applicable');
  });
});

describe('parseLogEntry — category', () => {
  const at = '2026-05-02T12:00:00.000Z';

  it('categorizes a new-run TRACE log via the eventType hint', () => {
    const entry = parseLogEntry(
      JSON.stringify({ type: 'log', at, eventType: 'TRACE', message: '[TRACE] http.request' }),
      0
    );
    expect(entry.category).toBe(LogCategory.TRACE);
    expect(entry.severity).toBe(LogSeverity.MUTED);
    expect(entry.metadata?.eventType).toBe('TRACE');
    // eventType is lifted into metadata, not left as the display message.
    expect(entry.message).toBe('[TRACE] http.request');
  });

  it('categorizes a legacy warning by its type', () => {
    const entry = parseLogEntry(
      JSON.stringify({ type: 'addWarningToCurrentStatus', at, warning: 'careful' }),
      0
    );
    expect(entry.category).toBe(LogCategory.WARNING);
    expect(entry.severity).toBe(LogSeverity.WARN);
    expect(entry.message).toBe('careful');
  });

  it('categorizes an error entry from the errors array', () => {
    const entry = parseLogEntry(JSON.stringify({ type: 'error', at, error: 'boom' }), 0, true);
    expect(entry.category).toBe(LogCategory.ERROR);
    expect(entry.severity).toBe(LogSeverity.ERROR);
  });

  it('categorizes a historical TRACE via the message prefix (no eventType)', () => {
    const entry = parseLogEntry(
      JSON.stringify({ type: 'log', at, message: '[TRACE] http.request' }),
      0
    );
    expect(entry.category).toBe(LogCategory.TRACE);
  });

  it('falls back to UNKNOWN for a plain non-JSON line', () => {
    const entry = parseLogEntry('just a plain line', 0);
    expect(entry.category).toBe(LogCategory.UNKNOWN);
  });
});

describe('parseLogEntry — analytics fields', () => {
  const at = '2026-05-02T12:00:00.000Z';

  it('extracts analytics metric/value/node and keeps the message text clean', () => {
    const entry = parseLogEntry(
      JSON.stringify({
        type: 'log',
        at,
        eventType: 'ANALYTICS',
        metric: 'rows_written',
        value: 1234,
        tags: { node: 'campaigns' },
        message: '[ANALYTICS] rows_written=1234 {"node":"campaigns"}',
      }),
      0
    );
    expect(entry.category).toBe(LogCategory.ANALYTICS);
    expect(entry.metadata?.metric).toBe('rows_written');
    expect(entry.metadata?.value).toBe(1234);
    expect(entry.metadata?.node).toBe('campaigns');
    expect(entry.message).toBe('[ANALYTICS] rows_written=1234 {"node":"campaigns"}');
  });
});

describe('parseLogEntry — multiline timestamp/type/message format', () => {
  it('preserves analytics fields (metric/value/node) instead of dropping them', () => {
    const at = '2026-05-14T10:00:00.000Z';
    const messageJson = JSON.stringify({
      type: 'log',
      at,
      eventType: 'ANALYTICS',
      metric: 'rows_written',
      value: 1234,
      tags: { node: 'campaigns' },
      message: '[ANALYTICS] rows_written=1234',
    });
    const entry = parseLogEntry(`${at}\nlog\n${messageJson}`, 0);

    expect(entry.metadata?.metric).toBe('rows_written');
    expect(entry.metadata?.value).toBe(1234);
    expect(entry.metadata?.node).toBe('campaigns');
  });
});

describe('parseLogEntry sortTime', () => {
  it('sets sortTime to the parsed epoch of the ISO timestamp', () => {
    const at = '2026-05-14T10:00:00.000Z';
    const entry = parseLogEntry(`${at}\nlog\nhello`, 0);
    expect(entry.sortTime).toBe(Date.parse(at));
  });
  it('sets sortTime to 0 when there is no parseable time', () => {
    const entry = parseLogEntry('plain message with no timestamp', 0);
    expect(entry.sortTime).toBe(0);
  });
});

describe('processJSONMessage date extraction', () => {
  it('extracts date into metadata and keeps it as the message for REQUESTED_DATE', () => {
    const result = processJSONMessage(
      JSON.stringify({
        type: 'updateLastRequstedDate',
        at: '2026-05-14T00:00:00.000Z',
        date: '2026-05-14',
      })
    );
    expect(result.metadata?.date).toBe('2026-05-14');
    expect(result.metadata?.type).toBe('updateLastRequstedDate');
    expect(result.message).toBe('2026-05-14');
  });
});
