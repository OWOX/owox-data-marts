import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { PromoBlock } from '../../../../../../shared/components/PromoBlock/PromoBlock';
import { GoogleSheetsIcon } from '../../../../../../shared/icons/google-sheets-icon';
import { Button } from '@owox/ui/components/button';
import { ArchiveRestore, ChevronRight } from 'lucide-react';
import { InviteTeammatesCard } from '../../../../../../shared/components/InviteTeammatesCard';

interface Props {
  variant?: 'default' | 'promo';
  onOpenCreateDestination?: () => void;
}

export function EmptyDataMartDestinationsState({
  variant = 'default',
  onOpenCreateDestination,
}: Props) {
  const { scope } = useProjectRoute();
  // Promo variant (show after data mart is published)
  if (variant === 'promo') {
    return (
      <div className='flex flex-col gap-0.5'>
        <PromoBlock
          icon={GoogleSheetsIcon}
          title='Analyze your data in&nbsp;Google Sheets'
          subtitle='Ready to start reporting?'
          description='Access live data directly in&nbsp;Sheets&nbsp;— choose columns and build reports without SQL or&nbsp;CSV&nbsp;exports.'
          primaryAction={{
            label: 'Connect Google Sheets',
            ...(onOpenCreateDestination
              ? {
                  onClick: onOpenCreateDestination,
                }
              : {
                  href: scope('/data-destinations'),
                }),
          }}
          secondaryAction={{
            label: 'View all destinations',
            href: scope('/data-destinations'),
          }}
        />
        <InviteTeammatesCard
          hint='— Ask colleagues to configure Google Sheets destination'
          docsLabel='Learn more about Google Sheets destination'
          docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
        />
      </div>
    );
  }

  // Default empty state (show before data mart is published)
  return (
    <div className='flex flex-col gap-0.5'>
      <div className='dm-card'>
        <div className='dm-empty-state'>
          <ArchiveRestore className='dm-empty-state-ico' strokeWidth={1} />

          <h2 className='dm-empty-state-title'>Google Sheets, Data Studio, Email… and friends!</h2>

          <p className='dm-empty-state-subtitle'>
            To turn data into reports using your favorite tools, create a Destination first.
          </p>

          <Button variant='outline' asChild>
            <Link to={scope('/data-destinations')} className='flex items-center gap-1'>
              Go to Destinations
              <ChevronRight className='h-4 w-4' />
            </Link>
          </Button>
        </div>
      </div>
      <InviteTeammatesCard
        hint='— Not sure which destination to connect? Ask someone with access to help you'
        docsLabel='Learn more about Google Sheets destination'
        docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
      />
    </div>
  );
}
