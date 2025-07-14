import React, { useState } from 'react';
import { CopyButton } from './CopyButton';

interface ConfigurationViewProps {
  definitionRun: unknown;
}

export function ConfigurationView({ definitionRun }: ConfigurationViewProps) {
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
    <div className='border-border rounded-lg border' onClick={handleStopPropagation}>
      {definitionRun != null ? (
        <div className='p-4'>
          <div className='mb-3 flex items-center justify-between'>
            <h4 className='text-foreground text-sm font-medium'>Configuration:</h4>
            <CopyButton
              text={JSON.stringify(definitionRun, null, 2)}
              section='configuration'
              variant='default'
              copiedSection={copiedSection}
              onCopy={handleCopy}
            />
          </div>
          <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
            {JSON.stringify(definitionRun, null, 2)}
          </pre>
        </div>
      ) : (
        <div className='text-muted-foreground p-8 text-center'>
          No configuration data available for this run
        </div>
      )}
    </div>
  );
}
