import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import { CircleCheck, Info, Minus } from 'lucide-react';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import { UserReference } from '../../../../../shared/components/UserReference/UserReference';
import type { DataMartMemberAccessItemDto } from '../../../shared/types/api/response/data-mart-member-access.response.dto';
import {
  ACCESS_LEVELS,
  explainMemberAccess,
  formatMemberCount,
  sortMembersForAccess,
  type MemberAccessDataMart,
} from './member-access.utils';

interface DataMartMemberAccessListProps {
  members: DataMartMemberAccessItemDto[] | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  dataMart: MemberAccessDataMart;
  isDraft: boolean;
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,7rem)] items-start gap-x-2';

export function DataMartMemberAccessList({
  members,
  isLoading,
  hasError,
  onRetry,
  dataMart,
  isDraft,
}: DataMartMemberAccessListProps) {
  if (hasError) {
    return (
      <div className='flex items-center justify-between gap-4 p-4' role='alert'>
        <p className='text-muted-foreground text-sm'>
          Couldn&apos;t load who can work with this Data Mart.
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

  const counts = ACCESS_LEVELS.map(level => members.filter(m => m[level.key].granted).length);

  return (
    <div className='flex flex-col gap-3' data-testid='dataMartMemberAccess'>
      <div className='flex flex-col gap-1'>
        <p className='text-foreground text-sm font-medium'>
          {formatMemberCount(members.length)}: {counts[0]} can use, {counts[1]} can maintain,{' '}
          {counts[2]} can manage access
        </p>
        <p className='text-muted-foreground text-xs'>
          Change Sharing, Contexts or Ownership above, or a member&apos;s role and contexts in
          Project settings → Members.
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
          {ACCESS_LEVELS.map(level => (
            <span key={level.key} role='columnheader' className='text-center'>
              {level.label}
            </span>
          ))}
        </div>
        <div className='divide-border divide-y border-t'>
          {sortMembersForAccess(members).map(member => {
            const { summary, next } = explainMemberAccess(member, dataMart);
            return (
              <div
                key={member.userId}
                role='row'
                className={cn(GRID, 'py-3')}
                data-testid='dataMartMemberAccessRow'
              >
                <div role='cell' className='flex min-w-0 flex-col gap-1'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <UserReference
                      userProjection={{
                        userId: member.userId,
                        fullName: member.displayName ?? null,
                        email: member.email,
                        avatar: member.avatarUrl ?? null,
                      }}
                    />
                    <span className='text-muted-foreground shrink-0 text-xs'>
                      {getRoleDisplayName(member.role)}
                    </span>
                  </div>
                  <p className='text-foreground text-sm'>{summary}</p>
                  {next && (
                    <p className='text-muted-foreground text-xs'>
                      To {next.verb}: {next.hint}
                    </p>
                  )}
                </div>
                {ACCESS_LEVELS.map(level => {
                  const granted = member[level.key].granted;
                  const label = `${granted ? 'Can' : "Can't"} ${level.verb}`;
                  return (
                    <div
                      key={level.key}
                      role='cell'
                      className='flex justify-center pt-1'
                      aria-label={label}
                      title={label}
                    >
                      {granted ? (
                        <CircleCheck
                          className='size-4 text-green-500 dark:text-green-400'
                          aria-hidden='true'
                        />
                      ) : (
                        <Minus className='text-muted-foreground/60 size-4' aria-hidden='true' />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Accordion variant='common' type='single' collapsible>
        <AccordionItem value='member-access-help'>
          <AccordionTrigger>What does each level allow?</AccordionTrigger>
          <AccordionContent>
            <p>
              <strong>Use</strong> — see the Data Mart in the catalog and through MCP, and build
              reports on it.
            </p>
            <p>
              <strong>Maintain</strong> — edit and delete the Data Mart, and manage its triggers.
            </p>
            <p>
              <strong>Manage access</strong> — change its Sharing and owners.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
