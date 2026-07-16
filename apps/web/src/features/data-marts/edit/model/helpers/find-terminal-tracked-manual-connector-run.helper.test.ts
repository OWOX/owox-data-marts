import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import {
  countSuccessfulManualConnectorRuns,
  findTerminalTrackedManualConnectorRun,
} from './find-terminal-tracked-manual-connector-run.helper';

describe('findTerminalTrackedManualConnectorRun', () => {
  it('waits for the tracked connector while a newer Data Quality run is terminal', () => {
    const result = findTerminalTrackedManualConnectorRun(
      [
        createRun('quality-newer', DataMartRunType.DATA_QUALITY, DataMartRunStatus.SUCCESS),
        createRun('connector-tracked', DataMartRunType.CONNECTOR, DataMartRunStatus.RUNNING),
      ],
      'connector-tracked'
    );

    expect(result).toBeNull();
  });

  it('returns the exact terminal connector independent of list order and tied timestamps', () => {
    const trackedRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS
    );
    const result = findTerminalTrackedManualConnectorRun(
      [
        createRun('old-connector', DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS),
        createRun('quality-newer', DataMartRunType.DATA_QUALITY, DataMartRunStatus.SUCCESS),
        trackedRun,
      ],
      trackedRun.id
    );

    expect(result).toBe(trackedRun);
  });

  it('waits when the tracked run is not in the current history page', () => {
    const result = findTerminalTrackedManualConnectorRun(
      [createRun('old-connector', DataMartRunType.CONNECTOR, DataMartRunStatus.SUCCESS)],
      'connector-tracked'
    );

    expect(result).toBeNull();
  });

  it.each([
    [DataMartRunType.DATA_QUALITY, DataMartRunTriggerType.MANUAL],
    [DataMartRunType.CONNECTOR, DataMartRunTriggerType.SCHEDULED],
  ])('ignores an exact terminal run with type %s and trigger %s', (type, triggerType) => {
    const result = findTerminalTrackedManualConnectorRun(
      [createRun('tracked', type, DataMartRunStatus.SUCCESS, triggerType)],
      'tracked'
    );

    expect(result).toBeNull();
  });
});

describe('countSuccessfulManualConnectorRuns', () => {
  it('includes an exact completed run that is outside the current history page', () => {
    const completedRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS
    );

    expect(
      countSuccessfulManualConnectorRuns(
        [createRun('older-failed', DataMartRunType.CONNECTOR, DataMartRunStatus.FAILED)],
        completedRun
      )
    ).toBe(1);
  });

  it('counts the exact completed run only once when it is already in history', () => {
    const completedRun = createRun(
      'connector-tracked',
      DataMartRunType.CONNECTOR,
      DataMartRunStatus.SUCCESS
    );

    expect(countSuccessfulManualConnectorRuns([completedRun], completedRun)).toBe(1);
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
