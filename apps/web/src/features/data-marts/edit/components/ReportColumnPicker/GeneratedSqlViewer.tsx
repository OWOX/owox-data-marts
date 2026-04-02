import { useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Copy, Code } from 'lucide-react';
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
import { Skeleton } from '@owox/ui/components/skeleton';
import { reportService } from '../../../reports/shared/services/report.service';

interface GeneratedSqlViewerProps {
  reportId: string;
}

/**
 * Button that opens a dialog with the generated SQL for a report.
 * Provides copy-to-clipboard and copy-as-data-mart actions.
 */
export function GeneratedSqlViewer({ reportId }: GeneratedSqlViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sql, setSql] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopyingAsDataMart, setIsCopyingAsDataMart] = useState(false);
  const { resolvedTheme } = useTheme();

  async function loadSql() {
    if (sql !== null) return;
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
      await reportService.copyAsDataMart(reportId);
      toast.success('Data Mart created from report');
      setIsOpen(false);
    } catch {
      toast.error('Failed to create Data Mart from report');
    } finally {
      setIsCopyingAsDataMart(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type='button' variant='outline' size='sm'>
          <Code className='mr-2 h-4 w-4' />
          View SQL
        </Button>
      </DialogTrigger>

      <DialogContent className='flex max-w-4xl flex-col gap-4'>
        <DialogHeader>
          <DialogTitle>Generated SQL</DialogTitle>
        </DialogHeader>

        <div className='min-h-[400px]'>
          {isLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-3/4' />
              <Skeleton className='h-6 w-5/6' />
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-2/3' />
            </div>
          ) : (
            <div className='overflow-hidden rounded-md border' style={{ height: '400px' }}>
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
