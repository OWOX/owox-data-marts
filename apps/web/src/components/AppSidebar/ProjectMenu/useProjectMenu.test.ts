import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { useProjectMenu } from './useProjectMenu';

const projectState = vi.hoisted(() => ({
  value: {
    id: '2efa3556b1d5bec2f99b6fca4c0010db' as string | null,
    title: 'Demo project' as string | null,
  },
}));

const flagsState = vi.hoisted(() => ({
  value: {
    flags: {
      MENU_OWOX_BI_VISIBLE: 'true',
    } as Record<string, unknown>,
    callState: 'loaded' as RequestStatus,
  },
}));

vi.mock('../../../app/store/hooks', () => ({
  useProject: () => projectState.value,
  useFlags: () => flagsState.value,
}));

vi.mock('../../../features/idp/hooks/useProjects.ts', () => ({
  useProjects: () => ({
    projects: [],
    loadProjects: vi.fn(),
    callState: 'idle',
    error: null,
    isLoading: false,
    reset: vi.fn(),
  }),
}));

function getOwoxBiHref() {
  const { result } = renderHook(() => useProjectMenu());
  const owoxBiItem = result.current.visibleMenuItems.find(
    item => item.type === 'menu-item' && item.title === 'OWOX BI'
  );

  return owoxBiItem && 'href' in owoxBiItem ? owoxBiItem.href : undefined;
}

describe('useProjectMenu', () => {
  beforeEach(() => {
    projectState.value = {
      id: '2efa3556b1d5bec2f99b6fca4c0010db',
      title: 'Demo project',
    };
  });

  it('opens OWOX BI in the current project instead of the BI root', () => {
    expect(getOwoxBiHref()).toBe('https://bi.owox.com/ui/app/2efa3556b1d5bec2f99b6fca4c0010db');
  });

  it('falls back to the BI root when the current project is unknown', () => {
    projectState.value = { id: null, title: null };

    expect(getOwoxBiHref()).toBe('https://bi.owox.com/');
  });
});
