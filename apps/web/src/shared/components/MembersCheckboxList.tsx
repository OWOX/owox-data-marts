import { useMemo } from 'react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info, User } from 'lucide-react';

/**
 * Member role used for sorting + role-label rendering. Kept as a literal
 * union (not imported from an idp feature) so this shared list component
 * stays free of feature-DTO dependencies.
 */
export type CheckableMemberRole = 'admin' | 'editor' | 'viewer';

/** Role scope mirrors the backend 'entire_project' | 'selected_contexts'. */
export type CheckableMemberRoleScope = 'entire_project' | 'selected_contexts';

/**
 * Minimal member shape accepted by the list. Callers in `features/` project
 * to this shape before passing in.
 */
export interface CheckableMember {
  userId: string;
  email: string;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  role: CheckableMemberRole;
  roleLabel: string;
  /** When 'entire_project' (or role is admin), the member is locked into
   * every context — the checkbox is forced on and disabled. */
  roleScope?: CheckableMemberRoleScope;
}

interface MembersCheckboxListProps {
  idPrefix: string;
  members: CheckableMember[];
  selectedIds: string[];
  onToggle: (userId: string, checked: boolean) => void;
  disabled?: boolean;
  excludeAdmins?: boolean;
  emptyText?: string;
  /**
   * Controlled search query — case-insensitive substring match against
   * `displayName` and `email`. Pass `undefined` to disable filtering.
   * The search input UI lives in the caller so layout can be tailored
   * per sheet (toggle, inline, etc.).
   */
  searchQuery?: string;
}

const ROLE_PRIORITY: Record<CheckableMemberRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

function sortMembers(members: CheckableMember[]): CheckableMember[] {
  return [...members].sort((a, b) => {
    const byRole = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
    if (byRole !== 0) return byRole;
    return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
  });
}

export function MembersCheckboxList({
  idPrefix,
  members,
  selectedIds,
  onToggle,
  disabled,
  excludeAdmins = false,
  emptyText = 'No members available.',
  searchQuery,
}: MembersCheckboxListProps) {
  const sorted = useMemo(() => {
    const filtered = excludeAdmins ? members.filter(m => m.role !== 'admin') : members;
    return sortMembers(filtered);
  }, [members, excludeAdmins]);

  const trimmedQuery = searchQuery?.trim().toLowerCase() ?? '';
  const visible = useMemo(() => {
    if (trimmedQuery === '') return sorted;
    return sorted.filter(m => {
      const nameMatch = m.displayName?.toLowerCase().includes(trimmedQuery) ?? false;
      const emailMatch = m.email.toLowerCase().includes(trimmedQuery);
      return nameMatch || emailMatch;
    });
  }, [sorted, trimmedQuery]);

  if (sorted.length === 0) {
    return (
      <div className='border-input text-muted-foreground rounded-md border py-4 text-center text-sm'>
        {emptyText}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className='border-input text-muted-foreground rounded-md border py-4 text-center text-sm'>
        No members match &ldquo;{searchQuery?.trim() ?? ''}&rdquo;.
      </div>
    );
  }

  return (
    <div className='border-input flex flex-col gap-1 rounded-md border p-1'>
      {visible.map(m => {
        const isAdmin = m.role === 'admin';
        const isLocked = isAdmin || m.roleScope === 'entire_project';
        const lockedReason = isAdmin
          ? 'Admins always have access to every context.'
          : 'Members with project-wide scope already see every resource, regardless of context assignments.';
        const checked = isLocked || selectedIds.includes(m.userId);
        const id = `${idPrefix}-${m.userId}`;
        return (
          <div key={m.userId} className='hover:bg-muted/50 flex items-center gap-3 rounded-md p-2'>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={val => {
                if (isLocked) return;
                onToggle(m.userId, val === true);
              }}
              disabled={disabled === true || isLocked}
              aria-label={
                isLocked
                  ? `${m.displayName ?? m.email} — ${lockedReason}`
                  : (m.displayName ?? m.email)
              }
            />
            {m.avatarUrl ? (
              <img
                src={m.avatarUrl}
                alt={m.displayName ?? m.email}
                className='h-8 w-8 rounded-full object-cover'
              />
            ) : (
              <div className='bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium'>
                <User className='h-4 w-4' />
              </div>
            )}
            <Label
              htmlFor={id}
              className={
                isLocked
                  ? 'flex flex-1 items-center justify-between'
                  : 'flex flex-1 cursor-pointer items-center justify-between'
              }
            >
              <span className='flex items-center gap-1.5 font-medium'>
                {m.displayName ?? m.email}
                {isLocked && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className='text-muted-foreground inline-flex items-center'
                        aria-hidden='true'
                      >
                        <Info className='h-3.5 w-3.5' />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side='top'>{lockedReason}</TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className='text-muted-foreground flex flex-col items-end text-xs font-normal'>
                <span className='font-semibold'>{m.roleLabel}</span>
                <span>{m.email}</span>
              </span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}
