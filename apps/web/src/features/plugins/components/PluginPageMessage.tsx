import { Button } from '@owox/ui/components/button';
import { Link } from 'react-router';

export function PluginPageMessage({
  title,
  description,
  backHref,
  settingsHref,
}: {
  title: string;
  description?: string;
  backHref?: string;
  settingsHref?: string;
}) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
      <h1 className='text-lg font-medium'>{title}</h1>
      {description && <p className='text-muted-foreground max-w-prose text-sm'>{description}</p>}
      {(settingsHref ?? backHref) && (
        <div className='flex gap-2'>
          {settingsHref && (
            <Button asChild variant='outline'>
              <Link to={settingsHref}>Plugin settings</Link>
            </Button>
          )}
          {backHref && (
            <Button asChild variant='outline'>
              <Link to={backHref}>Back to plugins</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
