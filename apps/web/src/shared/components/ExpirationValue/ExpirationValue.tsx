import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { formatDateOnly } from '../../../utils';
import { isExpired, isExpiringSoon } from './expiration';

interface ExpirationValueProps {
  expiresAt: string | null | undefined;
  expiredNotice: string;
  expiringSoonNotice: string;
  focusable?: boolean;
}

export function ExpirationValue({
  expiresAt,
  expiredNotice,
  expiringSoonNotice,
  focusable,
}: ExpirationValueProps) {
  if (!expiresAt) return <span className='text-muted-foreground text-sm'>Never</span>;

  const dateLabel = formatDateOnly(expiresAt, { timeZone: 'UTC' });
  const expired = isExpired(expiresAt);
  const expiresSoon = isExpiringSoon(expiresAt);

  if (!expired && !expiresSoon) return <span className='text-foreground text-sm'>{dateLabel}</span>;

  const status = expired
    ? {
        badgeClassName: 'border-destructive/20 bg-destructive/10 text-destructive',
        label: 'Expired',
        tooltip: expiredNotice,
      }
    : {
        badgeClassName:
          'border-amber-300/50 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300',
        label: 'Expires soon',
        tooltip: expiringSoonNotice,
      };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className='inline-flex items-center gap-2 text-sm whitespace-nowrap'
        >
          <span className='text-foreground'>{dateLabel}</span>
          <Badge
            variant='outline'
            className={cn(
              'h-5 rounded-sm px-1.5 py-0 text-[11px] leading-4 font-medium',
              status.badgeClassName
            )}
          >
            {status.label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' align='start'>
        {status.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
