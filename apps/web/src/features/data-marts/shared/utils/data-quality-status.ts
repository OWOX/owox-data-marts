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
import type { LucideIcon } from 'lucide-react';
import type {
  DataQualitySeverity,
  DataQualitySummaryState,
} from '../types/data-quality-summary.types';

export type DataQualityStatusTone =
  | 'neutral'
  | 'progress'
  | 'success'
  | 'warning'
  | 'error'
  | 'notice';

export type DataQualityStatusLabel =
  | 'Never run'
  | 'All checks disabled'
  | 'No applicable checks'
  | 'Queued'
  | 'Running'
  | 'Passed'
  | 'Issues found'
  | 'Run failed'
  | 'Cancelled';

interface DataQualityVisualSummary {
  state: DataQualitySummaryState;
  totalChecks?: number;
  notApplicableChecks?: number;
  noticeFindings?: number;
  warningFindings?: number;
  errorFindings?: number;
  highestSeverity?: DataQualitySeverity | null;
}

export interface DataQualityStatusVisual {
  icon: LucideIcon;
  isActive: boolean;
  label: DataQualityStatusLabel;
  tone: DataQualityStatusTone;
}

export const DATA_QUALITY_STATUS_TEXT_CLASSES: Record<DataQualityStatusTone, string> = {
  neutral: 'text-muted-foreground',
  progress: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
  notice: 'text-notice',
};

export const DATA_QUALITY_STATUS_BACKGROUND_CLASSES: Record<DataQualityStatusTone, string> = {
  neutral: 'bg-muted',
  progress: 'bg-brand-blue-50 dark:bg-brand-blue-950/40',
  success: 'bg-success-bg',
  warning: 'bg-warning-bg',
  error: 'bg-destructive-bg',
  notice: 'bg-notice-bg',
};

function hasNoApplicableChecks(summary: DataQualityVisualSummary): boolean {
  return (summary.totalChecks ?? 0) > 0 && summary.notApplicableChecks === summary.totalChecks;
}

function getHighestSeverity(summary: DataQualityVisualSummary): DataQualitySeverity | null {
  if ((summary.errorFindings ?? 0) > 0 || summary.highestSeverity === 'error') return 'error';
  if ((summary.warningFindings ?? 0) > 0 || summary.highestSeverity === 'warning') {
    return 'warning';
  }
  if ((summary.noticeFindings ?? 0) > 0 || summary.highestSeverity === 'notice') return 'notice';
  return null;
}

export function getDataQualityStatusVisual(
  summary: DataQualityVisualSummary
): DataQualityStatusVisual {
  if (summary.state === 'CANCELLED') {
    return { icon: ShieldBan, isActive: false, label: 'Cancelled', tone: 'neutral' };
  }
  if (hasNoApplicableChecks(summary)) {
    return {
      icon: ShieldMinus,
      isActive: false,
      label: 'No applicable checks',
      tone: 'neutral',
    };
  }

  switch (summary.state) {
    case 'NEVER_RUN':
      return { icon: Shield, isActive: false, label: 'Never run', tone: 'neutral' };
    case 'ALL_DISABLED':
      return {
        icon: ShieldOff,
        isActive: false,
        label: 'All checks disabled',
        tone: 'neutral',
      };
    case 'QUEUED':
      return { icon: LoaderCircle, isActive: true, label: 'Queued', tone: 'progress' };
    case 'RUNNING':
      return { icon: LoaderCircle, isActive: true, label: 'Running', tone: 'progress' };
    case 'PASSED':
      return { icon: ShieldCheck, isActive: false, label: 'Passed', tone: 'success' };
    case 'EXECUTION_FAILED':
      return { icon: ShieldX, isActive: false, label: 'Run failed', tone: 'error' };
    case 'ISSUES': {
      const severity = getHighestSeverity(summary);
      return {
        icon: ShieldAlert,
        isActive: false,
        label: 'Issues found',
        tone: severity ?? 'warning',
      };
    }
  }
}
