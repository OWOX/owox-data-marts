import { UserPlus, HelpCircle } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@owox/ui/lib/utils';
import { useProjectRoute } from '../../hooks';
import { Tooltip, TooltipTrigger, TooltipContent } from '@owox/ui/components/tooltip';

interface InviteTeammatesCardProps {
  hint?: string;
  inviteLabel?: string;
  docsHref?: string;
  docsLabel?: string;
  className?: string;
  variant?: 'card' | 'inline';
  onDocsClick?: () => void;
}

export function InviteTeammatesCard({
  hint,
  inviteLabel = 'Invite teammates',
  docsHref,
  docsLabel = 'View documentation',
  className,
  variant = 'card',
  onDocsClick,
}: InviteTeammatesCardProps) {
  const { scope } = useProjectRoute();
  const membersHref = '/project-settings/members';

  const baseClasses = 'flex items-center justify-between gap-4 text-sm';
  const variantClasses = {
    card: 'bg-muted/50 rounded-md border-b border-gray-200 px-4 py-3 text-muted-foreground dark:border-white/2 dark:bg-white/2 dark:text-muted-foreground/75',
    inline: 'mt-4 border-t border-b border-border/50 py-4 text-muted-foreground/75',
  };
  const baseLink =
    'hover:text-foreground flex min-w-0 items-center gap-1.5 text-sm font-medium transition-colors hover:underline';

  const linkClasses = {
    card: baseLink,
    inline: baseLink,
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      <div className='flex min-w-0 items-center gap-2'>
        <Link to={scope(membersHref)} className={cn(linkClasses[variant])} aria-label={inviteLabel}>
          <UserPlus className='h-4 w-4 shrink-0' />
          <span className='truncate underline'>{inviteLabel}</span>
        </Link>

        {hint && (
          <span className='text-muted-foreground/75 dark:text-muted-foreground/50 hidden truncate lg:inline'>
            {hint}
          </span>
        )}
      </div>
      {docsHref && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={docsHref}
              target='_blank'
              rel='noopener noreferrer'
              onClick={onDocsClick}
              className='text-muted-foreground/75 dark:text-muted-foreground/50 hover:text-foreground'
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
