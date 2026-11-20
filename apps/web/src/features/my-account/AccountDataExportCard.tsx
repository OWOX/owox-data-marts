import { useMutation } from '@tanstack/react-query';
import { Button } from '@owox/ui/components/button';
import { downloadPersonalData } from './account-data-export';
import type { AccountSession } from './account-profile.service';

export function AccountDataExportCard({
  origin,
  session,
}: {
  origin: string;
  session: AccountSession;
}) {
  const download = useMutation({ mutationFn: () => downloadPersonalData(origin, session) });

  return (
    <section
      className='dm-card flex flex-col items-start gap-3'
      aria-labelledby='personal-data-heading'
    >
      <h2 id='personal-data-heading' className='text-base font-medium'>
        Personal data
      </h2>
      <p className='text-muted-foreground text-sm'>
        Download your profile information and details about how OWOX uses your personal data.
      </p>
      <Button
        variant='outline'
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        {download.isPending ? 'Preparing download...' : 'Download personal data'}
      </Button>
      {download.isError && (
        <p role='alert' className='text-destructive text-sm'>
          Could not download your personal data. Try again.
        </p>
      )}
    </section>
  );
}
