import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeaderActions,
} from '../../../shared/components/CollapsibleCard/index.ts';
import { Info, Clapperboard, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button/index.tsx';

export default function PageNotificationLegacyStorageSetup() {
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
            <div className='flex flex-col gap-2 p-4 text-sm 2xl:mx-auto 2xl:max-w-6xl 2xl:p-8 2xl:text-center'>
              <p>
                Your existing Data Marts, created with{' '}
                <a
                  href='https://workspace.google.com/marketplace/app/owox_bigquery_data_marts/263000453832'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-foreground font-semibold underline'
                >
                  OWOX Reports
                </a>{' '}
                (Google Sheets extension), are listed below and currently in the{' '}
                <span className='font-semibold'>Draft</span> status.
              </p>
              <p>
                This happens because BigQuery access requires a one-time storage setup. Follow the
                instructions below to complete storage setup and{' '}
                <span className='font-semibold'>publish your Data Marts</span>.
              </p>
              <div className='my-4 flex flex-col gap-2 lg:flex-row 2xl:justify-center'>
                <Button>
                  <Clapperboard className='size-4' />
                  Watch video instructions (2 min)
                </Button>
                <Button variant='outline' asChild>
                  <Link to='https://docs.owox.com/#' target='_blank' rel='noopener noreferrer'>
                    <FileText className='size-4' />
                    Read step-by-step guide
                  </Link>
                </Button>
              </div>
              <p className='text-muted-foreground/75 text-xs'>
                This message will disappear automatically after all storages are configured
              </p>
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
