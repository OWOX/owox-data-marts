import { useCallback, useState } from 'react';
import {
  DestinationCard,
  EmptyDataMartDestinationsState,
} from '../../../features/data-marts/reports/list/components';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../features/data-marts/edit/model/context/types';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import {
  useDataDestinationsWithReports,
  DataDestinationProvider,
  type DataDestination,
  DataDestinationType,
} from '../../../features/data-destination/shared';
import { DataDestinationConfigSheet } from '../../../features/data-destination/edit';
import { ReportsProvider } from '../../../features/data-marts/reports/shared/model/context';
import { useDataMartReportsAutoRefresh } from '../../../features/data-marts/reports/shared/model/hooks/useDataMartReportsAutoRefresh';
import { useOnboardingVideo } from '../../../shared/hooks/useOnboardingVideo';
import { DataMartStatus } from '../../../features/data-marts/shared/enums';
import { PromoBlock } from '../../../shared/components/PromoBlock/PromoBlock';
import { GoogleSheetsIcon } from '../../../shared/icons/google-sheets-icon';
import { InviteTeammatesCard } from '../../../shared/components/InviteTeammatesCard';
import { useProjectRoute } from '../../../shared/hooks/useProjectRoute';

function DataMartDestinationsContentInner() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { dataDestinations, isLoading, fetchDataDestinations } = useDataDestinationsWithReports();
  const [isCreateDestinationOpen, setIsCreateDestinationOpen] = useState(false);
  const { scope } = useProjectRoute();
  const handleOpenCreateDestination = useCallback(() => {
    setIsCreateDestinationOpen(true);
  }, []);

  const handleCloseCreateDestination = useCallback(() => {
    setIsCreateDestinationOpen(false);
  }, []);
  // Centralized reports polling for this Data Mart
  useDataMartReportsAutoRefresh({ enabled: true, intervalMs: 5000 });

  // Show onboarding video about email reports if the user has not seen it yet
  const shouldShowOnboarding = !isLoading && dataDestinations.length === 0;
  useOnboardingVideo({
    storageKey: 'email-reports-onboarding-video-shown',
    popoverId: 'video-6-email-reports',
    shouldShow: shouldShowOnboarding,
  });

  const isPublished = dataMart?.status.code === DataMartStatus.PUBLISHED;

  const hasGoogleSheetsDestination = dataDestinations.some(
    destination => destination.type === DataDestinationType.GOOGLE_SHEETS
  );

  const showSheetsUpsellPromo =
    dataDestinations.length > 0 && !hasGoogleSheetsDestination && isPublished;

  if (!dataMart) return null;

  return (
    <div className='flex flex-col gap-4' data-testid='destTab'>
      {isLoading ? (
        <SkeletonList />
      ) : dataDestinations.length === 0 ? (
        <EmptyDataMartDestinationsState
          variant={isPublished ? 'promo' : 'default'}
          onOpenCreateDestination={isPublished ? handleOpenCreateDestination : undefined}
        />
      ) : (
        <>
          {dataDestinations.map((destination: DataDestination) => (
            <DestinationCard
              key={destination.id}
              destination={destination}
              dataMartStatus={dataMart.status}
            />
          ))}
          {showSheetsUpsellPromo && (
            <div className='flex flex-col gap-0.5'>
              <PromoBlock
                icon={GoogleSheetsIcon}
                size='compact'
                title='Analyze your data in&nbsp;Google Sheets'
                description='Access live data directly in&nbsp;Sheets&nbsp;— choose columns and build reports without SQL or&nbsp;CSV&nbsp;exports.'
                primaryAction={{
                  label: 'Connect Google Sheets',
                  onClick: handleOpenCreateDestination,
                }}
                secondaryAction={{
                  label: 'View all destinations',
                  href: scope('/data-destinations'),
                }}
              />
              <InviteTeammatesCard
                hint='— Ask colleagues to configure Google Sheets destination'
                docsLabel='Learn more about Google Sheets destination'
                docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=no_sheets_destination_invite_teammates_card'
              />
            </div>
          )}
        </>
      )}

      <DataDestinationConfigSheet
        isOpen={isCreateDestinationOpen}
        onClose={handleCloseCreateDestination}
        dataDestination={null}
        initialFormData={{
          title: 'New Google Sheets Destination',
          type: DataDestinationType.GOOGLE_SHEETS,
          credentials: {
            serviceAccount: '',
            credentialId: null,
          },
        }}
        allowedDestinationTypes={[DataDestinationType.GOOGLE_SHEETS]}
        onSaveSuccess={() => {
          void fetchDataDestinations().then(() => {
            setIsCreateDestinationOpen(false);
          });
        }}
      />
    </div>
  );
}

export default function DataMartDestinationsContent() {
  return (
    <DataDestinationProvider>
      <ReportsProvider>
        <DataMartDestinationsContentInner />
      </ReportsProvider>
    </DataDestinationProvider>
  );
}
