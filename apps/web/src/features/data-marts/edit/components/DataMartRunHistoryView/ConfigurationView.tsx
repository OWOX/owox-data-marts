import React from 'react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import { useClipboard } from '../../../../../hooks/useClipboard';
import type { DataMartRunReportDefinition } from '../../model';

interface ConfigurationViewProps {
  definitionRun: DataMartDefinitionConfig | null;
  reportDefinition: DataMartRunReportDefinition | null;
}

export function ConfigurationView({ definitionRun, reportDefinition }: ConfigurationViewProps) {
  const { copiedSection, handleCopy } = useClipboard();

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
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
              variant={CopyButtonVariant.DEFAULT}
              copiedSection={copiedSection}
              onCopy={handleCopy}
            />
          </div>
          <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
            {JSON.stringify(definitionRun, null, 2)}
          </pre>
          {reportDefinition && (
            <>
              <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>Report definition:</h4>
              <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
                {JSON.stringify(reportDefinition, null, 2)}
              </pre>
            </>
          )}
        </div>
      ) : (
        <div className='text-muted-foreground p-8 text-center'>
          No configuration data available for this run
        </div>
      )}
    </div>
  );
}
