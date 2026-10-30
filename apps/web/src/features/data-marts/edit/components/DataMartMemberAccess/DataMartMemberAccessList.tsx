import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import { Info } from 'lucide-react';
import { useContext } from 'react';
import { Link } from 'react-router';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import { CollapsibleCardContext } from '../../../../../shared/components/CollapsibleCard/CollapsibleCardContext';
import { UserReference } from '../../../../../shared/components/UserReference/UserReference';
import { useProjectRoute } from '../../../../../shared/hooks';
import type { DataMartMemberAccessItemDto } from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import {
  MEMBERS_LINK_TEXT,
  explainMemberAccess,
  formatMemberCount,
  memberAccessPath,
  plainText,
  sortMembersForAccess,
  type MemberAccessDataMart,
  type MemberAccessTarget,
  type MemberAccessText,
} from './member-access.utils';
import {
  linkDestination,
  trackMemberAccessEvent,
  useMemberAccessAnalytics,
  type MemberAccessLinkPlace,
} from './member-access.analytics';

interface DataMartMemberAccessListProps {
  dataMartId: string;
  members: DataMartMemberAccessItemDto[] | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  dataMart: MemberAccessDataMart;
  isDraft: boolean;
}

const GRID =
  'grid grid-cols-[minmax(10rem,1fr)_7rem_minmax(11rem,1fr)_minmax(0,1.8fr)] items-start gap-x-4';

/** Explanation text whose linked parts open the screen where that setting changes. */
function AccessText({
  text,
  onFollow,
}: {
  text: MemberAccessText;
  onFollow: (target: MemberAccessTarget) => void;
}) {
  const { scope } = useProjectRoute();
  return (
    <>
      {text.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Link
            key={`${String(index)}-${part.text}`}
            to={scope(memberAccessPath(part.target))}
            onClick={() => {
              onFollow(part.target);
            }}
            className='hover:text-foreground underline decoration-dotted underline-offset-2'
          >
            {part.text}
          </Link>
        )
      )}
    </>
  );
}

export function DataMartMemberAccessList({
  dataMartId,
  members,
  isLoading,
  hasError,
  onRetry,
  dataMart,
  isDraft,
}: DataMartMemberAccessListProps) {
  // Outside a card the context says expanded, so the list counts as shown.
  const { isCollapsed } = useContext(CollapsibleCardContext);
  useMemberAccessAnalytics(dataMartId, members, isCollapsed);

  const trackLink =
    (place: MemberAccessLinkPlace, memberHasAccess: boolean | null) =>
    (target: MemberAccessTarget) => {
      trackMemberAccessEvent('data_mart_member_access_link_clicked', dataMartId, {
        destination: linkDestination(target),
        place,
        memberHasAccess,
      });
    };

  if (hasError) {
    return (
      <div className='flex items-center justify-between gap-4 p-4' role='alert'>
        <p className='text-muted-foreground text-sm'>
          Couldn&apos;t load who has access to this Data Mart.
        </p>
        <Button variant='outline' size='sm' onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!members) {
    return isLoading ? (
      <div className='flex flex-col gap-3 p-4' aria-busy='true'>
        <Skeleton className='h-5 w-56' />
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-12 w-full' />
      </div>
    ) : null;
  }

  const canSee = members.filter(m => m.see.granted).length;
  const canEdit = members.filter(m => m.edit.granted).length;
  const canConfigureSharing = members.filter(m => m.configureSharing.granted).length;

  return (
    <div className='flex flex-col gap-3' data-testid='dataMartMemberAccess'>
      <div className='flex flex-col gap-1'>
        <p className='text-foreground text-sm font-medium'>
          {formatMemberCount(members.length)}: {canSee} can see it, {canEdit} can edit it,{' '}
          {canConfigureSharing} can change Sharing and Ownership
        </p>
        <p className='text-muted-foreground text-xs'>
          <AccessText
            text={[
              "Change Ownership, Sharing or Contexts above, or a member's role and contexts in ",
              { text: MEMBERS_LINK_TEXT, target: { kind: 'members' } },
              '.',
            ]}
            onFollow={trackLink('summary', null)}
          />
        </p>
        {isDraft && (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <Info className='size-3.5 shrink-0' aria-hidden='true' />
            This Data Mart is a draft: MCP lists only published Data Marts.
          </p>
        )}
      </div>

      <div
        role='table'
        aria-label='Member access'
        className='rounded-md border-b border-gray-200 bg-white px-4 dark:border-0 dark:bg-white/2'
      >
        <div role='row' className={cn(GRID, 'text-muted-foreground py-2 text-xs')}>
          <span role='columnheader'>Member</span>
          <span role='columnheader'>Role</span>
          <span role='columnheader'>Access through</span>
          <span role='columnheader'>Can do</span>
        </div>
        <div className='divide-border divide-y border-t'>
          {sortMembersForAccess(members).map(member => {
            const { accessThrough, canDo, next } = explainMemberAccess(member, dataMart);
            const hasAccess = member.see.granted;
            return (
              <div
                key={member.userId}
                role='row'
                className={cn(GRID, 'py-3')}
                data-testid='dataMartMemberAccessRow'
              >
                <div role='cell' className='min-w-0'>
                  <UserReference
                    userProjection={{
                      userId: member.userId,
                      fullName: member.displayName ?? null,
                      email: member.email,
                      avatar: member.avatarUrl ?? null,
                    }}
                  />
                </div>
                <div role='cell' className='text-muted-foreground pt-1 text-sm'>
                  {getRoleDisplayName(member.role)}
                </div>
                <div role='cell' className='flex flex-wrap gap-1 pt-0.5'>
                  {accessThrough.map(source => (
                    <Badge
                      key={plainText(source)}
                      variant={hasAccess ? 'secondary' : 'outline'}
                      className={cn(!hasAccess && 'text-muted-foreground')}
                    >
                      <AccessText text={source} onFollow={trackLink('access_through', hasAccess)} />
                    </Badge>
                  ))}
                </div>
                <div role='cell' className='flex min-w-0 flex-col gap-1 pt-0.5'>
                  <p className='text-foreground text-sm'>
                    <AccessText text={canDo} onFollow={trackLink('can_do', hasAccess)} />
                  </p>
                  {next && (
                    <p className='text-muted-foreground text-xs'>
                      <AccessText text={next} onFollow={trackLink('hint', hasAccess)} />
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
