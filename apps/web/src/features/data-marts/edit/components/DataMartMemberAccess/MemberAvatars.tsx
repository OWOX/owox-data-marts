import { UserAvatarGroup } from '../../../../../shared/components/UserAvatarGroup';
import type { DataMartMemberAccessItemDto } from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import { toUserProjection } from './member-access.utils';

interface MemberAvatarsProps {
  members: DataMartMemberAccessItemDto[];
  /** Who these members are, for screen readers: e.g. "Shared for reporting with". */
  label: string;
  testId?: string;
}

/** The members a setting lets in, as the Ownership section shows owners; nothing when none. */
export function MemberAvatars({ members, label, testId }: MemberAvatarsProps) {
  if (members.length === 0) return null;
  return (
    <div
      className='ml-auto shrink-0'
      role='group'
      aria-label={`${label} ${members.map(m => m.displayName ?? m.email).join(', ')}`}
      data-testid={testId}
    >
      <UserAvatarGroup users={members.map(toUserProjection)} maxDisplay={3} />
    </div>
  );
}
