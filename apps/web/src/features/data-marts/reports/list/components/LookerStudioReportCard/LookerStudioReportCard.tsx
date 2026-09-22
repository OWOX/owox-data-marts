import RelativeTime from '@owox/ui/components/common/relative-time';
import {
  SwitchItemCard,
  SwitchItemCardChevronRight,
  SwitchItemCardContent,
  SwitchItemCardDescription,
  SwitchItemCardTitle,
  SwitchItemCardToggle,
} from '@owox/ui/components/common/switch-item-card';
import { Button } from '@owox/ui/components/button';
import { ExternalLink } from 'lucide-react';
import { type ComponentPropsWithoutRef, useCallback } from 'react';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useLookerStudioReport } from './hooks/useLookerStudioReport';

const LOOKER_STUDIO_CONNECTOR_ID =
  'AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A';

function getLookerStudioConnectionUrl(
  destinationId: string,
  reportId: string,
  dataSourceName: string
) {
  const url = new URL('https://datastudio.google.com/reporting/create');
  url.searchParams.set('ds.connector', 'community');
  url.searchParams.set('ds.connectorId', LOOKER_STUDIO_CONNECTOR_ID);
  url.searchParams.set('ds.datasourceName', dataSourceName);
  url.searchParams.set('ds.destinationId', destinationId);
  url.searchParams.set('ds.reportId', reportId);
  return url.toString();
}

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
        tooltipTextSwitchDisabled='Publish the Data Mart first to enable access in Data Studio'
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
                  {(existingReport.lastRunStatus === ReportStatusEnum.ERROR ||
                    existingReport.lastRunStatus === ReportStatusEnum.RESTRICTED) &&
                    ' but failed with error'}
                  {existingReport.lastRunError && (
                    <div className='mt-1 text-red-600 dark:text-red-400'>
                      {existingReport.lastRunError}
                    </div>
                  )}
                </>
              ) : (
                'Waiting for Data Studio to fetch data'
              )}
            </>
          ) : (
            'Switch on to enable access'
          )}
        </SwitchItemCardDescription>
      </SwitchItemCardContent>

      {isChecked && existingReport && (
        <Button asChild variant='outline' size='sm' className='shrink-0 self-center'>
          <a
            href={getLookerStudioConnectionUrl(
              destination.id,
              existingReport.id,
              existingReport.dataMart.title
            )}
            target='_blank'
            rel='noopener noreferrer'
            onClick={event => {
              event.stopPropagation();
            }}
          >
            Connect in Data Studio
            <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
          </a>
        </Button>
      )}

      {isChecked && existingReport && <SwitchItemCardChevronRight />}
    </SwitchItemCard>
  );
}
