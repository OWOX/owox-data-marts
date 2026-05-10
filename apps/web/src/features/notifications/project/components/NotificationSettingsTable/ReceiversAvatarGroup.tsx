import { AlertTriangle } from 'lucide-react';
import type { ReceiverInfo } from '../../types';
import { UserAvatarGroup } from '../../../../../shared/components/UserAvatarGroup';
import type { UserProjection } from '../../../../../shared/types';

interface ReceiversAvatarGroupProps {
  receivers: ReceiverInfo[];
  maxDisplay?: number;
}

function toUserProjection(receiver: ReceiverInfo): UserProjection {
  return {
    userId: receiver.userId,
    email: receiver.email,
    fullName: receiver.displayName ?? null,
    avatar: receiver.avatarUrl ?? null,
  };
}

export function ReceiversAvatarGroup({ receivers, maxDisplay = 5 }: ReceiversAvatarGroupProps) {
  const receiverMap = new Map(receivers.map(r => [r.userId, r]));

  return (
    <UserAvatarGroup
      users={receivers.map(toUserProjection)}
      maxDisplay={maxDisplay}
      renderBadge={user => {
        const receiver = receiverMap.get(user.userId);
        if (!receiver?.hasNotificationsEnabled) {
          return (
            <div className='absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500'>
              <AlertTriangle className='h-2.5 w-2.5 text-white' />
            </div>
          );
        }
        return null;
      }}
    />
  );
}
