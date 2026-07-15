import { Badge } from '@owox/ui/components/badge';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import { useClipboard } from '../../../../hooks/useClipboard';
import { DATA_QUALITY_CATEGORY_LABELS, dataQualityScopeLabel } from '../model/data-quality.model';
import type { DataQualityCheckResult } from '../model/types';

interface DataQualityResultCardProps {
  result: DataQualityCheckResult;
}

export function DataQualityResultCard({ result }: DataQualityResultCardProps) {
  const { copiedSection, handleCopy } = useClipboard();
  const isCopied = copiedSection === result.id;
  const isRedactedRelationship = result.scope.type === 'RELATIONSHIP' && result.redacted;

  return (
    <Card className='gap-4 py-5' data-testid={`quality-result-${result.id}`}>
      <CardHeader className='px-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='font-semibold'>{DATA_QUALITY_CATEGORY_LABELS[result.category]}</h3>
              <Badge variant={result.status === 'FAILED' ? 'destructive' : 'outline'}>
                {result.status.replace(/_/g, ' ').toLowerCase()}
              </Badge>
              <Badge variant='outline'>{result.severity}</Badge>
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {dataQualityScopeLabel(result.scope)}
            </p>
          </div>
          <Badge variant='outline'>
            {result.violationCount} {result.violationCount === 1 ? 'violation' : 'violations'}
          </Badge>
        </div>
        <p className='text-muted-foreground mt-3 text-sm'>{result.description}</p>
      </CardHeader>
      <CardContent className='space-y-4 px-5'>
        {result.error && (
          <div className='border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm'>
            <p className='font-medium'>Execution error</p>
            <p className='text-muted-foreground mt-1'>{result.error.message}</p>
          </div>
        )}

        {result.examples.length > 0 && (
          <div>
            <p className='mb-2 text-sm font-medium'>Examples</p>
            <div className='space-y-2'>
              {result.examples.slice(0, 3).map((example, index) => (
                <pre
                  key={index}
                  data-testid='quality-example'
                  className='bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap'
                >
                  {safeJson(example.values)}
                </pre>
              ))}
            </div>
          </div>
        )}

        {result.executedSql.length > 0 && (
          <details className='rounded-md border p-3'>
            <summary className='cursor-pointer text-sm font-medium'>
              Executed SQL ({result.executedSql.length})
            </summary>
            <div className='mt-3 space-y-2'>
              {result.executedSql.map((sql, index) => (
                <pre
                  key={index}
                  className='bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap'
                >
                  {sql}
                </pre>
              ))}
            </div>
          </details>
        )}

        {result.reproductionSql && (
          <div className='flex justify-end'>
            <Button
              variant='outline'
              size='sm'
              aria-label={isCopied ? 'Copied' : 'Copy SQL'}
              onClick={() => {
                handleCopy(result.reproductionSql ?? '', result.id);
              }}
            >
              {isCopied ? <Check className='size-4' /> : <Copy className='size-4' />}
              {isCopied ? 'Copied' : 'Copy SQL'}
            </Button>
          </div>
        )}

        {isRedactedRelationship && (
          <div className='text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-sm'>
            <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
            <span>SQL and examples are hidden because the target Data Mart is not visible.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function safeJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[Unable to display example]';
  }
}
