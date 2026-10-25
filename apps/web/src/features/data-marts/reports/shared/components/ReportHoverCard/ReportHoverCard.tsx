import React, { useMemo, useCallback } from 'react';
import {
  HoverCardHeader,
  HoverCardHeaderText,
  HoverCardHeaderIcon,
  HoverCardHeaderTitle,
  HoverCardHeaderDescription,
  HoverCardBody,
  HoverCardItem,
  HoverCardItemLabel,
  HoverCardItemValue,
  HoverCardFooter,
} from '@owox/ui/components/hover-card';
import { DataDestinationTypeModel } from '../../../../../data-destination';
import type { DataMartReport } from '../../model/types/data-mart-report';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { getReportGoogleSheetUrl } from '../../utils';
import { Button } from '@owox/ui/components/button';
import { ExternalLink } from 'lucide-react';
import { StatusLabel } from '../../../../../../shared/components/StatusLabel';
import { DetailsPopover } from '../../../../../../shared/components/DetailsPopover';
import { mapReportStatusToStatusType, getReportStatusText } from '../../../../shared';

interface ReportHoverCardProps {
  report: DataMartReport;
  /** Extra classes for the info button, e.g. hover-reveal classes of a table cell */
  className?: string;
}

const useDateFormatters = () => {
  const detailedDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  return { detailedDateFormatter, shortDateFormatter };
};

export const ReportHoverCard = React.memo(
  function ReportHoverCard({ report, className }: ReportHoverCardProps) {
    const { detailedDateFormatter, shortDateFormatter } = useDateFormatters();

    const statusInfo = useMemo(() => {
      if (!report.lastRunStatus) return null;
      return {
        statusType: mapReportStatusToStatusType(report.lastRunStatus),
        statusText: getReportStatusText(report.lastRunStatus),
      };
    }, [report.lastRunStatus]);

    const formattedDates = useMemo(() => {
      return {
        modifiedAt: detailedDateFormatter.format(new Date(report.modifiedAt)),
        createdAt: shortDateFormatter.format(new Date(report.createdAt)),
      };
    }, [report.modifiedAt, report.createdAt, detailedDateFormatter, shortDateFormatter]);

    const DestinationIcon = useMemo(() => {
      return DataDestinationTypeModel.getInfo(report.dataDestination.type).icon;
    }, [report.dataDestination.type]);

    const documentUrl = useMemo(() => getReportGoogleSheetUrl(report), [report]);

    const handleGoogleSheetOpen = useCallback(() => {
      if (!documentUrl) return;
      window.open(documentUrl, '_blank', 'noopener,noreferrer');
    }, [documentUrl]);

    return (
      <DetailsPopover label='Report details' className={className}>
        <HoverCardHeader>
          <HoverCardHeaderIcon>
            <DestinationIcon size={20} />
          </HoverCardHeaderIcon>
          <HoverCardHeaderText>
            <HoverCardHeaderTitle>{report.title || 'Unnamed Report'}</HoverCardHeaderTitle>
            <HoverCardHeaderDescription>
              Last modified <RelativeTime date={new Date(report.modifiedAt)} />
            </HoverCardHeaderDescription>
          </HoverCardHeaderText>
        </HoverCardHeader>

        <HoverCardBody>
          {statusInfo && (
            <HoverCardItem>
              <HoverCardItemLabel>Last run status:</HoverCardItemLabel>
              <HoverCardItemValue>
                <StatusLabel type={statusInfo.statusType} variant='ghost'>
                  {statusInfo.statusText}
                </StatusLabel>
              </HoverCardItemValue>
            </HoverCardItem>
          )}
          {report.lastRunDate && (
            <HoverCardItem>
              <HoverCardItemLabel>Last run date:</HoverCardItemLabel>
              <HoverCardItemValue>
                <RelativeTime date={report.lastRunDate} />
              </HoverCardItemValue>
            </HoverCardItem>
          )}
          {report.lastRunError && (
            <HoverCardItem>
              <HoverCardItemLabel>Error message:</HoverCardItemLabel>
              <HoverCardItemValue>{report.lastRunError}</HoverCardItemValue>
            </HoverCardItem>
          )}
          <HoverCardItem>
            {report.runsCount > 0 ? <HoverCardItemLabel>Total runs:</HoverCardItemLabel> : ''}
            <HoverCardItemValue>
              {report.runsCount === 0
                ? 'No runs'
                : `${report.runsCount.toString()} run${report.runsCount > 1 ? 's' : ''}`}
              {formattedDates.createdAt && <>, since {formattedDates.createdAt}</>}
            </HoverCardItemValue>
          </HoverCardItem>
        </HoverCardBody>

        {documentUrl && (
          <HoverCardFooter>
            <Button
              className='w-full'
              variant='default'
              onClick={handleGoogleSheetOpen}
              title='Open document'
              aria-label='Open document'
            >
              Open document
              <ExternalLink className='ml-1 inline h-4 w-4' aria-hidden='true' />
            </Button>
          </HoverCardFooter>
        )}
      </DetailsPopover>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent unnecessary re-renders
    return (
      prevProps.className === nextProps.className &&
      prevProps.report.id === nextProps.report.id &&
      prevProps.report.title === nextProps.report.title &&
      prevProps.report.modifiedAt === nextProps.report.modifiedAt &&
      prevProps.report.lastRunStatus === nextProps.report.lastRunStatus &&
      prevProps.report.lastRunDate === nextProps.report.lastRunDate &&
      prevProps.report.lastRunError === nextProps.report.lastRunError &&
      prevProps.report.runsCount === nextProps.report.runsCount &&
      prevProps.report.createdAt === nextProps.report.createdAt &&
      prevProps.report.dataDestination.type === nextProps.report.dataDestination.type &&
      JSON.stringify(prevProps.report.destinationConfig) ===
        JSON.stringify(nextProps.report.destinationConfig)
    );
  }
);
