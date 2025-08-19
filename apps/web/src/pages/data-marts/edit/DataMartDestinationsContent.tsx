import { useEffect, useState } from 'react';
import {
  ReportsProvider,
  useReport,
  DestinationCard,
  EmptyDataMartDestinationsState,
} from '../../../features/data-marts/reports/shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../features/data-marts/edit/model/context/types';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { useDataDestination } from '../../../features/data-destination/shared';
import { DataDestinationProvider } from '../../../features/data-destination/shared';

function DataMartDestinationsContentInner() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { fetchReportsByDataMartId } = useReport();
  const {
    dataDestinations,
    fetchDataDestinations,
    loading: destinationsLoading,
  } = useDataDestination();

  // Add loading state management
  const [isLoading, setIsLoading] = useState(true);

  // Fetch destinations and reports when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        if (!dataMart) return;
        await Promise.all([fetchDataDestinations(), fetchReportsByDataMartId(dataMart.id)]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [fetchDataDestinations, fetchReportsByDataMartId, dataMart]);

  if (!dataMart) {
    return null;
  }

  return (
    <div className='flex flex-col gap-4'>
      {isLoading || destinationsLoading ? (
        <SkeletonList />
      ) : dataDestinations.length === 0 ? (
        <EmptyDataMartDestinationsState />
      ) : (
        dataDestinations.map(destination => (
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
