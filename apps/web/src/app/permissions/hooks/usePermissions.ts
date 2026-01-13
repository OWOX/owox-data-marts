import { useMemo } from 'react';
import { useRole } from '../../../features/idp';

export interface BasePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function usePermissions<T extends BasePermissions>(
  extraPermissions?: (context: {
    isAdmin: boolean;
    canEdit: boolean;
  }) => Partial<Omit<T, keyof BasePermissions>>
): T {
  const { isAdmin, canEdit } = useRole();

  return useMemo(() => {
    const base: BasePermissions = {
      canCreate: canEdit,
      canEdit: canEdit,
      canDelete: canEdit,
    };

    if (extraPermissions) {
      return {
        ...base,
        ...extraPermissions({ isAdmin, canEdit }),
      } as T;
    }

    return base as T;
  }, [isAdmin, canEdit, extraPermissions]);
}
