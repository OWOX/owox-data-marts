import { useState, useCallback } from 'react';
import { useDataMart } from '../model';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { MoreVertical, Trash2, ArrowLeft, CircleCheck, Play } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useProjectRoute } from '../../../../shared/hooks';
import { cn } from '@owox/ui/lib/utils';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import { StatusLabel, StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { Button } from '../../../../shared/components/Button';
import { DataMartDefinitionType, DataMartStatus, getValidationErrorMessages } from '../../shared';
import { toast } from 'react-hot-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ConnectorRunView } from '../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView.tsx';
import { Skeleton } from '@owox/ui/components/skeleton';
import { useSchemaActualizeTrigger } from '../../shared/hooks/useSchemaActualizeTrigger';

interface DataMartDetailsProps {
  id: string;
}

export function DataMartDetails({ id }: DataMartDetailsProps) {
  const { navigate } = useProjectRoute();

  const {
    dataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    actualizeDataMartSchema,
    updateDataMartSchema,
    publishDataMart,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    loadMoreDataMartRuns,
    isLoading,
    error,
    getErrorMessage,
    runs,
    getDataMart,
  } = useDataMart(id);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const dataMartId = dataMart?.id ?? '';

  const onActualizeSuccess = useCallback(() => {
    if (!dataMartId) return;
    void getDataMart(dataMartId);
  }, [dataMartId, getDataMart]);

  const { run: runActualize } = useSchemaActualizeTrigger(dataMartId, onActualizeSuccess);

  const navigation = [
    { name: 'Overview', path: 'overview' },
    { name: 'Data Setup', path: 'data-setup' },
    { name: 'Destinations', path: 'reports' },
    { name: 'Triggers', path: 'triggers' },
    { name: 'Run History', path: 'run-history' },
  ];

  const handleTitleUpdate = async (newTitle: string) => {
    if (!dataMart) return;
    await updateDataMartTitle(dataMart.id, newTitle);
  };

  const handlePublish = async () => {
    if (!dataMart) return;
    setIsPublishing(true);

    try {
      await publishDataMart(dataMart.id);
      void runActualize();
    } catch (error) {
      console.log(error instanceof Error ? error.message : 'Failed to publish Data Mart');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleManualRun = async (payload: Record<string, unknown>) => {
    if (!dataMart) return;
    if (dataMart.status.code !== DataMartStatus.PUBLISHED) {
      toast.error('Manual run is only available for published Data Marts');
      return;
    }
    await runDataMart({
      id: dataMart.id,
      payload,
    });
  };

  if (isLoading) {
    // Loading data mart details...
  }

  if (!dataMart) {
    return (
      <div className='dm-page-content flex flex-col gap-4 py-4 md:py-8'>
        <Skeleton key={0} className='h-16 w-full' />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index + 1} className='h-48 w-full' />
        ))}
      </div>
    );
  }

  return (
    <div className={'px-12 py-6'}>
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center space-x-1 md:-ml-10'>
          <Button
            onClick={() => {
              navigate('/data-marts');
            }}
            variant='ghost'
            size='sm'
            aria-label='Back to Data Marts'
            title='Back to Data Marts'
            className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          >
            <ArrowLeft className='h-5 w-5' />
          </Button>
          <InlineEditTitle
            title={dataMart.title}
            onUpdate={handleTitleUpdate}
            className='text-2xl font-medium'
          />
        </div>
        <div
          className={'flex items-center gap-2' + (isPublishing ? ' opacity-50' : '')}
          style={{ minWidth: '120px' }}
        >
          <div className='ml-4 flex items-center gap-2'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <StatusLabel
                    type={
                      dataMart.status.code === DataMartStatus.PUBLISHED
                        ? StatusTypeEnum.SUCCESS
                        : StatusTypeEnum.NEUTRAL
                    }
                    variant='subtle'
                  >
                    {dataMart.status.displayName}
                  </StatusLabel>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {dataMart.status.code === DataMartStatus.PUBLISHED
                  ? 'Your published Data Mart is ready for scheduled runs'
                  : 'Draft Data Mart is not available for scheduled runs. Publish it to activate scheduling.'}
              </TooltipContent>
            </Tooltip>
            {dataMart.status.code === DataMartStatus.DRAFT && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant='default'
                      onClick={() => {
                        void handlePublish();
                      }}
                      disabled={isPublishing || !dataMart.canPublish}
                      className='ml-2 flex items-center gap-1'
                    >
                      <CircleCheck className='h-4 w-4' />
                      Publish Data Mart
                    </Button>
                  </div>
                </TooltipTrigger>
                {!dataMart.canPublish && (
                  <TooltipContent>
                    <div>Cannot publish Data Mart. Fix the issues below.</div>
                    {dataMart.validationErrors.length > 0 && (
                      <ul className='mt-1 list-disc space-y-1 pl-4'>
                        {getValidationErrorMessages(dataMart.validationErrors).map(
                          (message, index) => (
                            <li key={index}>{message}</li>
                          )
                        )}
                      </ul>
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost'>
                <MoreVertical className='h-5 w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {dataMart.definitionType === DataMartDefinitionType.CONNECTOR && (
                <>
                  <ConnectorRunView
                    configuration={dataMart.definition ?? null}
                    onManualRun={data => {
                      void handleManualRun({
                        runType: data.runType,
                        data: data.data,
                      });
                    }}
                  >
                    <DropdownMenuItem
                      onClick={e => {
                        e.preventDefault();
                      }}
                    >
                      <Play className='text-foreground h-4 w-4' />
                      <span>Manual Run...</span>
                    </DropdownMenuItem>
                  </ConnectorRunView>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className='h-4 w-4 text-red-600' />
                <span className='text-red-600'>Delete Data Mart</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <nav className='-mb-px flex space-x-4 border-b' aria-label='Tabs' role='tablist'>
          {navigation.map(item => {
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-200 dark:hover:text-gray-200'
                  )
                }
              >
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className='pt-4'>
        <Outlet
          context={{
            dataMart,
            isLoading,
            error,
            getErrorMessage,
            updateDataMartDescription,
            updateDataMartDefinition,
            actualizeDataMartSchema,
            updateDataMartSchema,
            runDataMart,
            cancelDataMartRun: cancelDataMartRun as (id: string, runId: string) => Promise<void>,
            getDataMartRuns,
            loadMoreDataMartRuns,
            runs,
            getDataMart,
          }}
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description={
          <>
            Are you sure you want to delete <strong>"{dataMart.title}"</strong>? This action cannot
            be undone.
          </>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void (async () => {
            try {
              await deleteDataMart(dataMart.id);
              setIsDeleteDialogOpen(false);
              navigate('/data-marts');
            } catch (error) {
              console.error('Failed to delete Data Mart:', error);
            }
          })();
        }}
      />
    </div>
  );
}
