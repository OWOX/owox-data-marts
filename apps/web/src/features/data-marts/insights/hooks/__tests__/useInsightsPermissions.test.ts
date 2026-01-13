import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { useInsightsPermissions } from '../useInsightsPermissions';
import { useRole } from '../../../../idp';

vi.mock('../../../../idp', () => ({
  useRole: vi.fn(),
}));

describe('useInsightsPermissions', () => {
  it('should return permissions for admin', () => {
    (useRole as any).mockReturnValue({
      isAdmin: true,
      canEdit: true,
    });

    const { result } = renderHook(() => useInsightsPermissions());

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canGenerateAI: true,
      canRun: true,
      canSendAndSchedule: true,
    });
  });

  it('should return permissions for editor', () => {
    (useRole as any).mockReturnValue({
      isAdmin: false,
      canEdit: true,
    });

    const { result } = renderHook(() => useInsightsPermissions());

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canGenerateAI: true,
      canRun: true,
      canSendAndSchedule: true,
    });
  });

  it('should return permissions for viewer', () => {
    (useRole as any).mockReturnValue({
      isAdmin: false,
      canEdit: false,
    });

    const { result } = renderHook(() => useInsightsPermissions());

    expect(result.current).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canGenerateAI: false,
      canRun: false,
      canSendAndSchedule: false,
    });
  });
});
