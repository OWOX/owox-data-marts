import { createContext, useContext } from 'react';
import type {
  ContextDto,
  MemberWithScopeDto,
} from '../../../../features/contexts/types/context.types';
import type { MembershipRequestDto } from '../../../../features/project-members/types';

export interface MembersSettingsStoreValue {
  contexts: ContextDto[];
  members: MemberWithScopeDto[];
  pendingRequests: MembershipRequestDto[];
  loading: boolean;
  loadingRequests: boolean;
  hasLoadError: boolean;
  refresh: () => Promise<void>;
  /**
   * Drop a member from the local cache right after a successful DELETE.
   * The backend still exposes them briefly because the upstream legacy
   * platform is eventually consistent, so a plain `refresh()` can race and
   * bring the removed row back. Callers should invoke this first, then
   * `refresh()` for eventual reconciliation.
   */
  optimisticRemoveMember: (userId: string) => void;
  /**
   * Drop a pending membership request from the local cache right after a
   * successful approve/decline. Mirrors the members tombstone pattern so the
   * row disappears immediately while `refresh()` reconciles upstream.
   */
  optimisticRemoveRequest: (requestId: string) => void;
  isAdmin: boolean;
  openInviteSheet: () => void;
  openAddContextSheet: () => void;
  openMembershipRequestSheet: (request: MembershipRequestDto) => void;
}

export const MembersSettingsReactContext = createContext<MembersSettingsStoreValue | null>(null);

export function useMembersSettings(): MembersSettingsStoreValue {
  const ctx = useContext(MembersSettingsReactContext);
  if (!ctx) {
    throw new Error('useMembersSettings must be used within MembersSettingsProvider');
  }
  return ctx;
}
