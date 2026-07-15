import { describe, expect, it } from 'vitest';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import { canCancelDataMartRun } from './cancellable-runs';

describe('canCancelDataMartRun', () => {
  it('allows pending and running Data Quality runs to be cancelled', () => {
    expect(canCancelDataMartRun(DataMartRunType.DATA_QUALITY, DataMartRunStatus.PENDING)).toBe(
      true
    );
    expect(canCancelDataMartRun(DataMartRunType.DATA_QUALITY, DataMartRunStatus.RUNNING)).toBe(
      true
    );
    expect(canCancelDataMartRun(DataMartRunType.DATA_QUALITY, DataMartRunStatus.SUCCESS)).toBe(
      false
    );
  });
});
