'use client';

import { useMemo } from 'react';
import { UserPlus, HelpCircle } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { useProject } from '../../../app/store/hooks/useProject';
import { useFlags } from '../../../app/store/hooks/useFlags';
import { checkVisible } from '../../../utils/check-visible';
import { Tooltip, TooltipTrigger, TooltipContent } from '@owox/ui/components/tooltip';

interface InviteTeammatesCardProps {
  hint?: string;
  inviteLabel?: string;
  docsHref?: string;
  docsLabel?: string;
  className?: string;
  variant?: 'card' | 'inline' | 'button';
  onClose?: () => void;
}

export function InviteTeammatesCard({
  hint,
  inviteLabel = 'Invite teammates',
  docsHref,
  docsLabel = 'View documentation',
  className,
  variant = 'card',
  onClose,
}: InviteTeammatesCardProps) {
  const { id: projectId } = useProject();
  const { flags } = useFlags();

  const membersHref = useMemo(() => {
    if (!projectId) {
      return null;
    }
    if (checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags)) {
      return `https://platform.owox.com/ui/p/${projectId}/settings/members`;
    }
    if (checkVisible('IDP_PROVIDER', ['better-auth'], flags)) {
      return '/auth';
    }
    return null;
  }, [flags, projectId]);

  const baseClasses = cn(
    'flex items-center text-sm gap-4',
    variant !== 'button' && 'justify-between'
  );
  const variantClasses = {
    card: 'bg-muted/50 rounded-md border-b border-gray-200 px-4 py-3 dark:border-white/2 dark:bg-white/2 text-muted-foreground dark:text-muted-foreground/75',
    inline: 'mt-4 border-t border-b border-border/50 py-4 text-muted-foreground/75',
    button: '',
  };
  const baseLink =
    'hover:text-foreground flex min-w-0 items-center gap-1.5 text-sm font-medium transition-colors hover:underline';

  const linkClasses = {
    card: baseLink,
    inline: baseLink,
    button:
      'inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  };

  if (!membersHref && !docsHref) return null;

  const isMembersExternal = membersHref?.startsWith('http');

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      {membersHref && (
        <div
          className={cn(
            'flex min-w-0 items-center gap-2',
            variant === 'button' && 'w-full justify-center'
          )}
        >
          <a
            href={membersHref}
            target={isMembersExternal ? '_blank' : undefined}
            rel={isMembersExternal ? 'noopener noreferrer' : undefined}
            className={cn(linkClasses[variant])}
            aria-label={inviteLabel}
            onClick={() => onClose?.()}
          >
            <UserPlus className='h-4 w-4 shrink-0' />
            <span className='truncate'>{inviteLabel}</span>
          </a>
          {hint && variant !== 'button' && (
            <span className='text-muted-foreground/75 dark:text-muted-foreground/50 hidden truncate lg:inline'>
              {hint}
            </span>
          )}
        </div>
      )}
      {docsHref && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={docsHref}
              target='_blank'
              rel='noopener noreferrer'
              className='text-muted-foreground hover:text-foreground'
            >
              <HelpCircle className='h-4 w-4 shrink-0' />
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p>{docsLabel}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
