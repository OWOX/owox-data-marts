import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { type ComponentPropsWithoutRef, useCallback } from 'react';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';
import { LookerStudioReportCardActionLeft } from './LookerStudioReportCardActionLeft';
import { LookerStudioReportCardContent } from './LookerStudioReportCardContent';
import { LookerStudioReportCardTitle } from './LookerStudioReportCardTitle';
import { LookerStudioReportCardDescription } from './LookerStudioReportCardDescription';
import { LookerStudioReportCardActionRight } from './LookerStudioReportCardActionRight';
import { useLookerStudioReport } from './hooks/useLookerStudioReport';

// Main container component
interface LookerStudioReportCardProps extends ComponentPropsWithoutRef<'div'> {
  destination: DataDestination;
  dataMartStatus?: DataMartStatusInfo;
  onEditReport: (report: DataMartReport) => void;
  className?: string;
}

export function LookerStudioReportCard({
  destination,
  dataMartStatus,
  onEditReport,
  className,
  ...props
}: LookerStudioReportCardProps) {
  const { existingReport, isLoading, isEnabled, isChecked, dynamicTitle, handleSwitchChange } =
    useLookerStudioReport(destination, dataMartStatus);

  const handleCardClick = useCallback(() => {
    // Open edit sheet if report exists
    if (existingReport) {
      onEditReport(existingReport);
    }
  }, [existingReport, onEditReport]);

  const handleSwitchClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'group flex items-start justify-center gap-3 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2',
        existingReport && 'cursor-pointer dark:hover:bg-white/5',
        className
      )}
      onClick={
        existingReport
          ? () => {
              handleCardClick();
            }
          : undefined
      }
      {...props}
    >
      {/* Left action area - Switch */}
      <LookerStudioReportCardActionLeft onClick={handleSwitchClick}>
        {isLoading ? (
          <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Switch
                  checked={isChecked}
                  onCheckedChange={checked => {
                    void handleSwitchChange(checked);
                  }}
                  disabled={!isEnabled}
                  aria-label={`${isChecked ? 'Disable' : 'Enable'} Looker Studio access`}
                />
              </span>
            </TooltipTrigger>

            <TooltipContent>
              {!isEnabled ? (
                <>
                  <p>To enable Looker Studio reports, publish the Data Mart first</p>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    Data Marts must be published before creating reports
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {isChecked
                      ? 'Data Mart is accessible for Looker Studio'
                      : 'Data Mart is not accessible for Looker Studio'}
                  </p>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {isChecked ? 'Turn off to remove access' : 'Turn on to enable access'}
                  </p>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </LookerStudioReportCardActionLeft>

      {/* Content area */}
      <LookerStudioReportCardContent>
        <LookerStudioReportCardTitle>{dynamicTitle}</LookerStudioReportCardTitle>
        <LookerStudioReportCardDescription>
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
                "Data not fetched yet, still waiting for Looker Studio's first visit"
              )}
            </>
          ) : (
            'Turn on to enable access'
          )}
        </LookerStudioReportCardDescription>
      </LookerStudioReportCardContent>

      {/* Right action area - Chevron (only when report exists) */}
      {isChecked && existingReport && (
        <LookerStudioReportCardActionRight>
          <div className='flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-gray-200/50 dark:group-hover:bg-gray-700/25'>
            <ChevronRight className='text-muted-foreground/75 dark:text-muted-foreground/50 h-4 w-4' />
          </div>
        </LookerStudioReportCardActionRight>
      )}
    </div>
  );
}
