import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router';
import type { DataMartContextType } from '../../../../data-marts/edit/model/context/types';
import { useReport } from '../../../../data-marts/reports/shared/model/hooks';
import { useDataDestination } from './useDataDestination';

/**
 * Custom hook to fetch data destinations and associated reports for a specific Data Mart
 * - Combines multiple loading states into a single `isLoading` value
 * - Provides all destinations ready for presentation
 */
export function useDataDestinationsWithReports() {
  // Get the current Data Mart from outlet context
  const { dataMart } = useOutletContext<DataMartContextType>();
  const dataMartId = dataMart?.id;

  // Hook to manage reports
  const { fetchReportsByDataMartId } = useReport();

  // Hook to manage data destinations
  const {
    dataDestinations,
    fetchDataDestinations,
    loading: destinationsLoading,
  } = useDataDestination();

  // Local loading state for combined fetch
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!dataMartId) return; // If no Data Mart, exit early

    const fetchData = async () => {
      setIsLoading(true); // Start combined loading
      try {
        // Fetch both destinations and reports concurrently
        await Promise.all([fetchDataDestinations(), fetchReportsByDataMartId(dataMartId)]);
      } catch (err) {
        console.error('Failed to fetch Data Mart destinations or reports:', err);
      } finally {
        setIsLoading(false); // End combined loading
      }
    };

    void fetchData();
  }, [dataMartId, fetchDataDestinations, fetchReportsByDataMartId]);

  // Combine local loading with destinationsLoading from the DataDestination hook
  const combinedLoading = isLoading || destinationsLoading;

  return {
    dataDestinations,
    isLoading: combinedLoading,
    fetchDataDestinations,
  };
}
