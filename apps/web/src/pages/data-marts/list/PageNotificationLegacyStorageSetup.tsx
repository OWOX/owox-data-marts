import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../shared/components/CollapsibleCard/index.ts';
import { Info, BookOpen, Airplay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button/index.tsx';
import { useContentPopovers } from '../../../app/store/hooks/useContentPopovers';

export default function PageNotificationLegacyStorageSetup() {
  const { open } = useContentPopovers();
  return (
    <div className='mb-4'>
      <CollapsibleCard collapsible name='notification-legacy-storage-setup'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Info}>
            Complete BigQuery storage setup to publish your Data Marts
          </CollapsibleCardHeaderTitle>
          <CollapsibleCardHeaderActions>
            <p className='text-muted-foreground/75 text-sm'>Action required</p>
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='rounded-md border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            <div className='flex flex-col gap-4 p-4 text-sm xl:p-6'>
              <div className='flex flex-col gap-2'>
                <p>
                  Your Data Marts created with{' '}
                  <a
                    href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-foreground font-semibold underline'
                  >
                    OWOX Reports
                  </a>{' '}
                  (Google Sheets extension) are listed below in{' '}
                  <span className='font-semibold'>Draft</span> status.
                </p>
                <p>
                  To manage Data Marts in one place, get Insights and sync data to multiple
                  destinations, complete the following steps:
                </p>
                <ol className='ml-4 flex list-inside list-decimal flex-col gap-1 text-left'>
                  <li>
                    <span className='font-semibold'>Select</span> a storage
                  </li>
                  <li>
                    <span className='font-semibold'>Grant access</span> to Google BigQuery (used in
                    OWOX extension)
                  </li>
                  <li>
                    <span className='font-semibold'>Publish</span> your Data Marts
                  </li>
                </ol>
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  onClick={() => {
                    open('video-4-legacy-storage-setup');
                  }}
                >
                  <Airplay className='size-4' /> Watch video (30 seconds)
                </Button>
                <Button variant='outline' asChild>
                  <Link
                    to='https://docs.owox.com/docs/getting-started/setup-guide/extension-data-marts/?utm_source=owox-data-marts&utm_medium=ui&utm_campaign=legacy-storage-info-block'
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <BookOpen className='size-4' />
                    View setup guide
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
