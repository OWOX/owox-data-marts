import {
  LoaderCircle,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ShieldMinus,
  ShieldOff,
  ShieldX,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getDataQualityStatusVisual } from './data-quality-status';

describe('getDataQualityStatusVisual', () => {
  it.each([
    [
      'never run',
      { state: 'NEVER_RUN' as const },
      { icon: Shield, isActive: false, label: 'Never run', tone: 'neutral' },
    ],
    [
      'all disabled',
      { state: 'ALL_DISABLED' as const },
      { icon: ShieldOff, isActive: false, label: 'All checks disabled', tone: 'neutral' },
    ],
    [
      'queued',
      { state: 'QUEUED' as const },
      { icon: LoaderCircle, isActive: true, label: 'Queued', tone: 'progress' },
    ],
    [
      'running',
      { state: 'RUNNING' as const },
      { icon: LoaderCircle, isActive: true, label: 'Running', tone: 'progress' },
    ],
    [
      'passed',
      { state: 'PASSED' as const },
      { icon: ShieldCheck, isActive: false, label: 'Passed', tone: 'success' },
    ],
    [
      'critical findings',
      { state: 'ISSUES' as const, errorFindings: 1 },
      { icon: ShieldAlert, isActive: false, label: 'Issues found', tone: 'error' },
    ],
    [
      'warning findings',
      { state: 'ISSUES' as const, warningFindings: 1 },
      { icon: ShieldAlert, isActive: false, label: 'Issues found', tone: 'warning' },
    ],
    [
      'notice findings',
      { state: 'ISSUES' as const, noticeFindings: 1 },
      { icon: ShieldAlert, isActive: false, label: 'Issues found', tone: 'notice' },
    ],
    [
      'issues without a finding severity',
      { state: 'ISSUES' as const },
      { icon: ShieldAlert, isActive: false, label: 'Issues found', tone: 'warning' },
    ],
    [
      'execution failed',
      { state: 'EXECUTION_FAILED' as const },
      { icon: ShieldX, isActive: false, label: 'Run failed', tone: 'error' },
    ],
    [
      'restricted',
      { state: 'RESTRICTED' as const },
      { icon: ShieldBan, isActive: false, label: 'Restricted', tone: 'warning' },
    ],
    [
      'cancelled',
      { state: 'CANCELLED' as const, errorFindings: 1 },
      { icon: ShieldBan, isActive: false, label: 'Cancelled', tone: 'neutral' },
    ],
    [
      'no applicable checks',
      { state: 'PASSED' as const, totalChecks: 2, notApplicableChecks: 2 },
      { icon: ShieldMinus, isActive: false, label: 'No applicable checks', tone: 'neutral' },
    ],
    [
      'cancelled with only not-applicable results',
      { state: 'CANCELLED' as const, totalChecks: 2, notApplicableChecks: 2 },
      { icon: ShieldBan, isActive: false, label: 'Cancelled', tone: 'neutral' },
    ],
  ])('maps %s to the canonical visual', (_name, summary, expected) => {
    expect(getDataQualityStatusVisual(summary)).toEqual(expected);
  });

  it('uses the highest finding severity regardless of a stale lower summary severity', () => {
    expect(
      getDataQualityStatusVisual({
        state: 'ISSUES',
        errorFindings: 1,
        warningFindings: 1,
        noticeFindings: 1,
        highestSeverity: 'notice',
      }).tone
    ).toBe('error');
  });
});
