import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../shared/components/CollapsibleCard/index.ts';
import { Info, Database, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button/index.tsx';
import { useProjectRoute } from '../../../shared/hooks';

export default function PageNotificationLegacyStorageSetup() {
  const { scope } = useProjectRoute();
  return (
    <div className='mb-4'>
      <CollapsibleCard collapsible name='notification-legacy-storage-setup'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Info}>
            Finish setting up Data Marts from the Google Sheets extension
          </CollapsibleCardHeaderTitle>
          <CollapsibleCardHeaderActions>
            <p className='text-muted-foreground/75 text-sm'>Action required</p>
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='rounded-md border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            <div className='flex flex-col gap-4 p-4 text-sm xl:p-6'>
              <div className='flex flex-col gap-2 xl:text-center'>
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
                  (Google Sheets extension) are listed below and currently in the{' '}
                  <span className='font-semibold'>Draft</span> status.
                </p>
                <p>
                  To activate and publish them, complete a one-time BigQuery storage setup.
                  You&apos;ll select a storage, grant access, and then publish your Data Marts in
                  just a few steps.
                </p>
              </div>
              <div className='flex items-center gap-2 xl:justify-center'>
                <Button asChild>
                  <Link
                    to={scope(
                      `/data-storages?filters=%5B%7B"f"%3A"type"%2C"o"%3A"eq"%2C"v"%3A%5B"LEGACY_GOOGLE_BIGQUERY"%5D%7D%5D`
                    )}
                  >
                    <Database className='size-4' />
                    Choose a BigQuery storage
                  </Link>
                </Button>
                <Button variant='outline' asChild>
                  <Link
                    to='https://docs.owox.com/docs/storages/supported-storages/google-bigquery-used-in-owox-extension?utm_source=owox-data-marts&utm_medium=ui&utm_campaign=legacy-storage-info-block'
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
