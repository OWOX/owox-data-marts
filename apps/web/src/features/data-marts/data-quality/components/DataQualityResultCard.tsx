import { Badge } from '@owox/ui/components/badge';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { cn } from '@owox/ui/lib/utils';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleMinus,
  Copy,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../shared/components/Button';
import { useClipboard } from '../../../../hooks/useClipboard';
import { DATA_QUALITY_CATEGORY_LABELS, dataQualityScopeLabel } from '../model/data-quality.model';
import type { DataQualityCheckResult, DataQualitySeverity } from '../model/types';

interface DataQualityResultCardProps {
  result: DataQualityCheckResult;
  titleSuffix?: string;
  scopeLabel?: string;
  scopeDetails?: string[];
  targetAlias?: string;
  defaultExpanded?: boolean;
}

interface ResultStatusPresentation {
  label: string;
  icon: typeof CircleAlert;
  iconClassName: string;
  cardClassName?: string;
  showStatusBadge: boolean;
  statusBadgeVariant: 'outline' | 'destructive';
  severityBadgeClassName?: string;
}

const FAILED_SEVERITY_PRESENTATIONS: Record<
  DataQualitySeverity,
  Pick<ResultStatusPresentation, 'cardClassName' | 'iconClassName' | 'severityBadgeClassName'>
> = {
  error: {
    cardClassName: 'border-destructive/40',
    iconClassName: 'text-destructive',
    severityBadgeClassName: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  warning: {
    cardClassName: 'border-warning/40',
    iconClassName: 'text-warning',
    severityBadgeClassName: 'border-warning/40 bg-warning/10 text-warning',
  },
  notice: {
    cardClassName: 'border-notice/40',
    iconClassName: 'text-notice',
    severityBadgeClassName: 'border-notice/40 bg-notice/10 text-notice',
  },
};

export function DataQualityResultCard({
  result,
  titleSuffix,
  scopeLabel,
  scopeDetails = [],
  targetAlias,
  defaultExpanded = false,
}: DataQualityResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isSqlExpanded, setIsSqlExpanded] = useState(false);
  const { copiedSection, handleCopy } = useClipboard();
  const isCopied = copiedSection === result.id;
  const isRedactedRelationship = result.scope.type === 'RELATIONSHIP' && result.redacted;
  const categoryTitle = DATA_QUALITY_CATEGORY_LABELS[result.category];
  const title = titleSuffix ? `${categoryTitle} · ${titleSuffix}` : categoryTitle;
  const status = getResultStatus(result);
  const StatusIcon = status.icon;

  return (
    <Card
      className={cn('gap-0 overflow-hidden py-0 shadow-none', status.cardClassName)}
      data-testid={`quality-result-${result.id}`}
    >
      <CardHeader className='p-0'>
        <button
          type='button'
          aria-expanded={isExpanded}
          className='hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset'
          onClick={() => {
            setIsExpanded(value => !value);
          }}
        >
          <StatusIcon className={cn('size-4 shrink-0', status.iconClassName)} aria-hidden='true' />
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='font-medium'>{title}</h3>
              {status.showStatusBadge ? (
                <Badge variant={status.statusBadgeVariant}>{status.label}</Badge>
              ) : (
                <span className='sr-only'>{status.label}</span>
              )}
              {result.status === 'FAILED' && (
                <Badge variant='outline' className={status.severityBadgeClassName}>
                  {result.severity}
                </Badge>
              )}
            </div>
            <div className='text-muted-foreground mt-0.5 space-y-0.5 text-xs'>
              <p className='break-words'>{scopeLabel ?? dataQualityScopeLabel(result.scope)}</p>
              {scopeDetails.map(detail => (
                <p key={detail} className='break-words'>
                  {detail}
                </p>
              ))}
            </div>
          </div>
          {result.status === 'FAILED' && (
            <Badge variant='outline' className='shrink-0'>
              {result.violationCount} {result.violationCount === 1 ? 'violation' : 'violations'}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              isExpanded && 'rotate-180'
            )}
            aria-hidden='true'
          />
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className='space-y-4 border-t px-4 py-4'>
          <p className='text-muted-foreground text-sm'>{result.description}</p>

          {result.error && (
            <div className='border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm'>
              <p className='font-medium'>Execution error — this check didn&apos;t run</p>
              <p className='text-muted-foreground mt-1'>{result.error.message}</p>
            </div>
          )}

          {result.examples.length > 0 && (
            <div>
              <p className='mb-2 text-sm font-medium'>Examples</p>
              <div className='grid gap-2 lg:grid-cols-3'>
                {result.examples.slice(0, 3).map((example, index) => (
                  <pre
                    key={index}
                    data-testid='quality-example'
                    className='bg-muted min-w-0 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap'
                  >
                    {safeJson(example.values)}
                  </pre>
                ))}
              </div>
              <p className='text-muted-foreground mt-2 text-xs'>
                Up to 3 examples are stored per check.
              </p>
            </div>
          )}

          {result.executedSql.length > 0 && (
            <div className='space-y-3'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                aria-expanded={isSqlExpanded}
                onClick={() => {
                  setIsSqlExpanded(value => !value);
                }}
              >
                <ChevronDown
                  className={cn('size-4 transition-transform', isSqlExpanded && 'rotate-180')}
                  aria-hidden='true'
                />
                Executed SQL ({result.executedSql.length})
              </Button>
              {isSqlExpanded && (
                <div className='space-y-2'>
                  {result.executedSql.map((sql, index) => (
                    <pre
                      key={index}
                      className='bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'
                    >
                      {sql}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          )}

          {isRedactedRelationship && (
            <div className='text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-sm'>
              <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
              <span>
                SQL and examples are hidden because you don&apos;t have access to the target Data
                Mart
                {targetAlias ? ` ${targetAlias}` : ''}. The counts above are still accurate.
              </span>
            </div>
          )}

          {result.reproductionSql && (
            <div className='flex justify-end'>
              <Button
                variant='outline'
                size='sm'
                aria-label={isCopied ? 'Copied' : 'Copy reproduction SQL'}
                onClick={() => {
                  handleCopy(result.reproductionSql ?? '', result.id);
                }}
              >
                {isCopied ? <Check className='size-4' /> : <Copy className='size-4' />}
                {isCopied ? 'Copied' : 'Copy reproduction SQL'}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function getResultStatus(result: DataQualityCheckResult): ResultStatusPresentation {
  switch (result.status) {
    case 'ERROR':
      return {
        label: 'Execution error',
        icon: CircleAlert,
        iconClassName: 'text-destructive',
        cardClassName: 'border-destructive/40',
        showStatusBadge: true,
        statusBadgeVariant: 'destructive',
      };
    case 'FAILED': {
      const severityPresentation = FAILED_SEVERITY_PRESENTATIONS[result.severity];
      return {
        label: 'Failed',
        icon: AlertTriangle,
        ...severityPresentation,
        showStatusBadge: false,
        statusBadgeVariant: 'outline',
      };
    }
    case 'PASSED':
      return {
        label: 'Passed',
        icon: CheckCircle2,
        iconClassName: 'text-success',
        cardClassName: 'border-success/40',
        showStatusBadge: false,
        statusBadgeVariant: 'outline',
      };
    case 'NOT_APPLICABLE':
      return {
        label: 'Not applicable',
        icon: CircleMinus,
        iconClassName: 'text-muted-foreground',
        showStatusBadge: true,
        statusBadgeVariant: 'outline',
      };
  }
}

function safeJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[Unable to display example]';
  }
}
