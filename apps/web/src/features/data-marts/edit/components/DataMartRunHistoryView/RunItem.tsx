import { ChevronRight, MessageSquare } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { LogControls } from './LogControls';
import { StructuredLogsView } from './StructuredLogsView';
import { RawLogsView } from './RawLogsView';
import { ConfigurationView } from './ConfigurationView';
import type { DataMartRunItem } from '../../model/types/data-mart-run';
import { CopyButton } from './CopyButton';
import { useState } from 'react';
import type { LogViewType } from './types';
import { formatDate, getDisplayType, getRunSummary, parseLogEntry } from './utils';
import { getStatusIcon } from './icons';

interface RunItemProps {
  run: DataMartRunItem;
  isExpanded: boolean;
  onToggle: (runId: string) => void;
  logViewType: LogViewType;
  setLogViewType: (type: LogViewType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function RunItem({
  run,
  isExpanded,
  onToggle,
  logViewType,
  setLogViewType,
  searchTerm,
  setSearchTerm,
}: RunItemProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => {
        setCopiedSection(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleCopy = (text: string, section: string) => {
    void copyToClipboard(text, section);
  };

  const getFilteredLogs = () => {
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
  };

  const renderLogsContent = () => {
    if (logViewType === 'structured') {
      const filteredLogs = getFilteredLogs();
      return <StructuredLogsView logs={filteredLogs} />;
    } else if (logViewType === 'raw') {
      return <RawLogsView logs={run.logs} errors={run.errors} />;
    } else {
      return <ConfigurationView definitionRun={run.definitionRun} />;
    }
  };

  return (
    <div
      className='dm-card-block cursor-pointer'
      onClick={() => {
        onToggle(run.id);
      }}
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          {getStatusIcon(run.status)}
          <div className='text-foreground font-mono text-sm font-medium'>
            {formatDate(run.createdAt)}
          </div>
          <div className='text-muted-foreground flex items-center gap-1 text-xs'>
            <MessageSquare className='h-3 w-3' />
            {getRunSummary(run)}
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
          />

          {renderLogsContent()}
        </div>
      )}
    </div>
  );
}
