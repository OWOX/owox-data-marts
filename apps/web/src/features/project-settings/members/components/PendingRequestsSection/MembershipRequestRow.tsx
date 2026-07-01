import { ChevronRight } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { UserAvatar, UserAvatarSize } from '../../../../../shared/components/UserAvatar';
import { generateInitials } from '../../../../../shared/utils';
import { getRoleDisplayName } from '../../../../../features/idp/utils/role-display-name';
import { formatDateShort } from '../../../../../utils/date-formatters';
import type { MembershipRequestDto } from '../../../../../features/project-members/types';

interface MembershipRequestRowProps {
  request: MembershipRequestDto;
  onClick: (request: MembershipRequestDto) => void;
  className?: string;
}

export function MembershipRequestRow({ request, onClick, className }: MembershipRequestRowProps) {
  const { email, fullName, avatar, requestedRole, createdAt, requestId } = request;
  const displayName = fullName ?? email;
  const initials = generateInitials(fullName ?? null, email);
  const handleClick = () => {
    onClick(request);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(request);
    }
  };

  return (
    <div
      role='button'
      tabIndex={0}
      data-testid={`membershipRequestRow-${requestId}`}
      aria-label={`Open request from ${displayName}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex cursor-pointer items-center gap-4 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 outline-none',
        'hover:shadow-xs focus-visible:ring-2 focus-visible:ring-blue-500',
        'dark:border-0 dark:bg-white/2 dark:hover:bg-white/5',
        className
      )}
    >
      <div className='flex flex-grow items-center gap-3 px-6 py-4'>
        <UserAvatar
          avatar={avatar ?? null}
          initials={initials}
          displayName={displayName}
          size={UserAvatarSize.NORMAL}
        />
        <div className='flex min-w-0 flex-grow flex-col gap-1'>
          <div className='text-md truncate font-medium'>{displayName}</div>
          <div className='text-muted-foreground/75 flex flex-wrap gap-x-2 text-sm'>
            <span className='break-all'>{email}</span>
            <span aria-hidden>•</span>
            <span>Requested role: {getRoleDisplayName(requestedRole)}</span>
            <span aria-hidden>•</span>
            <span>{formatDateShort(createdAt)}</span>
          </div>
        </div>
      </div>
      <div className='flex items-center justify-center gap-2 p-4'>
        <div className='flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-white/4'>
          <ChevronRight className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
        </div>
      </div>
    </div>
  );
}
