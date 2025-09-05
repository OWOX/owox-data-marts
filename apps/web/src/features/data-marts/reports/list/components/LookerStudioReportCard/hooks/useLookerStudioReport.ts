import { useState, useMemo, useCallback } from 'react';
import { useReport } from '../../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../../edit/model/context/types';
import type { DataDestination } from '../../../../../../data-destination/shared/model/types';
import { DataDestinationType } from '../../../../../../data-destination/shared/enums';
import { DestinationTypeConfigEnum } from '../../../../shared/enums/destination-type-config.enum';
import { DataMartStatus } from '../../../../../shared/enums/data-mart-status.enum';

export function useLookerStudioReport(destination: DataDestination) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { reports, createReport, deleteReport, fetchReportsByDataMartId } = useReport();
  const [isLoading, setIsLoading] = useState(false);

  // Find existing report for this destination
  const existingReport = useMemo(() => {
    return reports.find(
      report =>
        report.dataDestination.type === DataDestinationType.LOOKER_STUDIO &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id]);

  const isEnabled = useMemo(
    () => dataMart?.status.code === DataMartStatus.PUBLISHED,
    [dataMart?.status.code]
  );
  const isChecked = useMemo(() => !!existingReport, [existingReport]);

  const dynamicTitle = useMemo(
    () => (isChecked ? 'Available in Looker Studio' : 'Not available in Looker Studio'),
    [isChecked]
  );

  const handleSwitchChange = useCallback(
    async (checked: boolean) => {
      if (!dataMart || !isEnabled) return;

      setIsLoading(true);

      try {
        if (checked) {
          const reportData = {
            title: `Looker Studio Report - ${destination.title}`,
            dataMartId: dataMart.id,
            dataDestinationId: destination.id,
            destinationConfig: {
              type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG as const,
              cacheLifetime: 300,
            },
          };

          await createReport(reportData);
          await fetchReportsByDataMartId(dataMart.id);
        } else {
          if (existingReport) {
            await deleteReport(existingReport.id);
            await fetchReportsByDataMartId(dataMart.id);
          }
        }
      } catch (err) {
        console.error('Failed to toggle Looker Studio report:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      dataMart,
      isEnabled,
      destination,
      existingReport,
      createReport,
      deleteReport,
      fetchReportsByDataMartId,
    ]
  );

  return {
    existingReport,
    isLoading,
    isEnabled,
    isChecked,
    dynamicTitle,
    handleSwitchChange,
  };
}
