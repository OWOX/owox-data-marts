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
} from '../../../features/data-destination/shared';
import { ReportsProvider } from '../../../features/data-marts/reports/shared/model/context';
import { useDataMartReportsAutoRefresh } from '../../../features/data-marts/reports/shared/model/hooks/useDataMartReportsAutoRefresh';
import { useOnboardingVideo } from '../../../shared/hooks/useOnboardingVideo';

function DataMartDestinationsContentInner() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { dataDestinations, isLoading } = useDataDestinationsWithReports();
  // Centralized reports polling for this Data Mart
  useDataMartReportsAutoRefresh({ enabled: true, intervalMs: 5000 });

  // Show onboarding video about email reports if the user has not seen it yet
  const shouldShowOnboarding = !isLoading && dataDestinations.length === 0;
  useOnboardingVideo({
    storageKey: 'email-reports-onboarding-video-shown',
    popoverId: 'video-6-email-reports',
    shouldShow: shouldShowOnboarding,
  });

  if (!dataMart) return null;

  return (
    <div className='flex flex-col gap-4' data-testid='destTab'>
      {isLoading ? (
        <SkeletonList />
      ) : dataDestinations.length === 0 ? (
        <EmptyDataMartDestinationsState />
      ) : (
        dataDestinations.map((destination: DataDestination) => (
          <DestinationCard
            key={destination.id}
            destination={destination}
            dataMartStatus={dataMart.status}
          />
        ))
      )}
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
