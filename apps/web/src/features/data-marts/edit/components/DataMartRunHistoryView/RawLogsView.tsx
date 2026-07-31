import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import { useClipboard } from '../../../../../hooks/useClipboard';
import { isPersistedWarning } from './utils';

interface RawLogsViewProps {
  logs: string[];
  errors: string[];
}

interface RawLogSectionProps {
  title: string;
  icon: React.ReactNode;
  lines: string[];
  section: string;
  bodyClassName: string;
  headingClassName?: string;
  lineClassName?: string;
  copyVariant?: CopyButtonVariant;
  copiedSection: string | null;
  onCopy: (text: string, section: string) => void;
}

function RawLogSection({
  title,
  icon,
  lines,
  section,
  bodyClassName,
  headingClassName,
  lineClassName,
  copyVariant,
  copiedSection,
  onCopy,
}: RawLogSectionProps) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <h4 className={`flex items-center gap-2 text-sm font-medium ${headingClassName ?? ''}`}>
          {icon}
          {title}:
        </h4>
        <CopyButton
          text={lines.join('\n')}
          section={section}
          variant={copyVariant}
          copiedSection={copiedSection}
          onCopy={onCopy}
        />
      </div>
      <div className={`max-h-96 overflow-y-auto rounded-md p-3 font-mono text-xs ${bodyClassName}`}>
        {lines.map((line, index) => (
          <div key={index} className={`mb-1 leading-relaxed ${lineClassName ?? ''}`}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RawLogsView({ logs, errors }: RawLogsViewProps) {
  const { copiedSection, handleCopy } = useClipboard();

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Classified warnings are persisted in the same array as genuine failures, so rendering
  // it wholesale would put every warning under a red "Error Output" heading and undo the
  // classification as soon as the user switches from Structured to Raw.
  const warnings = errors.filter(isPersistedWarning);
  const failures = errors.filter(entry => !isPersistedWarning(entry));

  return (
    <div className='border-border space-y-4 rounded-lg border p-4' onClick={handleStopPropagation}>
      <RawLogSection
        title='Error Output'
        icon={<AlertCircle className='h-4 w-4 text-red-500' />}
        lines={failures}
        section='errors'
        headingClassName='text-red-600 dark:text-red-400'
        bodyClassName='bg-red-50 dark:border-red-800 dark:bg-red-950/40'
        lineClassName='text-red-700 dark:text-red-300'
        copyVariant={CopyButtonVariant.ERROR}
        copiedSection={copiedSection}
        onCopy={handleCopy}
      />
      <RawLogSection
        title='Warnings'
        icon={<AlertTriangle className='h-4 w-4 text-yellow-500' />}
        lines={warnings}
        section='warnings'
        headingClassName='text-yellow-600 dark:text-yellow-400'
        bodyClassName='bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40'
        lineClassName='text-yellow-700 dark:text-yellow-300'
        copiedSection={copiedSection}
        onCopy={handleCopy}
      />
      <RawLogSection
        title='Standard Output'
        icon={<Info className='h-4 w-4 text-blue-500' />}
        lines={logs}
        section='logs'
        headingClassName='text-foreground'
        bodyClassName='bg-muted dark:bg-white/3'
        copiedSection={copiedSection}
        onCopy={handleCopy}
      />
    </div>
  );
}
