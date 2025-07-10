import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import { GoogleSheetsIcon } from '../../../../../../shared';
import type { DataMartReport } from '../../model/types/data-mart-report';
import { type ReactNode } from 'react';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ReportStatus } from '../ReportStatus';
import { getGoogleSheetTabUrl } from '../../utils';

interface ReportHoverCardProps {
  report: DataMartReport;
  children: ReactNode;
}

export function ReportHoverCard({ report, children }: ReportHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className='text-sm hover:cursor-help'>{children}</div>
      </HoverCardTrigger>
      <HoverCardContent className='w-110'>
        <div className='space-y-3'>
          <div>
            <h4 className='text-sm font-semibold'>{report.title || 'Unnamed Report'}</h4>
            <p className='text-muted-foreground text-xs'>ID: {report.id}</p>
          </div>

          <div className='grid grid-cols-2 gap-2'>
            <div>
              <p className='text-xs font-medium'>Last Run Status</p>
              {report.lastRunStatus ? (
                <div className='mt-1'>
                  <ReportStatus status={report.lastRunStatus} />
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>Not run yet</p>
              )}
            </div>
            <div>
              <p className='text-xs font-medium'>Last Run</p>
              <p className='text-sm'>
                {report.lastRunDate ? <RelativeTime date={report.lastRunDate} /> : 'Never run'}
              </p>
            </div>
            <div>
              <p className='text-xs font-medium'>Total Runs</p>
              <p className='text-sm'>{report.runsCount || 0}</p>
            </div>
            <div>
              <p className='text-xs font-medium'>Destination</p>
              {report.destinationConfig.spreadsheetId ? (
                <a
                  href={getGoogleSheetTabUrl(
                    report.destinationConfig.spreadsheetId,
                    report.destinationConfig.sheetId
                  )}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center gap-2 text-sm text-blue-500 hover:underline'
                >
                  <GoogleSheetsIcon size={16} />
                  Google Sheet
                </a>
              ) : (
                <p className='text-sm'>Not specified</p>
              )}
            </div>
          </div>

          {report.lastRunError && (
            <div>
              <p className='text-destructive text-xs'>{report.lastRunError}</p>
            </div>
          )}

          <div className='border-t pt-2'>
            <div className='text-muted-foreground flex justify-between text-xs'>
              <div>
                <span className='font-medium'>Created:</span>{' '}
                {new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(report.createdAt))}
              </div>
              <div>
                <span className='font-medium'>Modified:</span>{' '}
                {new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(report.modifiedAt))}
              </div>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
