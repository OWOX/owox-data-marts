import { useState, useRef } from 'react';
import type { UserProjectionDto } from '../types/api';

export function useOwnerState(initialOwnerUsers: UserProjectionDto[]) {
  const [ownerUsers, setOwnerUsers] = useState<UserProjectionDto[]>(initialOwnerUsers);
  const [pendingOwnerIds, setPendingOwnerIds] = useState<string[] | null>(null);
  const pendingOwnerIdsRef = useRef<string[] | null>(null);
  const ownersDirty = pendingOwnerIds !== null;

  const handleOwnersChange = (newOwnerIds: string[]) => {
    setPendingOwnerIds(newOwnerIds);
    pendingOwnerIdsRef.current = newOwnerIds;
    const knownUsers = new Map(ownerUsers.map(u => [u.userId, u]));
    setOwnerUsers(
      newOwnerIds.map(
        id =>
          knownUsers.get(id) ??
          ({ userId: id, fullName: null, email: null, avatar: null } as UserProjectionDto)
      )
    );
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
