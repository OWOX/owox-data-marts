import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import { useClipboard } from '../../../../../hooks/useClipboard';

interface RawLogsViewProps {
  logs: string[];
  errors: string[];
}

export function RawLogsView({ logs, errors }: RawLogsViewProps) {
  const { copiedSection, handleCopy } = useClipboard();

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
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
              variant={CopyButtonVariant.ERROR}
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
              variant={CopyButtonVariant.DEFAULT}
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
