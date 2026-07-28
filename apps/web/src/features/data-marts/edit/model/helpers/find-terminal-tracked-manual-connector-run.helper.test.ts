import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import {
  countSuccessfulManualConnectorRuns,
  findTerminalTrackedManualConnectorRun,
} from './find-terminal-tracked-manual-connector-run.helper';

describe('findTerminalTrackedManualConnectorRun', () => {
  it('tracks the exact connector run instead of a newer Data Quality row', () => {
    const qualityRun = createRun(
      'quality-newer',
      DataMartRunType.DATA_QUALITY,
      DataMartRunStatus.SUCCESS
    );
    const activeRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.RUNNING
    );
    const trackedRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS
    );

    expect(
      findTerminalTrackedManualConnectorRun([qualityRun, activeRun], trackedRun.id)
    ).toBeNull();
    expect(findTerminalTrackedManualConnectorRun([qualityRun, trackedRun], trackedRun.id)).toBe(
      trackedRun
    );
  });
});

describe('countSuccessfulManualConnectorRuns', () => {
  it('counts successful manual connector runs in the polled history', () => {
    const completedRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS
    );

    expect(countSuccessfulManualConnectorRuns([completedRun])).toBe(1);
  });
});

function createRun(
  id: string,
  type: DataMartRunType,
  status: DataMartRunStatus,
  triggerType = DataMartRunTriggerType.MANUAL
): DataMartRunItem {
  return {
    id,
    type,
    status,
    triggerType,
    createdAt: new Date('2026-07-16T12:00:00.000Z'),
  } as DataMartRunItem;
}
