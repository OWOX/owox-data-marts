import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useReport } from '../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types';
import { DataDestinationType } from '../../../../../data-destination/shared/enums';
import { DestinationTypeConfigEnum } from '../../../shared/enums/destination-type-config.enum';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';

// Main container component
interface LookerStudioReportCardProps extends ComponentPropsWithoutRef<'div'> {
  destination: DataDestinationResponseDto;
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
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { reports, createReport, deleteReport, fetchReportsByDataMartId } = useReport();

  // Find existing report for this destination
  const existingReport = useMemo(() => {
    return reports.find(
      report =>
        report.dataDestination.type === DataDestinationType.LOOKER_STUDIO &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id]);

  const [isLoading, setIsLoading] = useState(false);

  const isEnabled = useMemo(
    () => dataMartStatus?.code === DataMartStatus.PUBLISHED,
    [dataMartStatus?.code]
  );
  const isChecked = useMemo(() => !!existingReport, [existingReport]);

  // Generate title based on switch state
  const dynamicTitle = useMemo(
    () => (isChecked ? 'Available in Looker Studio' : 'Not available in Looker Studio'),
    [isChecked]
  );

  const handleSwitchChange = async (checked: boolean) => {
    if (!dataMart || !isEnabled) return;

    setIsLoading(true);

    try {
      if (checked) {
        // Create new report
        const reportData = {
          title: `Looker Studio Report - ${destination.title}`,
          dataMartId: dataMart.id,
          dataDestinationId: destination.id,
          destinationConfig: {
            type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG as const,
            cacheLifetime: 300, // Default 5 minutes cache
          },
        };

        await createReport(reportData);
        await fetchReportsByDataMartId(dataMart.id);
      } else {
        // Delete existing report
        if (existingReport) {
          await deleteReport(existingReport.id);
          await fetchReportsByDataMartId(dataMart.id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

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

// Sub-components for composition
interface LookerStudioReportCardActionLeftProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerStudioReportCardActionLeft({
  children,
  className,
  ...props
}: LookerStudioReportCardActionLeftProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-start justify-center py-5 pl-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface LookerStudioReportCardContentProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerStudioReportCardContent({
  children,
  className,
  ...props
}: LookerStudioReportCardContentProps) {
  return (
    <div className={cn('flex flex-grow flex-col gap-1 px-0 py-4', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerStudioReportCardTitleProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerStudioReportCardTitle({
  children,
  className,
  ...props
}: LookerStudioReportCardTitleProps) {
  return (
    <div className={cn('text-md font-medium', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerStudioReportCardDescriptionProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerStudioReportCardDescription({
  children,
  className,
  ...props
}: LookerStudioReportCardDescriptionProps) {
  return (
    <div className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children}
    </div>
  );
}

interface LookerStudioReportCardActionRightProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

export function LookerStudioReportCardActionRight({
  children,
  className,
  ...props
}: LookerStudioReportCardActionRightProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-center self-center p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
