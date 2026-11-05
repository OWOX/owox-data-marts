import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartContext } from '../../model/context/context';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import { DataMartStatus } from '../../../shared/enums';
import { useRunAfterSave } from './useRunAfterSave';

const configured = { projectId: 'project', location: 'US' };

function renderInDataMart({
  status = DataMartStatus.PUBLISHED,
  config = configured,
  hasActiveRuns = false,
  publishDataMart = vi.fn().mockResolvedValue(undefined),
}: {
  status?: DataMartStatus;
  config?: Record<string, string>;
  hasActiveRuns?: boolean;
  publishDataMart?: ReturnType<typeof vi.fn>;
} = {}) {
  const context = {
    dataMart: {
      id: 'dm-1',
      status: { code: status },
      storage: { type: DataStorageType.GOOGLE_BIGQUERY, config },
    },
    hasActiveRuns,
    publishDataMart,
    runDataMart: vi.fn().mockResolvedValue('run-1'),
    getDataMartRuns: vi.fn().mockResolvedValue([]),
  };
  const wrapper = ({ children }: PropsWithChildren) => (
    <DataMartContext.Provider value={context as never}>{children}</DataMartContext.Provider>
  );
  return { context, result: renderHook(() => useRunAfterSave(), { wrapper }).result };
}

describe('useRunAfterSave', () => {
  it('offers Save & Run for a configured Storage with no active run', () => {
    expect(renderInDataMart().result.current.canRunAfterSave).toBe(true);
  });

  it('reports a draft Data Mart so Save & Run is the main action', () => {
    expect(renderInDataMart({ status: DataMartStatus.DRAFT }).result.current.isDraft).toBe(true);
  });

  it('reports a published Data Mart as not a draft', () => {
    expect(renderInDataMart().result.current.isDraft).toBe(false);
  });

  it('does not offer Save & Run for an unconfigured Storage', () => {
    const { result } = renderInDataMart({ config: { projectId: '', location: '' } });

    expect(result.current.canRunAfterSave).toBe(false);
  });

  it('does not offer Save & Run while a run is active', () => {
    expect(renderInDataMart({ hasActiveRuns: true }).result.current.canRunAfterSave).toBe(false);
  });

  it('does not offer Save & Run outside a Data Mart and runs nothing there', async () => {
    const { result } = renderHook(() => useRunAfterSave());

    expect(result.current.canRunAfterSave).toBe(false);
    await expect(result.current.runSavedDataMart()).resolves.toBeUndefined();
  });

  it('publishes a draft and refreshes its runs instead of starting a run', async () => {
    const { context, result } = renderInDataMart({ status: DataMartStatus.DRAFT });

    await result.current.runSavedDataMart();

    expect(context.publishDataMart).toHaveBeenCalledWith('dm-1');
    expect(context.getDataMartRuns).toHaveBeenCalledWith('dm-1');
    expect(context.runDataMart).not.toHaveBeenCalled();
  });

  it('starts an incremental run of a published Data Mart', async () => {
    const { context, result } = renderInDataMart();

    await result.current.runSavedDataMart();

    expect(context.runDataMart).toHaveBeenCalledWith({
      id: 'dm-1',
      payload: { runType: 'INCREMENTAL' },
    });
    expect(context.publishDataMart).not.toHaveBeenCalled();
  });

  it('settles a failed publish without a run refresh', async () => {
    const { context, result } = renderInDataMart({
      status: DataMartStatus.DRAFT,
      publishDataMart: vi.fn().mockRejectedValue(new Error('Publish rejected')),
    });

    await expect(result.current.runSavedDataMart()).resolves.toBeUndefined();
    expect(context.getDataMartRuns).not.toHaveBeenCalled();
  });
});
