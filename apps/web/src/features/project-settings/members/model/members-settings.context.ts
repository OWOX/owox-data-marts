import { createContext, useContext } from 'react';
import type {
  ContextDto,
  MemberWithScopeDto,
} from '../../../../features/contexts/types/context.types';

export interface MembersSettingsStoreValue {
  contexts: ContextDto[];
  members: MemberWithScopeDto[];
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Drop a member from the local cache right after a successful DELETE.
   * The backend still exposes them briefly because the upstream legacy
   * platform is eventually consistent, so a plain `refresh()` can race and
   * bring the removed row back. Callers should invoke this first, then
   * `refresh()` for eventual reconciliation.
   */
  optimisticRemoveMember: (userId: string) => void;
  isAdmin: boolean;
  openInviteSheet: () => void;
  openAddContextSheet: () => void;
}

export const MembersSettingsReactContext = createContext<MembersSettingsStoreValue | null>(null);

export function useMembersSettings(): MembersSettingsStoreValue {
  const ctx = useContext(MembersSettingsReactContext);
  if (!ctx) {
    throw new Error('useMembersSettings must be used within MembersSettingsProvider');
  }
  return ctx;
}
