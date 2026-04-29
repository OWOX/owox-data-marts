import { useCallback, useState, type ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import { UserAvatar, UserAvatarSize } from '../../../../shared/components/UserAvatar';
import { generateInitials } from '../../../../shared/utils';

/**
 * Minimal shape needed to render a row in the card. Callers map their domain
 * type (UserProjection, MemberWithScopeDto, etc.) into this contract.
 */
export interface MembersHoverCardItem {
  id: string;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; members: MembersHoverCardItem[] }
  | { status: 'error' };

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

interface MembersHoverCardProps {
  /** Element that opens the hover card (rendered via HoverCardTrigger asChild). */
  children: ReactNode;

  /**
   * Eager data path. Pass when the caller already has the list and there's
   * nothing to fetch.
   */
  members?: MembersHoverCardItem[];

  /**
   * Lazy data path. Fired once on the first hover open, result cached for
   * the lifetime of the component. Ignored if `members` is provided.
   */
  loader?: () => Promise<MembersHoverCardItem[]>;

  /**
   * Hard cap on visible rows; the rest collapse into "and N more".
   * Omit (default) to render every member — pair with a scrollable
   * `contentClassName` if the list can grow large.
   */
  maxVisible?: number;

  /** Hint copy. Defaults are deliberately generic. */
  loadingText?: string;
  emptyText?: string;
  errorText?: string;
  /** Fallback label when a member has no displayName and no email. */
  unknownLabel?: string;

  openDelay?: number;
  closeDelay?: number;
  side?: Side;
  align?: Align;
  /** Override the default HoverCardContent classes (width / padding / etc). */
  contentClassName?: string;
}

/**
 * Generic hover card listing project members. Two data sources:
 *
 * - `members` (eager): the caller already has the list. Renders immediately.
 * - `loader` (lazy): fires on first open, caches the result. Used when the
 *   list shouldn't be fetched until the user actually hovers — e.g. the
 *   "ask your admin" hint, where most users never trigger it.
 *
 * On error the card shows `errorText` and the rest of the UI keeps working —
 * this component is informational, never load-bearing.
 */
export function MembersHoverCard({
  children,
  members,
  loader,
  maxVisible,
  loadingText = 'Loading…',
  emptyText = 'No members found',
  errorText = 'Could not load members',
  unknownLabel = 'Unknown',
  openDelay = 150,
  closeDelay = 100,
  side = 'top',
  align = 'center',
  contentClassName = 'max-h-80 w-64 overflow-y-auto p-3',
}: MembersHoverCardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      // Eager mode — nothing to fetch.
      if (members) return;
      if (!loader) return;
      // Cache: only fire once.
      if (loadState.status !== 'idle') return;
      setLoadState({ status: 'loading' });
      void loader()
        .then(list => {
          setLoadState({ status: 'loaded', members: list });
        })
        .catch(() => {
          setLoadState({ status: 'error' });
        });
    },
    [members, loader, loadState.status]
  );

  const resolvedMembers: MembersHoverCardItem[] | null = (() => {
    if (members) return members;
    if (loadState.status === 'loaded') return loadState.members;
    return null;
  })();

  const body = (() => {
    if (resolvedMembers === null) {
      if (loadState.status === 'error') {
        return <span className='text-muted-foreground text-xs'>{errorText}</span>;
      }
      return <span className='text-muted-foreground text-xs'>{loadingText}</span>;
    }
    if (resolvedMembers.length === 0) {
      return <span className='text-muted-foreground text-xs'>{emptyText}</span>;
    }
    const visible =
      maxVisible !== undefined ? resolvedMembers.slice(0, maxVisible) : resolvedMembers;
    const overflow = resolvedMembers.length - visible.length;
    return (
      <div className='flex flex-col gap-1.5'>
        {visible.map(m => {
          const displayName = m.displayName ?? m.email ?? unknownLabel;
          const initials = generateInitials(m.displayName, m.email);
          return (
            <div key={m.id} className='flex min-w-0 items-center gap-2'>
              <UserAvatar
                avatar={m.avatarUrl ?? undefined}
                initials={initials}
                displayName={displayName}
                size={UserAvatarSize.SMALL}
              />
              <div className='grid min-w-0 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{displayName}</span>
                {m.email && m.email !== displayName && (
                  <span className='text-muted-foreground truncate text-xs'>{m.email}</span>
                )}
              </div>
            </div>
          );
        })}
        {overflow > 0 && (
          <span className='text-muted-foreground pt-0.5 text-xs'>and {overflow} more</span>
        )}
      </div>
    );
  })();

  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} align={align} className={contentClassName}>
        {body}
      </HoverCardContent>
    </HoverCard>
  );
}
