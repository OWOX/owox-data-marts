import React from 'react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import { useClipboard } from '../../../../../hooks/useClipboard';
import type {
  DataMartRunInsightDefinition,
  DataMartRunInsightTemplateDefinition,
  DataMartRunReportDefinition,
} from '../../model';

interface ConfigurationViewProps {
  definitionRun: DataMartDefinitionConfig | null;
  reportDefinition: DataMartRunReportDefinition | null;
  insightDefinition: DataMartRunInsightDefinition | null;
  insightTemplateDefinition: DataMartRunInsightTemplateDefinition | null;
  additionalParams: Record<string, unknown> | null;
}

export function ConfigurationView({
  definitionRun,
  reportDefinition,
  insightDefinition,
  insightTemplateDefinition,
  additionalParams,
}: ConfigurationViewProps) {
  const httpDataParams =
    additionalParams != null &&
    typeof additionalParams.httpData === 'object' &&
    additionalParams.httpData !== null &&
    !Array.isArray(additionalParams.httpData)
      ? (additionalParams.httpData as Record<string, unknown>)
      : null;
  const { copiedSection, handleCopy } = useClipboard();

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (definitionRun == null && httpDataParams == null) {
    return (
      <div className='border-border rounded-lg border' onClick={handleStopPropagation}>
        <div className='text-muted-foreground p-8 text-center'>
          No configuration data available for this run
        </div>
      </div>
    );
  }

  return (
    <div className='border-border rounded-lg border' onClick={handleStopPropagation}>
      <div className='p-4'>
        {definitionRun != null && (
          <>
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
          </>
        )}
        {reportDefinition?.executionSqlQuery != null && (
          <>
            <div className='mt-3 mb-3 flex items-center justify-between'>
              <h4 className='text-foreground text-sm font-medium'>Executed SQL:</h4>
              <CopyButton
                text={reportDefinition.executionSqlQuery}
                section='executionSql'
                variant={CopyButtonVariant.DEFAULT}
                copiedSection={copiedSection}
                onCopy={handleCopy}
              />
            </div>
            <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
              {reportDefinition.executionSqlQuery}
            </pre>
          </>
        )}
        {definitionRun != null && reportDefinition && (
          <>
            <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>Report definition:</h4>
            <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
              {JSON.stringify(
                // outputConfig and executionSqlQuery each render in their own block below,
                // so exclude them from this raw dump to avoid showing them twice.
                Object.fromEntries(
                  Object.entries(reportDefinition).filter(
                    ([key]) => key !== 'outputConfig' && key !== 'executionSqlQuery'
                  )
                ),
                null,
                2
              )}
            </pre>
            {reportDefinition.outputConfig && (
              <>
                <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>Output controls:</h4>
                <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
                  {JSON.stringify(reportDefinition.outputConfig, null, 2)}
                </pre>
              </>
            )}
          </>
        )}
        {definitionRun != null && insightDefinition && (
          <>
            <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>Insight definition:</h4>
            <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
              {JSON.stringify(insightDefinition, null, 2)}
            </pre>
          </>
        )}
        {definitionRun != null && insightTemplateDefinition && (
          <>
            <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>
              Insight template definition:
            </h4>
            <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
              {JSON.stringify(insightTemplateDefinition, null, 2)}
            </pre>
          </>
        )}
        {httpDataParams && (
          <>
            <h4 className='text-foreground mt-3 mb-3 text-sm font-medium'>HTTP Data parameters:</h4>
            <pre className='bg-muted text-foreground overflow-x-auto rounded p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/3'>
              {JSON.stringify(httpDataParams, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
