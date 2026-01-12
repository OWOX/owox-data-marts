import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { usePermissions } from '../usePermissions';
import { useRole } from '../../../../features/idp';

vi.mock('../../../../features/idp', () => ({
  useRole: vi.fn(),
}));

describe('usePermissions', () => {
  it('should return base permissions for admin', () => {
    (useRole as any).mockReturnValue({
      roles: ['admin'],
      isAdmin: true,
      canEdit: true,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it('should return base permissions for editor', () => {
    (useRole as any).mockReturnValue({
      roles: ['editor'],
      isAdmin: false,
      canEdit: true,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it('should return base permissions for viewer', () => {
    (useRole as any).mockReturnValue({
      roles: ['viewer'],
      isAdmin: false,
      canEdit: false,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it('should merge extra permissions', () => {
    (useRole as any).mockReturnValue({
      roles: ['editor'],
      isAdmin: false,
      canEdit: true,
    });

    interface ExtraPermissions {
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canPublish: boolean;
    }

    const { result } = renderHook(() =>
      usePermissions<ExtraPermissions>(({ canEdit }) => ({
        canPublish: canEdit,
      }))
    );

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canPublish: true,
    });
  });

  it('should allow overriding extra permissions based on isAdmin', () => {
    (useRole as any).mockReturnValue({
      roles: ['admin'],
      isAdmin: true,
      canEdit: true,
    });

    interface ExtraPermissions {
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canManageUsers: boolean;
    }

    const { result } = renderHook(() =>
      usePermissions<ExtraPermissions>(({ isAdmin }) => ({
        canManageUsers: isAdmin,
      }))
    );

    expect(result.current).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canManageUsers: true,
    });
  });

  it('should handle false extra permissions', () => {
    (useRole as any).mockReturnValue({
      roles: ['viewer'],
      isAdmin: false,
      canEdit: false,
    });

    interface ExtraPermissions {
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canManageUsers: boolean;
    }

    const { result } = renderHook(() =>
      usePermissions<ExtraPermissions>(({ isAdmin }) => ({
        canManageUsers: isAdmin,
      }))
    );

    expect(result.current).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canManageUsers: false,
    });
  });
});
