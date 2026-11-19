import { isValidElement } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../shared/model/types/data-storage-type.enum';
import type { DataStorage } from '../../../shared/model/types/data-storage';
import { useStorageSheetMcpPromo } from './useStorageSheetMcpPromo';

const mocks = vi.hoisted(() => ({ setup: true, fetchHealth: vi.fn() }));

vi.mock('../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ projectId: 'project-1' }),
}));
vi.mock('../../../shared/services/data-storage-health-status.service', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../shared/services/data-storage-health-status.service')
  >()),
  fetchAndCacheDataStorageHealthStatus: mocks.fetchHealth,
}));
vi.mock('../../../../mcp-promo', () => ({
  useIsMcpSetupPromoAvailable: () => mocks.setup,
  McpPromoCard: () => null,
  buildMcpPrompt: (placement: string) => placement,
}));

const storage = (config: object) =>
  ({
    id: 'storage-1',
    title: 'Warehouse',
    type: DataStorageType.SNOWFLAKE,
    config,
    createdAt: new Date(),
    modifiedAt: new Date(),
  }) as DataStorage;
const configured = storage({ account: 'acme', warehouse: 'main' });
const unconfigured = storage({});

function placementOf(storageArg: DataStorage | null, justCreated?: boolean) {
  const { result } = renderHook(() => useStorageSheetMcpPromo(storageArg, true, justCreated));
  const element = result.current;
  if (!isValidElement<{ placement: string }>(element)) return undefined;
  return element.props.placement;
}

describe('useStorageSheetMcpPromo', () => {
  beforeEach(() => {
    mocks.setup = true;
    mocks.fetchHealth.mockClear();
  });

  it('offers setup for a Storage with an incomplete config', () => {
    expect(placementOf(unconfigured)).toBe('storage_sheet');
  });

  it('offers maintenance for a configured Storage', () => {
    expect(placementOf(configured)).toBe('storage_sheet_maintain');
  });

  it('offers setup for a Storage created just now', () => {
    expect(placementOf(configured, true)).toBe('storage_sheet');
  });

  it('returns nothing without the setup promo', () => {
    mocks.setup = false;
    expect(placementOf(unconfigured)).toBeUndefined();
  });

  it('returns nothing without a Storage', () => {
    expect(placementOf(null)).toBeUndefined();
  });

  const renderOpenable = (initial: {
    current: DataStorage | null;
    created: boolean;
    open: boolean;
  }) => {
    const hook = renderHook(
      ({
        current,
        created,
        open,
      }: {
        current: DataStorage | null;
        created: boolean;
        open: boolean;
      }) => useStorageSheetMcpPromo(current, open, created),
      { initialProps: initial }
    );
    const card = () =>
      isValidElement<{ placement: string }>(hook.result.current) ? hook.result.current : undefined;
    return { ...hook, placement: () => card()?.props.placement, key: () => card()?.key };
  };

  it('keeps the last block while the list clears the Storage at close', () => {
    const { rerender, placement } = renderOpenable({
      current: configured,
      created: true,
      open: true,
    });

    rerender({ current: null, created: false, open: false });
    expect(placement()).toBe('storage_sheet');

    rerender({ current: configured, created: false, open: true });
    expect(placement()).toBe('storage_sheet_maintain');
  });

  it('keeps the setup block while the sheet closes after a save completes the config', () => {
    const { rerender, placement, key } = renderOpenable({
      current: unconfigured,
      created: false,
      open: true,
    });
    const openKey = key();

    // The Data Setup tab keeps the Storage and gets the saved, now valid copy in the closing render.
    rerender({ current: configured, created: false, open: false });
    expect(placement()).toBe('storage_sheet');
    expect(key()).toBe(openKey);

    rerender({ current: configured, created: false, open: true });
    expect(placement()).toBe('storage_sheet_maintain');
  });

  it('keeps the block when the open Storage is refetched as a new object', () => {
    const { rerender, placement } = renderOpenable({
      current: unconfigured,
      created: false,
      open: true,
    });

    rerender({ current: { ...configured }, created: false, open: true });
    expect(placement()).toBe('storage_sheet');
  });

  it('takes another Storage that arrives while the sheet is open', () => {
    const { rerender, placement } = renderOpenable({ current: null, created: false, open: true });
    expect(placement()).toBeUndefined();

    rerender({ current: configured, created: false, open: true });
    expect(placement()).toBe('storage_sheet_maintain');
  });

  it('sends no health request', () => {
    placementOf(unconfigured);
    placementOf(configured);
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
  });
});
