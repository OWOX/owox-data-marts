import { describe, expect, it } from 'vitest';
import {
  categorize,
  severityOf,
  categoryLabel,
  statusLabel,
  relabelStatusMessage,
  LogCategory,
  LogSeverity,
} from './log-category';

describe('categorize', () => {
  it('maps distinct legacy types directly (no eventType needed)', () => {
    expect(categorize('error', undefined, 'boom')).toBe(LogCategory.ERROR);
    expect(categorize('addWarningToCurrentStatus', undefined, 'careful')).toBe(LogCategory.WARNING);
    expect(categorize('updateCurrentStatus', undefined, '3')).toBe(LogCategory.STATUS);
    expect(categorize('updateLastRequstedDate', undefined, '2026-01-01')).toBe(LogCategory.STATE);
    expect(categorize('updateLastImportDate', undefined, '2026-01-01')).toBe(LogCategory.STATE);
    expect(categorize('updateCredentials', undefined, 'a, b')).toBe(LogCategory.CREDENTIALS);
    expect(categorize('unknown', undefined, 'x')).toBe(LogCategory.UNKNOWN);
  });

  it('splits the log bucket by eventType hint (new runs)', () => {
    expect(categorize('log', 'LOG', 'hello')).toBe(LogCategory.LOG);
    expect(categorize('log', 'TRACE', '[TRACE] http.request')).toBe(LogCategory.TRACE);
    expect(categorize('log', 'ANALYTICS', '[ANALYTICS] rows=1')).toBe(LogCategory.ANALYTICS);
    expect(categorize('log', 'CONTROL', '[CONTROL] started')).toBe(LogCategory.LIFECYCLE);
    expect(categorize('log', 'STATE', '[STATE] {}')).toBe(LogCategory.STATE);
  });

  it('splits the log bucket by message prefix when eventType is absent (history)', () => {
    expect(categorize('log', undefined, '[TRACE] http.request')).toBe(LogCategory.TRACE);
    expect(categorize('log', undefined, '[ANALYTICS] rows=1')).toBe(LogCategory.ANALYTICS);
    expect(categorize('log', undefined, '[CONTROL] started')).toBe(LogCategory.LIFECYCLE);
    expect(categorize('log', undefined, '[STATE] {}')).toBe(LogCategory.STATE);
    expect(categorize('log', undefined, 'plain info')).toBe(LogCategory.LOG);
  });

  it('falls back to UNKNOWN for missing/unrecognized types (non-connector runs)', () => {
    expect(categorize(null, undefined, 'plain string')).toBe(LogCategory.UNKNOWN);
    expect(categorize(undefined, undefined, 'plain string')).toBe(LogCategory.UNKNOWN);
    expect(categorize('somethingElse', undefined, 'x')).toBe(LogCategory.UNKNOWN);
  });

  it('prefers the eventType hint over the message prefix', () => {
    // A LOG.info whose message legitimately starts with bracket-like text must
    // stay LOG when the hint says LOG.
    expect(categorize('log', 'LOG', '[TRACE] not really a trace')).toBe(LogCategory.LOG);
  });
});

describe('severityOf', () => {
  it('maps categories to severities', () => {
    expect(severityOf(LogCategory.ERROR)).toBe(LogSeverity.ERROR);
    expect(severityOf(LogCategory.WARNING)).toBe(LogSeverity.WARN);
    expect(severityOf(LogCategory.TRACE)).toBe(LogSeverity.MUTED);
    expect(severityOf(LogCategory.ANALYTICS)).toBe(LogSeverity.MUTED);
    expect(severityOf(LogCategory.LOG)).toBe(LogSeverity.NORMAL);
    expect(severityOf(LogCategory.STATUS)).toBe(LogSeverity.NORMAL);
  });
});

describe('categoryLabel', () => {
  it('gives a human label per category', () => {
    expect(categoryLabel(LogCategory.WARNING)).toBe('Warning');
    expect(categoryLabel(LogCategory.TRACE)).toBe('Trace');
    expect(categoryLabel(LogCategory.CREDENTIALS)).toBe('Credentials');
  });
});

describe('statusLabel / relabelStatusMessage', () => {
  it('maps known numeric statuses to labels', () => {
    expect(statusLabel(1)).toBe('Import in progress');
    expect(statusLabel('3')).toBe('Import done');
    expect(statusLabel(5)).toBe('Error');
  });
  it('returns null for unknown/non-numeric statuses', () => {
    expect(statusLabel(99)).toBeNull();
    expect(statusLabel('abc')).toBeNull();
  });
  it('relabels only STATUS-type numeric messages, leaves others intact', () => {
    expect(relabelStatusMessage('updateCurrentStatus', '3')).toBe('Import done');
    expect(relabelStatusMessage('updateCurrentStatus', '99')).toBe('99');
    expect(relabelStatusMessage('log', '3')).toBe('3');
    expect(relabelStatusMessage('updateCurrentStatus', 'already text')).toBe('already text');
  });
});
