import { useState, useRef } from 'react';
import type { UserProjectionDto } from '../types/api';

export function useOwnerState(initialOwnerUsers: UserProjectionDto[]) {
  const [ownerUsers, setOwnerUsers] = useState<UserProjectionDto[]>(initialOwnerUsers);
  const [pendingOwnerIds, setPendingOwnerIds] = useState<string[] | null>(null);
  const pendingOwnerIdsRef = useRef<string[] | null>(null);
  const ownersDirty = pendingOwnerIds !== null;

  const handleOwnersChange = (newOwnerUsers: UserProjectionDto[]) => {
    const newIds = newOwnerUsers.map(u => u.userId);
    setPendingOwnerIds(newIds);
    pendingOwnerIdsRef.current = newIds;
    setOwnerUsers(newOwnerUsers);
  };

  const consumePendingOwnerIds = (): string[] | null => {
    const ids = pendingOwnerIdsRef.current;
    if (ids !== null) {
      pendingOwnerIdsRef.current = null;
      setPendingOwnerIds(null);
    }
    return ids;
  };

  return {
    ownerUsers,
    pendingOwnerIds,
    pendingOwnerIdsRef,
    ownersDirty,
    handleOwnersChange,
    consumePendingOwnerIds,
  };
}
