import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import ResizableColumns from '../../../../shared/components/ResizableColumns/ResizableColumns';
import InsightEditor from '../../../../features/data-marts/insights/components/InsightEditor.tsx';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@owox/ui/components/breadcrumb';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Button } from '@owox/ui/components/button';
import { MoreVertical, Trash2, BarChart3, ArrowUpRight } from 'lucide-react';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { useInsightData } from '../hooks/useInsightData.ts';
import { useInsightForm } from '../hooks/useInsightForm.ts';

export default function InsightDetailsView() {
  const storageKey = useMemo(() => 'insight_details_split', []);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { insight, handleDelete, updateInsight, updateInsightTitle } = useInsightData();

  const {
    handleSubmit,
    setValue,
    isTemplateDirty,
    isSubmitting,
    titleValue,
    templateValue,
    handleTitleUpdate,
    onSubmit,
  } = useInsightForm(insight, updateInsight, updateInsightTitle);

  return (
    <div className='flex h-full w-full flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to='..'>Insights</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span aria-current='page' className='block max-w-[480px] truncate'>
                <InlineEditTitle
                  title={titleValue || 'Untitled insight'}
                  onUpdate={handleTitleUpdate}
                  className='font-medium'
                  errorMessage='Title cannot be empty'
                  minWidth='200px'
                />
              </span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Insight actions'>
                <MoreVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className='text-destructive'>
                <Trash2 className='mr-2 h-4 w-4 text-red-600' />{' '}
                <span className='text-red-600'>Delete insight</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className='bg-background flex-1 rounded-md border'>
        <ResizableColumns
          storageKey={storageKey}
          initialRatio={0.5}
          left={
            <div className='h-full p-2'>
              <InsightEditor
                value={templateValue ?? ''}
                onChange={v => setValue('template', v, { shouldDirty: true })}
                height={'calc(100vh - 260px)'}
                placeholder='Type / to view available commands...'
              />
            </div>
          }
          right={
            <div className='h-full p-2'>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <BarChart3 />
                  </EmptyMedia>
                  <EmptyTitle>No result yet</EmptyTitle>
                  <EmptyDescription>
                    The output of your insight will appear here once it is executed
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div className='flex gap-2'>
                    <Button variant='outline' size='sm' disabled>
                      Preview unavailable
                    </Button>
                  </div>
                </EmptyContent>
                <Button variant='link' asChild className='text-muted-foreground' size='sm'>
                  <a href='#'>
                    Learn more <ArrowUpRight />
                  </a>
                </Button>
              </Empty>
            </div>
          }
        />
      </div>
      <div className='flex justify-start gap-2'>
        <Button
          variant='default'
          size='sm'
          disabled={!isTemplateDirty || isSubmitting}
          onClick={() => void handleSubmit(onSubmit)()}
        >
          Save &amp; Preview
        </Button>
      </div>
      ,
      <ConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title='Delete Insight'
        description='Are you sure you want to delete this insight? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => handleDelete()}
      />
    </div>
  );
}
