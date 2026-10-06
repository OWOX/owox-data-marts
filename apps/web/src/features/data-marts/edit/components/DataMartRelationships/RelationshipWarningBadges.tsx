import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import {
  CYCLE_STUB_TOOLTIP,
  isMissingPrimaryKeyWarning,
  MISSING_PRIMARY_KEY_TOOLTIP,
} from './relationship-warning-state';

function WarningBadge({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'>) {
  return (
    <Badge
      {...props}
      variant='outline'
      className={cn('shrink-0 border-orange-400 text-[10px] text-orange-500', className)}
    >
      {children}
    </Badge>
  );
}

/** Lower-severity than WarningBadge: "works — heads up" rather than "non-functional". */
function AttentionBadge({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'>) {
  return (
    <Badge
      {...props}
      variant='outline'
      className={cn('shrink-0 border-amber-400 text-[10px] text-amber-500', className)}
    >
      <TriangleAlert size={12} className='mr-1' />
      {children}
    </Badge>
  );
}

interface RelationshipWarningBadgesProps {
  relationship: DataMartRelationship;
  isBlocked: boolean;
  isCycleStub?: boolean;
}

/** Why a join does not work, or works with a caveat: Draft, Join not configured, Blocked, … */
export function RelationshipWarningBadges({
  relationship,
  isBlocked,
  isCycleStub = false,
}: RelationshipWarningBadgesProps) {
  const isDraft = relationship.targetDataMart.status === 'DRAFT';
  return (
    <>
      {isDraft && <WarningBadge>Draft</WarningBadge>}
      {relationship.joinConditions.length === 0 && <WarningBadge>Join not configured</WarningBadge>}
      {isBlocked && !isDraft && <WarningBadge>Blocked</WarningBadge>}
      {isMissingPrimaryKeyWarning(
        relationship.targetDataMart.hasPrimaryKey,
        relationship.joinConditions.length
      ) &&
        !isDraft &&
        !isBlocked &&
        !isCycleStub && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AttentionBadge>No primary key</AttentionBadge>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs'>
              {MISSING_PRIMARY_KEY_TOOLTIP}
            </TooltipContent>
          </Tooltip>
        )}
      {isCycleStub && (
        <Tooltip>
          <TooltipTrigger asChild>
            <WarningBadge>Loop</WarningBadge>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            {CYCLE_STUB_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
