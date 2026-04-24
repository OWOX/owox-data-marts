import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info, User } from 'lucide-react';
import type { MemberWithScopeDto } from '../../features/contexts/types/context.types';

interface MembersCheckboxListProps {
  idPrefix: string;
  members: MemberWithScopeDto[];
  selectedIds: string[];
  onToggle: (userId: string, checked: boolean) => void;
  disabled?: boolean;
  excludeAdmins?: boolean;
  emptyText?: string;
}

export function MembersCheckboxList({
  idPrefix,
  members,
  selectedIds,
  onToggle,
  disabled,
  excludeAdmins = false,
  emptyText = 'No members available.',
}: MembersCheckboxListProps) {
  const visible = excludeAdmins ? members.filter(m => m.role !== 'admin') : members;

  if (visible.length === 0) {
    return (
      <div className='border-input text-muted-foreground rounded-md border py-4 text-center text-sm'>
        {emptyText}
      </div>
    );
  }

  return (
    <div className='border-input flex flex-col gap-1 rounded-md border p-1'>
      {visible.map(m => {
        const isAdmin = m.role === 'admin';
        const checked = isAdmin || selectedIds.includes(m.userId);
        const id = `${idPrefix}-${m.userId}`;
        return (
          <div key={m.userId} className='hover:bg-muted/50 flex items-center gap-3 rounded-md p-2'>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={val => {
                if (isAdmin) return;
                onToggle(m.userId, val === true);
              }}
              disabled={disabled === true || isAdmin}
              aria-label={
                isAdmin
                  ? `${m.displayName ?? m.email} — admin, always has access`
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
              <div className='bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs'>
                <User className='h-4 w-4' />
              </div>
            )}
            <Label
              htmlFor={id}
              className={
                isAdmin
                  ? 'flex flex-1 items-center justify-between'
                  : 'flex flex-1 cursor-pointer items-center justify-between'
              }
            >
              <span className='flex items-center gap-1.5 font-medium'>
                {m.displayName ?? m.email}
                {isAdmin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className='text-muted-foreground inline-flex items-center'
                        aria-hidden='true'
                      >
                        <Info className='h-3.5 w-3.5' />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      Admins always have access to every context.
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className='text-muted-foreground text-xs'>{m.email}</span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}
