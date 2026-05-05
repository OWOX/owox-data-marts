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
  type DataDestinationFormData,
} from '../../../features/data-destination/shared';
import { DataDestinationConfigSheet } from '../../../features/data-destination/edit';
import { ReportsProvider } from '../../../features/data-marts/reports/shared/model/context';
import { useDataMartReportsAutoRefresh } from '../../../features/data-marts/reports/shared/model/hooks/useDataMartReportsAutoRefresh';
import { useOnboardingVideo } from '../../../shared/hooks/useOnboardingVideo';
import { DataMartStatus } from '../../../features/data-marts/shared/enums';
import { PromoBlock } from '../../../shared/components/PromoBlock/PromoBlock';
import { GoogleSheetsIcon } from '../../../shared/icons/google-sheets-icon';

function DataMartDestinationsContentInner() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { dataDestinations, isLoading, fetchDataDestinations } = useDataDestinationsWithReports();
  const [isCreateDestinationOpen, setIsCreateDestinationOpen] = useState(false);

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
            <PromoBlock
              icon={GoogleSheetsIcon}
              size='compact'
              title='Use your data in&nbsp;Google&nbsp;Sheets'
              description='No SQL needed — add columns and analyze data directly in&nbsp;Sheets'
              primaryAction={{
                label: 'Add Google Sheets Destination',
                onClick: handleOpenCreateDestination,
              }}
              secondaryAction={{
                label: 'Learn more',
                href: 'https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=no_sheets_destination',
                external: true,
              }}
            />
          )}
        </>
      )}

      <DataDestinationConfigSheet
        isOpen={isCreateDestinationOpen}
        onClose={handleCloseCreateDestination}
        dataDestination={null}
        initialFormData={
          {
            title: 'New Google Sheets Destination',
            type: DataDestinationType.GOOGLE_SHEETS,
          } as DataDestinationFormData
        }
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
