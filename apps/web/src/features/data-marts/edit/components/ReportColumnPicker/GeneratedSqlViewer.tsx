import { useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Copy, Loader2, Network } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@owox/ui/components/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Skeleton } from '@owox/ui/components/skeleton';
import { reportService } from '../../../reports/shared/services/report.service';
import { useProjectRoute } from '../../../../../shared/hooks';
import SqlValidator from '../SqlValidator/SqlValidator';

type GeneratedSqlViewerVariant = 'action-icon' | 'outline-button';

interface GeneratedSqlViewerProps {
  reportId: string;
  /**
   * Data mart ID the report belongs to. Required to run the SQL dry-run
   * validation (size estimate + syntax check) against the correct storage.
   */
  dataMartId: string;
  /**
   * Visual variant of the trigger:
   * - 'action-icon' (default): ghost icon button with tooltip, intended for
   *   table row action cells. Uses hover-reveal styling that matches sibling
   *   row actions.
   * - 'outline-button': outline button with "View Blending SQL" text,
   *   intended for use inside forms where a full button label makes sense.
   */
  variant?: GeneratedSqlViewerVariant;
  /**
   * Optional report title, used to build a descriptive aria-label for the
   * action icon variant (e.g. "View Blending SQL: Test Blending").
   */
  reportTitle?: string;
}

/**
 * Button that opens a dialog with the generated SQL for a report.
 * Provides copy-to-clipboard and copy-as-data-mart actions.
 */
export function GeneratedSqlViewer({
  reportId,
  dataMartId,
  variant = 'action-icon',
  reportTitle,
}: GeneratedSqlViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sql, setSql] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopyingAsDataMart, setIsCopyingAsDataMart] = useState(false);
  const { resolvedTheme } = useTheme();
  const { scope } = useProjectRoute();

  async function loadSql() {
    setIsLoading(true);
    try {
      const result = await reportService.getGeneratedSql(reportId);
      setSql(result.sql);
    } catch {
      toast.error('Failed to load generated SQL');
      setSql('');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) {
      // Always refetch on open — skip cache, show fresh SQL.
      setSql(null);
      void loadSql();
    }
  }

  async function handleCopyToClipboard() {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      toast.success('SQL copied to clipboard');
    } catch {
      toast.error('Failed to copy SQL');
    }
  }

  async function handleCopyAsDataMart() {
    setIsCopyingAsDataMart(true);
    try {
      const { dataMartId: newDataMartId } = await reportService.copyAsDataMart(reportId);
      toast.success('Data Mart created from report');
      setIsOpen(false);
      window.open(
        scope(`/data-marts/${newDataMartId}/data-setup`),
        '_blank',
        'noopener,noreferrer'
      );
    } catch {
      toast.error('Failed to create Data Mart from report');
    } finally {
      setIsCopyingAsDataMart(false);
    }
  }

  const ariaLabel = reportTitle ? `View Blending SQL: ${reportTitle}` : 'View Blending SQL';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {variant === 'action-icon' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100'
                aria-label={ariaLabel}
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                <Network className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side='bottom' role='tooltip'>
            View Blending SQL
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>
          <Button type='button' variant='outline' size='sm'>
            <Network className='mr-2 h-4 w-4' />
            View Blending SQL
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className='flex flex-col gap-4 sm:max-w-[80vw]'>
        <DialogHeader>
          <DialogTitle>Generated Blending SQL</DialogTitle>
        </DialogHeader>

        <div className='min-h-[600px]'>
          {isLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-3/4' />
              <Skeleton className='h-6 w-5/6' />
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-2/3' />
            </div>
          ) : (
            <div className='overflow-hidden rounded-md border' style={{ height: '600px' }}>
              <Editor
                height='100%'
                language='sql'
                value={sql ?? ''}
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  overviewRulerBorder: false,
                  hideCursorInOverviewRuler: true,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter className='sm:items-center sm:justify-between'>
          {isLoading || !sql ? (
            <div className='inline-flex h-9 items-center px-3 py-2'>
              <div className='flex h-5 items-center gap-2 text-gray-500'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span className='text-sm'>Generating blending SQL...</span>
              </div>
            </div>
          ) : (
            <SqlValidator sql={sql} dataMartId={dataMartId} />
          )}
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void handleCopyToClipboard()}
              disabled={isLoading || !sql}
            >
              <Copy className='mr-2 h-4 w-4' />
              Copy to Clipboard
            </Button>
            <Button
              type='button'
              variant='default'
              onClick={() => void handleCopyAsDataMart()}
              disabled={isLoading || isCopyingAsDataMart}
            >
              Copy as Data Mart
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
