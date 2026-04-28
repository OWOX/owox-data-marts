import type { LucideIcon } from 'lucide-react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../shared/components/CollapsibleCard';
import { useUser } from '../../features/idp/hooks/useAuthState';

interface ExternalPlatformTabProps {
  name: string;
  title: string;
  tooltip: string;
  description: string;
  /**
   * Template URL containing `/p/none/` as a placeholder — it gets substituted
   * with the current project id at render time. Mirrors the sidebar pattern
   * in `ProjectMenu/useProjectMenu.ts`.
   */
  href: string;
  icon: LucideIcon;
  cta?: string;
}

/**
 * Shared placeholder for Project Settings tabs whose features still live on
 * platform.owox.com. Wraps the CTA in a DataMart-style `CollapsibleCard` so
 * Credit Consumption and Subscription tabs feel like native project-settings
 * sections rather than empty placeholders.
 */
export function ExternalPlatformTab({
  name,
  title,
  tooltip,
  description,
  href,
  icon,
  cta = 'Open in platform.owox.com',
}: ExternalPlatformTabProps) {
  const user = useUser();
  const projectId = user?.projectId;
  const resolvedHref = projectId ? href.replace('/p/none/', `/p/${projectId}/`) : href;
  const disabled = !projectId;

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name={name}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={icon} tooltip={tooltip}>
            {title}
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-4 rounded-md border-b border-gray-200 bg-white p-4 dark:border-0 dark:bg-white/2'>
            <p className='text-muted-foreground text-sm'>{description}</p>
            <Button asChild variant='outline' size='sm' className='w-fit' disabled={disabled}>
              <a href={resolvedHref} target='_blank' rel='noopener noreferrer'>
                <ExternalLink className='mr-2 h-4 w-4' />
                {cta}
              </a>
            </Button>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </div>
  );
}
