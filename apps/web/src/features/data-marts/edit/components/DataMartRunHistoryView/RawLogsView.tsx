import React, { useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface RawLogsViewProps {
  logs: string[];
  errors: string[];
}

export function RawLogsView({ logs, errors }: RawLogsViewProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

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

  return (
    <div className='border-border space-y-4 rounded-lg border p-4' onClick={handleStopPropagation}>
      {errors.length > 0 && (
        <div>
          <div className='mb-2 flex items-center justify-between'>
            <h4 className='flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400'>
              <AlertCircle className='h-4 w-4 text-red-500' />
              Error Output:
            </h4>
            <CopyButton
              text={errors.join('\n')}
              section='errors'
              variant='error'
              copiedSection={copiedSection}
              onCopy={handleCopy}
            />
          </div>
          <div className='max-h-96 overflow-y-auto rounded-md bg-red-50 p-3 font-mono text-xs dark:border-red-800 dark:bg-red-950/40'>
            {errors.map((error, index) => (
              <div key={index} className='mb-1 leading-relaxed text-red-700 dark:text-red-300'>
                {error}
              </div>
            ))}
          </div>
        </div>
      )}
      {logs.length > 0 && (
        <div>
          <div className='mb-2 flex items-center justify-between'>
            <h4 className='text-foreground flex items-center gap-2 text-sm font-medium'>
              <Info className='h-4 w-4 text-blue-500' />
              Standard Output:
            </h4>
            <CopyButton
              text={logs.join('\n')}
              section='logs'
              variant='default'
              copiedSection={copiedSection}
              onCopy={handleCopy}
            />
          </div>
          <div className='bg-muted max-h-96 overflow-y-auto rounded-md p-3 font-mono text-xs dark:bg-white/3'>
            {logs.map((log, index) => (
              <div key={index} className='mb-1 leading-relaxed'>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
