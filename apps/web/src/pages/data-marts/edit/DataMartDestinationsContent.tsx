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

function DataMartDestinationsContentInner() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { destinations, fetchDestinations, fetchReportsByDataMartId } = useReport();

  // Add loading state management
  const [isLoading, setIsLoading] = useState(true);

  // Fetch destinations and reports when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        if (!dataMart) return;
        await Promise.all([fetchDestinations(), fetchReportsByDataMartId(dataMart.id)]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [fetchDestinations, fetchReportsByDataMartId, dataMart]);

  if (!dataMart) {
    return null;
  }

  return (
    <div className='flex flex-col gap-4'>
      {isLoading ? (
        <SkeletonList />
      ) : destinations.length === 0 ? (
        <EmptyDataMartDestinationsState />
      ) : (
        destinations.map(destination => (
          <DestinationCard key={destination.id} destination={destination} />
        ))
      )}
    </div>
  );
}

export default function DataMartDestinationsContent() {
  return (
    <ReportsProvider>
      <DataMartDestinationsContentInner />
    </ReportsProvider>
  );
}
