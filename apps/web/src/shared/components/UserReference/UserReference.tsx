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
        <div className='inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pr-3 pl-1 dark:bg-neutral-900'>
          <UserAvatar
            avatar={avatar}
            initials={initials}
            displayName={displayName}
            size={UserAvatarSize.SMALL}
          />

          <span
            className='text-muted-foreground min-w-0 truncate text-sm leading-tight'
            aria-label={displayName}
            title={displayName}
          >
            {displayName}
          </span>
        </div>
      </HoverCardTrigger>

      <HoverCardContent
        side='top'
        align='start'
        className='max-w-auto sm:max-w-auto w-auto p-2 sm:w-auto'
      >
        <div className='flex min-w-0 items-center gap-2'>
          <UserAvatar
            avatar={avatar}
            initials={initials}
            displayName={displayName}
            size={UserAvatarSize.LARGE}
          />
          <div className='grid space-y-1 pr-4 text-left text-sm leading-tight'>
            <span className='truncate font-medium'>{fullName ?? email ?? 'Unknown User'}</span>
            {email && <span className='text-muted-foreground truncate text-xs'>{email}</span>}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
