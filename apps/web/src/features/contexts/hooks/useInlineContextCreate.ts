import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { projectMembersService } from '../../project-members/services/project-members.service';
import type { ContextDto, MemberWithScopeDto } from '../types/context.types';

interface UseInlineContextCreateOptions {
  /**
   * Whether the caller can open the create-context flow (typically `isAdmin`).
   * Disables `onRequestCreate` on the picker when false.
   */
  enabled: boolean;

  /**
   * Fired after the AddContextSheet successfully creates a context. The hook
   * has already bumped the picker refresh token and closed the sheet by the
   * time this runs — callers only need to decide what to do with the new id
   * (push into local state, persist immediately, etc.).
   */
  onCreated: (created: ContextDto) => void;
}

/**
 * Wires together a `<ContextPicker>` and `<AddContextSheet>` so callers can
 * offer inline "create context" without re-implementing the lazy member fetch,
 * refresh-token bump, and sheet open/close state every time.
 *
 * Returns ready-made props bags for both components plus the lazy-loaded
 * member list. Members are fetched only when the sheet opens; failures
 * surface as a toast and the sheet still opens with an empty list (admins
 * can create the context without assigning members).
 */
export function useInlineContextCreate({ enabled, onCreated }: UseInlineContextCreateOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [members, setMembers] = useState<MemberWithScopeDto[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void projectMembersService
      .getMembers()
      .then(list => {
        if (!cancelled) setMembers(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMembers([]);
        toast.error(err instanceof Error ? err.message : 'Failed to load members');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleCreated = useCallback(
    (created: ContextDto) => {
      setRefreshToken(t => t + 1);
      setIsOpen(false);
      onCreated(created);
    },
    [onCreated]
  );

  return {
    /** Spread onto `<ContextPicker {...pickerProps} />`. */
    pickerProps: {
      refreshToken,
      onRequestCreate: enabled ? open : undefined,
    },
    /** Spread onto `<AddContextSheet {...sheetProps} />`. */
    sheetProps: {
      isOpen,
      members,
      onClose: close,
      onCreated: handleCreated,
    },
  };
}
