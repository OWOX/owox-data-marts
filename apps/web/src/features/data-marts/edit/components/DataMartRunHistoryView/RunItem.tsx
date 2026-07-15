import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Box, ChevronDown } from 'lucide-react';
import { UserReference } from '../../../../../shared/components/UserReference';
import { StatusBadge } from './StatusBadge';
import { LogControls } from './LogControls';
import { StructuredLogsView } from './StructuredLogsView';
import { RawLogsView } from './RawLogsView';
import { ConfigurationView } from './ConfigurationView';
import type { DataMartRunItem } from '../../model/types/data-mart-run';
import { CopyButton } from '@owox/ui/components/common/copy-button';
import { LogViewType } from './types';
import {
  getDisplayType,
  getRunSummaryParts,
  parseLogEntry,
  getStartedAtDisplay,
  getTooltipContent,
} from './utils';
import { getTriggerTypeIcon } from './icons';
import { useClipboard } from '../../../../../hooks/useClipboard';
import { TypeIcon } from './TypeIcon';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartRunType } from '../../../shared';
import { DataQualityRunHistoryDetails } from './DataQualityRunHistoryDetails';
import { canCancelDataMartRun } from './cancellable-runs';
import { CancelRunButton } from './CancelRunButton';

interface RunItemProps {
  run: DataMartRunItem;
  isExpanded: boolean;
  onToggle: (runId: string) => void;
  logViewType: LogViewType;
  setLogViewType: (type: LogViewType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  cancelDataMartRun: (id: string, runId: string) => Promise<void>;
  dataMartId?: string;
  dataMartConnectorInfo: ConnectorListItem | null;
  dataMartRef?: {
    id: string;
    title: string;
    href: string;
  };
}

export function RunItem({
  run,
  isExpanded,
  onToggle,
  logViewType,
  setLogViewType,
  searchTerm,
  setSearchTerm,
  cancelDataMartRun,
  dataMartId,
  dataMartConnectorInfo,
  dataMartRef,
}: RunItemProps) {
  const { copiedSection, handleCopy } = useClipboard();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const isDataQualityRun = run.type === DataMartRunType.DATA_QUALITY;

  const filteredLogs = useMemo(() => {
    if (run.logs.length === 0 && run.errors.length === 0) return [];

    const parsedLogs = run.logs.map((log, index) => parseLogEntry(log, index));
    const parsedErrors = run.errors.map((error, index) =>
      parseLogEntry(error, run.logs.length + index, true)
    );

    const allParsedLogs = [...parsedLogs, ...parsedErrors];

    return allParsedLogs.filter(log => {
      const displayType = getDisplayType(log);
      const matchesSearch =
        searchTerm === '' ||
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        displayType.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });
  }, [run.logs, run.errors, searchTerm]);

  const renderLogsContent = useCallback(() => {
    if (logViewType === LogViewType.STRUCTURED) {
      return <StructuredLogsView logs={filteredLogs} />;
    } else if (logViewType === LogViewType.RAW) {
      return <RawLogsView logs={run.logs} errors={run.errors} />;
    } else {
      return (
        <ConfigurationView
          definitionRun={run.definitionRun}
          reportDefinition={run.reportDefinition}
          insightDefinition={run.insightDefinition}
          insightTemplateDefinition={run.insightTemplateDefinition}
          additionalParams={run.additionalParams}
        />
      );
    }
  }, [
    logViewType,
    filteredLogs,
    run.logs,
    run.errors,
    run.definitionRun,
    run.reportDefinition,
    run.insightDefinition,
    run.insightTemplateDefinition,
    run.additionalParams,
  ]);

  const startedAtValue = getStartedAtDisplay(run);
  const tooltipContent = getTooltipContent(run);
  const [runDescription, reportTitle] = getRunSummaryParts(run, dataMartConnectorInfo?.displayName);
  const startedAtContent = (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='text-foreground flex shrink-0 items-center font-mono text-sm font-medium whitespace-nowrap'>
          {startedAtValue}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className='space-y-1'>
          <div>Started At: {tooltipContent.startedAt}</div>
          <div>Finished At: {tooltipContent.finishedAt}</div>
          {tooltipContent.duration && <div>Duration: {tooltipContent.duration}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
  const runSummaryContent = (
    <div className='text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm'>
      {getTriggerTypeIcon(run.triggerType)}
      <div className='inline-flex min-w-0 items-center gap-2'>
        <span className='shrink-0'>{runDescription}</span>
        {run.createdByUser && (
          <>
            {' by '}
            <UserReference userProjection={run.createdByUser} />
          </>
        )}
        {reportTitle && (
          <>
            {' • '}
            <span className='truncate'>{reportTitle}</span>
          </>
        )}
      </div>
    </div>
  );
  const mainRowContent = dataMartRef ? (
    <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
      {startedAtContent}
      {runSummaryContent}
    </div>
  ) : (
    <div className='flex min-w-0 items-center gap-3'>
      {startedAtContent}
      {runSummaryContent}
    </div>
  );

  return (
    <div className='dm-card-block !gap-1'>
      {dataMartRef && (
        <div className='h-4 min-w-0 leading-4'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={dataMartRef.href}
                onClick={event => {
                  event.stopPropagation();
                }}
                className='text-muted-foreground hover:text-primary inline-flex h-4 max-w-full items-center gap-1.5 text-xs leading-4 font-medium transition-colors'
              >
                <Box className='h-3.5 w-3.5 shrink-0' />
                <span className='truncate'>{dataMartRef.title}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Open Data Mart</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div
        className='flex cursor-pointer items-center justify-between gap-4'
        onClick={() => {
          onToggle(run.id);
        }}
      >
        <div className='flex min-w-0 flex-1 items-center gap-3'>
          <TypeIcon type={run.type} base64Icon={dataMartConnectorInfo?.logoBase64} />
          <div className='min-w-0 flex-1'>{mainRowContent}</div>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <StatusBadge status={run.status} />
          <ChevronDown
            className={`text-muted-foreground h-4 w-4 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {isExpanded && (
        <div
          className='border-border bg-muted/30 mt-4 space-y-4 border-t p-4'
          data-testid='runLogView'
        >
          <div className='flex items-center'>
            <h3 className='text-foreground mr-2 font-medium'>Run ID: {run.id}</h3>
            <CopyButton
              text={run.id}
              section='run-id'
              onCopy={handleCopy}
              copiedSection={copiedSection}
              iconOnly={true}
            />
          </div>

          {isDataQualityRun && dataMartId ? (
            <>
              {canCancelDataMartRun(run.type, run.status) && (
                <div className='flex justify-end'>
                  <CancelRunButton
                    runId={run.id}
                    dataMartId={dataMartId}
                    cancelDataMartRun={cancelDataMartRun}
                    variant='destructive'
                    className='flex items-center gap-2'
                    iconClassName='h-4 w-4'
                    labelClassName='inline'
                  />
                </div>
              )}
              <DataQualityRunHistoryDetails
                projectId={projectId}
                dataMartId={dataMartId}
                runId={run.id}
              />
            </>
          ) : (
            <>
              <LogControls
                logViewType={logViewType}
                setLogViewType={setLogViewType}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                run={run}
                cancelDataMartRun={cancelDataMartRun}
                dataMartId={dataMartId}
              />

              {renderLogsContent()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
