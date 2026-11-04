import { useAuth } from '../idp';
import type { Credential } from './types';

/** These permissions control UI hints. The backend authorizes each operation. */
export function useCredentialPermissions() {
  const { user } = useAuth();
  const canManageAccess = (credential: Credential | null) =>
    credential === null ||
    Boolean(user?.roles?.includes('admin')) ||
    credential.ownerUsers.some(owner => owner.userId === user?.id);

  return {
    canManageAccess,
    canMaintain: (credential: Credential) =>
      canManageAccess(credential) || credential.availableForMaintenance,
  };
}
