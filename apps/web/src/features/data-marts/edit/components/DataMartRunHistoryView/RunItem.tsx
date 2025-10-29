import { useCallback, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
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
  getRunSummary,
  parseLogEntry,
  getStartedAtDisplay,
  getTooltipContent,
} from './utils';
import { getTriggerTypeIcon } from './icons';
import { useClipboard } from '../../../../../hooks/useClipboard';
import { TypeIcon } from './TypeIcon';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

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
  connectorInfo: ConnectorListItem | null;
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
  connectorInfo,
}: RunItemProps) {
  const { copiedSection, handleCopy } = useClipboard();

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
        />
      );
    }
  }, [logViewType, filteredLogs, run.logs, run.errors, run.definitionRun, run.reportDefinition]);

  const startedAtValue = getStartedAtDisplay(run);
  const tooltipContent = getTooltipContent(run);

  return (
    <div className='dm-card-block'>
      <div
        className='flex cursor-pointer items-center justify-between'
        onClick={() => {
          onToggle(run.id);
        }}
      >
        <div className='flex items-center gap-3'>
          <div>
            <TypeIcon type={run.type} connectorInfo={connectorInfo} />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className='text-foreground align-center flex items-center font-mono text-sm font-medium'>
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

          <div className='text-muted-foreground ml-6 flex items-center gap-1 text-sm'>
            {getTriggerTypeIcon(run.triggerType)}
            {getRunSummary(run, connectorInfo)}
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <StatusBadge status={run.status} />
          <ChevronRight
            className={`text-muted-foreground h-4 w-4 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {isExpanded && (
        <div className='border-border bg-muted/30 space-y-4 border-t p-4'>
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
        </div>
      )}
    </div>
  );
}
