import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import type { UserProjection } from '../../types';
import { UserReference } from '../UserReference';

interface UserAvatarGroupProps {
  users: UserProjection[];
  maxDisplay?: number;
  renderBadge?: (user: UserProjection) => ReactNode;
}

export function UserAvatarGroup({ users, maxDisplay = 3, renderBadge }: UserAvatarGroupProps) {
  if (users.length === 0) {
    return <span className='text-muted-foreground text-sm'>—</span>;
  }

  const displayUsers = users.slice(0, maxDisplay);
  const hiddenUsers = users.slice(maxDisplay);
  const remainingCount = hiddenUsers.length;

  return (
    <div className='flex items-center -space-x-2'>
      {displayUsers.map(user => (
        <div key={user.userId} className='relative'>
          <UserReference userProjection={user} variant='avatar-only' />
          {renderBadge?.(user)}
        </div>
      ))}
      {remainingCount > 0 && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className='bg-muted text-muted-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white text-xs font-medium'>
              +{remainingCount}
            </div>
          </HoverCardTrigger>
          <HoverCardContent side='top' align='start' className='w-auto p-2'>
            <div className='flex flex-col gap-1'>
              {hiddenUsers.map(user => (
                <UserReference key={user.userId} userProjection={user} variant='full' />
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
