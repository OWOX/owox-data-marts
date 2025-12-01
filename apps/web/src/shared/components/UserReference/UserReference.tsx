import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import type { UserProjection } from '../../types';
import { generateInitials } from '../../utils';
import { UserAvatar, UserAvatarSize } from '../UserAvatar';

export function UserReference({ userProjection }: { userProjection: UserProjection }) {
  const { fullName, email, avatar } = userProjection;
  const displayName = fullName ?? email ?? 'Unknown User';
  const initials = generateInitials(fullName, email);

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className='mx-1 inline-flex min-w-max items-center gap-1 rounded-full bg-neutral-100 py-1 pr-3 pl-1 dark:bg-neutral-900'>
          <UserAvatar
            avatar={avatar}
            initials={initials}
            displayName={displayName}
            size={UserAvatarSize.SMALL}
          />
          <span
            className='text-muted-foreground inline text-sm leading-tight'
            aria-label={displayName}
          >
            {displayName}
          </span>
        </div>
      </HoverCardTrigger>

      <HoverCardContent side='top' align='start' className='w-max p-3'>
        <div className='flex items-center gap-2'>
          <UserAvatar
            avatar={avatar}
            initials={initials}
            displayName={displayName}
            size={UserAvatarSize.LARGE}
          />
          <div className='grid text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{fullName ?? email ?? 'Unknown User'}</span>
            {email && <span className='text-muted-foreground truncate text-xs'>{email}</span>}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
