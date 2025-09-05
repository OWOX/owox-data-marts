import { type ComponentPropsWithoutRef, useCallback } from 'react';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';
import RelativeTime from '@owox/ui/components/common/relative-time';
import {
  SwitchItemCard,
  SwitchItemCardContent,
  SwitchItemCardTitle,
  SwitchItemCardDescription,
  SwitchItemCardToggle,
  SwitchItemCardChevronRight,
} from '@owox/ui/components/common/switch-item-card';
import { useLookerStudioReport } from './hooks/useLookerStudioReport';

interface LookerStudioReportCardProps extends ComponentPropsWithoutRef<'div'> {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
}

export function LookerStudioReportCard({
  destination,
  onEditReport,
  ...props
}: LookerStudioReportCardProps) {
  const { existingReport, isLoading, isEnabled, isChecked, dynamicTitle, handleSwitchChange } =
    useLookerStudioReport(destination);

  const handleCardClick = useCallback(() => {
    if (existingReport) {
      onEditReport(existingReport);
    }
  }, [existingReport, onEditReport]);

  return (
    <SwitchItemCard
      className={existingReport ? 'cursor-pointer dark:hover:bg-white/5' : ''}
      onClick={existingReport ? handleCardClick : undefined}
      {...props}
    >
      <SwitchItemCardToggle
        checked={isChecked}
        disabled={!isEnabled}
        loading={isLoading}
        onCheckedChange={checked => void handleSwitchChange(checked)}
        tooltipTextSwitchOn='Switch off to remove access'
        tooltipTextSwitchOff='Switch on to enable access'
        tooltipTextSwitchDisabled='Publish the Data Mart first to enable access in Looker Studio'
      />

      <SwitchItemCardContent>
        <SwitchItemCardTitle>{dynamicTitle}</SwitchItemCardTitle>
        <SwitchItemCardDescription>
          {isChecked && existingReport ? (
            <>
              {existingReport.lastRunDate ? (
                <>
                  Last fetched{' '}
                  {existingReport.lastRunStatus === ReportStatusEnum.SUCCESS && 'successfully '}
                  <RelativeTime date={new Date(existingReport.lastRunDate)} />
                  {existingReport.lastRunStatus === ReportStatusEnum.ERROR &&
                    ' but failed with error'}
                  {existingReport.lastRunError && (
                    <div className='mt-1 text-red-600 dark:text-red-400'>
                      {existingReport.lastRunError}
                    </div>
                  )}
                </>
              ) : (
                'Waiting for Looker Studio to fetch data'
              )}
            </>
          ) : (
            'Switch on to enable access'
          )}
        </SwitchItemCardDescription>
      </SwitchItemCardContent>

      {isChecked && existingReport && <SwitchItemCardChevronRight />}
    </SwitchItemCard>
  );
}
