import { useState, type MouseEvent } from 'react';
import { Plus, MoreVertical, Pencil, Trash2, Calendar, Clock, Play } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { StatusIcon } from '../../reports/list';
import {
  useReportsByInsightTemplate,
  useDeleteReport,
  useRunReport,
} from '../../reports/list/model/hooks/useReportsByInsightTemplate';
import type { DataMartReport } from '../../reports/shared/model/types/data-mart-report';
import { toast } from 'react-hot-toast';
import { DataDestinationType, DataDestinationTypeModel } from '../../../data-destination';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { ReportStatusEnum } from '../../reports/shared';
import { trackEvent } from '../../../../utils';

interface InsightReportsListProps {
  dataMartId: string;
  insightId: string;
  onEditReport: (report: DataMartReport) => void;
  onCreateReport: () => void;
}

export function InsightReportsList({
  dataMartId,
  insightId,
  onEditReport,
  onCreateReport,
}: InsightReportsListProps) {
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const {
    data: reports = [],
    isLoading,
    refetch,
  } = useReportsByInsightTemplate(dataMartId, insightId);
  const deleteReport = useDeleteReport();
  const runReport = useRunReport();
  const getDestinationIcon = (type: string) => {
    const info = DataDestinationTypeModel.getInfo(type as DataDestinationType);
    const Icon = info.icon;
    return <Icon size={16} />;
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;

    try {
      await deleteReport.mutateAsync(reportToDelete);
      trackEvent({
        event: 'report_deleted',
        category: 'Insights',
        action: 'Delete Report',
        label: reportToDelete,
        context: `${dataMartId}:${insightId}`,
      });
      toast.success('Report deleted');
      setReportToDelete(null);
      void refetch();
    } catch {
      trackEvent({
        event: 'report_error',
        category: 'Insights',
        action: 'DeleteReportError',
        label: reportToDelete,
        context: `${dataMartId}:${insightId}`,
      });
      toast.error('Failed to delete report');
    }
  };

  const handleRun = async (reportId: string, event?: MouseEvent) => {
    event?.stopPropagation();
    try {
      await runReport.mutateAsync(reportId);
      trackEvent({
        event: 'report_run',
        category: 'Insights',
        action: 'Run Report',
        label: reportId,
        context: `${dataMartId}:${insightId}`,
      });
      await refetch();
    } catch {
      trackEvent({
        event: 'report_error',
        category: 'Insights',
        action: 'RunReportError',
        label: reportId,
        context: `${dataMartId}:${insightId}`,
      });
      toast.error('Failed to run report');
    }
  };

  if (isLoading) {
    return (
      <div className='text-muted-foreground flex h-20 items-center justify-center text-sm'>
        Loading reports...
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      {reports.length === 0 ? (
        <div className='bg-muted/30 flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center'>
          <div className='mb-4 flex flex-col'>
            <p className='text-sm font-medium'>Schedule your insights</p>
            <p className='text-muted-foreground text-xs'>Automate delivery to your destinations</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='outline' onClick={onCreateReport} className='gap-2 shadow-sm'>
                  <Plus className='h-4 w-4' />
                  New Report
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Create a new report for this insight</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <>
          <div className='bg-muted/30 hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 shadow-xs transition-all'>
            <div className='flex items-center gap-3'>
              <div className='bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full'>
                <Calendar className='text-primary h-5 w-5' />
              </div>
              <div className='flex flex-col'>
                <p className='text-sm font-medium'>Schedule your insights</p>
                <p className='text-muted-foreground text-xs'>
                  Automate delivery to your destinations
                </p>
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={onCreateReport}
                    className='shrink-0 gap-2 shadow-sm'
                  >
                    <Plus className='h-4 w-4' />
                    New Report
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='top'>Create a new report for this insight</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className='mt-0'>
            {reports.map(report => (
              <div
                key={report.id}
                className='bg-background group relative mb-3 flex cursor-pointer flex-col overflow-hidden rounded-lg border shadow-xs transition-all last:mb-0 hover:shadow-md'
                onClick={() => {
                  onEditReport(report);
                }}
              >
                <div className='flex items-start justify-between gap-4 p-4 pb-3'>
                  <div className='flex flex-col gap-1.5'>
                    <div className='flex items-center gap-2'>
                      <div className='flex w-5 shrink-0 items-center justify-center'>
                        {report.lastRunStatus ? (
                          <StatusIcon
                            status={report.lastRunStatus}
                            error={report.lastRunError}
                            className='h-4 w-4'
                          />
                        ) : (
                          <div className='bg-muted h-2 w-2 rounded-full' title='Never run' />
                        )}
                      </div>
                      <h4 className='line-clamp-1 leading-tight font-medium'>{report.title}</h4>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='flex w-5 shrink-0 items-center justify-center'>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className='text-muted-foreground cursor-help'>
                                {getDestinationIcon(report.dataDestination.type)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                              <span className='capitalize'>
                                {
                                  DataDestinationTypeModel.getInfo(
                                    report.dataDestination.type as DataDestinationType
                                  ).displayName
                                }
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className='text-muted-foreground text-xs font-medium'>
                        {report.dataDestination.title}
                      </span>
                    </div>
                  </div>
                  <div className='flex shrink-0 gap-1'>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100 disabled:opacity-60'
                            disabled={
                              runReport.isPending ||
                              report.lastRunStatus === ReportStatusEnum.RUNNING
                            }
                            aria-label='Run report'
                            onClick={e => void handleRun(report.id, e)}
                          >
                            <Play className='h-4 w-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side='top'>Run report</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          onClick={e => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-40'>
                        <DropdownMenuItem
                          onClick={e => void handleRun(report.id, e)}
                          disabled={
                            runReport.isPending || report.lastRunStatus === ReportStatusEnum.RUNNING
                          }
                        >
                          <Play className='mr-2 h-4 w-4' />
                          Run report
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={e => {
                            e.stopPropagation();
                            onEditReport(report);
                          }}
                        >
                          <Pencil className='mr-2 h-4 w-4' />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant='destructive'
                          onClick={e => {
                            e.stopPropagation();
                            setReportToDelete(report.id);
                          }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className='bg-muted/30 flex h-9 flex-wrap items-center border-t px-4 text-xs'>
                  <div className='flex items-center gap-2'>
                    <div className='flex w-5 shrink-0 items-center justify-center'>
                      <Clock className='text-muted-foreground h-4 w-4' />
                    </div>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-muted-foreground'>Last run:</span>
                      <span className='font-medium'>
                        {report.lastRunDate ? (
                          <RelativeTime date={new Date(report.lastRunDate)} />
                        ) : (
                          'Never'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmationDialog
        open={!!reportToDelete}
        onOpenChange={open => {
          if (!open) setReportToDelete(null);
        }}
        title='Delete Report'
        description='Are you sure you want to delete this report? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => void handleDelete()}
        variant='destructive'
      />
    </div>
  );
}
