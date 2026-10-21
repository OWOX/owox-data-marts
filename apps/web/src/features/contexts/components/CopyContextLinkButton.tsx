import { Check, Link2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useClipboard } from '../../../hooks/useClipboard';
import { useProjectRoute } from '../../../shared/hooks';

export function CopyContextLinkButton({ contextId }: { contextId: string }) {
  const { scope } = useProjectRoute();
  const { copyToClipboard, copiedSection } = useClipboard();
  const copied = copiedSection === contextId;
  const label = copied ? 'Context link copied' : 'Copy link to context';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          onClick={() => {
            const url = new URL(scope('/project-settings/contexts'), window.location.origin);
            url.searchParams.set('context', contextId);
            void copyToClipboard(url.toString(), contextId).then(success => {
              if (!success) toast.error('Could not copy context link. Try again.');
            });
          }}
        >
          {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
