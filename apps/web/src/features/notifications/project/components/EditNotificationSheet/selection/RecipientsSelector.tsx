import { useMemo } from 'react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertTriangle, User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ProjectMember } from '../../../types';

interface RecipientsSelectorProps {
  members: ProjectMember[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function RecipientsSelector({
  members,
  selectedUserIds,
  onChange,
  isLoading = false,
  disabled = false,
}: RecipientsSelectorProps) {
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const handleToggle = (userId: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedUserIds, userId]);
    } else {
      onChange(selectedUserIds.filter(id => id !== userId));
    }
  };

  if (isLoading) {
    return (
      <div className='border-input space-y-1 rounded-md border p-1'>
        {[1, 2, 3].map(i => (
          <div key={i} className='flex items-center gap-3 p-2'>
            <Skeleton className='h-4 w-4' />
            <Skeleton className='h-8 w-8 rounded-full' />
            <div className='flex-1'>
              <Skeleton className='mb-1 h-4 w-24' />
              <Skeleton className='h-3 w-32' />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className='border-input text-muted-foreground rounded-md border py-4 text-center text-sm'>
        No project members found
      </div>
    );
  }

  return (
    <div className='border-input space-y-1 rounded-md border p-1'>
      {members.map(member => {
        const isSelected = selectedSet.has(member.userId);
        const hasWarning = !member.hasNotificationsEnabled;

        return (
          <div
            key={member.userId}
            className='hover:bg-muted/50 flex items-center gap-3 rounded-md p-2'
          >
            <Checkbox
              id={`member-${member.userId}`}
              checked={isSelected}
              onCheckedChange={checked => {
                handleToggle(member.userId, checked as boolean);
              }}
              disabled={disabled}
            />

            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.displayName ?? member.email}
                className='h-8 w-8 rounded-full object-cover'
              />
            ) : (
              <div className='bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium'>
                <User className='h-4 w-4' />
              </div>
            )}

            <Label
              htmlFor={`member-${member.userId}`}
              className='flex flex-1 cursor-pointer items-center justify-between'
            >
              <span className='flex items-center gap-2 font-medium'>
                {member.displayName ?? member.email}
                {hasWarning && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className='h-4 w-4 text-yellow-500' />
                    </TooltipTrigger>
                    <TooltipContent>
                      This user has disabled notifications in their preferences
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className='text-muted-foreground flex flex-col items-end text-xs font-normal'>
                <span className='font-semibold capitalize'>{member.role}</span>
                <span className=''>{member.email}</span>
              </span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}
