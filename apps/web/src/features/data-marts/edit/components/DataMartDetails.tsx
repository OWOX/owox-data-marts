import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { ArrowLeft, CircleCheck, MoreVertical, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { NavLink, Outlet } from 'react-router-dom';
import { useFlags } from '../../../../app/store/hooks';
import { Button } from '../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import { StatusLabel, StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { useProjectRoute } from '../../../../shared/hooks';
import { parseEnvList } from '../../../../utils';
import { ConnectorRunView } from '../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView.tsx';
import { useAuth } from '../../../idp';
import {
  DataMartDefinitionType,
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
  DataMartStatus,
  getValidationErrorMessages,
} from '../../shared';
import { useSchemaActualizeTrigger } from '../../shared/hooks/useSchemaActualizeTrigger';
import { PromoStep, useDataMartNextStepPromo } from '../hooks/useDataMartNextStepPromo';
import { useDataMart } from '../model';

interface DataMartDetailsProps {
  id: string;
}

export function DataMartDetails({ id }: DataMartDetailsProps) {
  const { navigate } = useProjectRoute();
  const { user } = useAuth();
  const { flags } = useFlags();
  const projectId = user?.projectId ?? '';

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
    isManualRunTriggered,
    resetManualRunTriggered,
  } = useDataMart(id);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRunSheetOpen, setIsRunSheetOpen] = useState(false);
  const lastRunIdRef = useRef<string | null>(null);

  const {
    id: dataMartId = '',
    canPublish = false,
    canActualizeSchema = false,
    status: dataMartStatus = { code: null, displayName: '', description: '' },
    title: dataMartTitle = '',
    definition: dataMartDefinition = null,
    definitionType: dataMartDefinitionType = null,
    validationErrors: dataMartValidationErrors = [],
  } = dataMart ?? {};

  const onActualizeSuccess = useCallback(() => {
    if (!dataMartId) return;
    void getDataMart(dataMartId);
  }, [dataMartId, getDataMart]);

  const { run: runActualizeSchemaInternal, isLoading: isSchemaActualizationLoading } =
    useSchemaActualizeTrigger(dataMartId, onActualizeSuccess);

  // Wrap with canActualizeSchema check before running schema actualization
  const runSchemaActualization = useCallback(async () => {
    if (!canActualizeSchema) {
      return;
    }
    await runActualizeSchemaInternal();
  }, [canActualizeSchema, runActualizeSchemaInternal]);

  // TODO: Remove after implementing feature flags or global Insight rollout
  const enabledProjectsRaw = flags?.INSIGHTS_ENABLED_PROJECT_IDS as string | undefined;
  const currentProjectId = user?.projectId ?? '';
  const shouldShowInsights =
    currentProjectId.length > 0 &&
    parseEnvList(enabledProjectsRaw ?? '').includes(currentProjectId);

  const { showPromo } = useDataMartNextStepPromo();

  const navigation = [
    { name: 'Overview', path: 'overview' },
    { name: 'Data Setup', path: 'data-setup' },
    ...(shouldShowInsights ? [{ name: 'Insights', path: 'insights' }] : []),
    { name: 'Destinations', path: 'reports' },
    { name: 'Triggers', path: 'triggers' },
    { name: 'Run History', path: 'run-history' },
  ];

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      if (!dataMartId) return;
      await updateDataMartTitle(dataMartId, newTitle);
    },
    [dataMartId, updateDataMartTitle]
  );

  const handlePublish = useCallback(async () => {
    if (!dataMartId) return;
    setIsPublishing(true);

    try {
      await publishDataMart(dataMartId);
      void runSchemaActualization();

      // Show promo toast based on a data mart type
      const isConnector = dataMartDefinitionType === DataMartDefinitionType.CONNECTOR;

      showPromo({
        step: isConnector ? PromoStep.LOAD_DATA : PromoStep.USE_DATA,
        projectId,
        dataMartId,
        isInsightsEnabled: shouldShowInsights,
        onManualRunClick: () => {
          setIsRunSheetOpen(true);
        },
      });
    } catch (error) {
      console.log(error instanceof Error ? error.message : 'Failed to publish Data Mart');
    } finally {
      setIsPublishing(false);
    }
  }, [
    dataMartId,
    dataMartDefinitionType,
    publishDataMart,
    runSchemaActualization,
    showPromo,
    projectId,
    shouldShowInsights,
  ]);

  const handleManualRun = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!dataMartId) return;
      if (dataMartStatus.code !== DataMartStatus.PUBLISHED) {
        toast.error('Manual run is only available for published Data Marts');
        return;
      }
      lastRunIdRef.current = runs[0]?.id || null;
      await runDataMart({ id: dataMartId, payload });
    },
    [dataMartId, dataMartStatus, runDataMart, runs]
  );

  // Show promo after the first successful manual connector run
  useEffect(() => {
    if (!isManualRunTriggered || !runs.length) return;
    if (dataMartDefinitionType !== DataMartDefinitionType.CONNECTOR) return;

    const latestRun = runs[0];
    if (latestRun.id === lastRunIdRef.current) return;

    if (
      latestRun.status === DataMartRunStatus.SUCCESS &&
      latestRun.triggerType === DataMartRunTriggerType.MANUAL &&
      latestRun.type === DataMartRunType.CONNECTOR
    ) {
      // Check if this is the first successful manual connector run
      const successfulManualConnectorRuns = runs.filter(
        run =>
          run.status === DataMartRunStatus.SUCCESS &&
          run.triggerType === DataMartRunTriggerType.MANUAL &&
          run.type === DataMartRunType.CONNECTOR
      );

      if (successfulManualConnectorRuns.length === 1) {
        resetManualRunTriggered();
        showPromo({
          step: PromoStep.USE_DATA,
          projectId,
          dataMartId,
          isInsightsEnabled: shouldShowInsights,
        });
      } else {
        resetManualRunTriggered();
      }
    }
  }, [
    runs,
    isManualRunTriggered,
    dataMartDefinitionType,
    resetManualRunTriggered,
    showPromo,
    projectId,
    dataMartId,
    shouldShowInsights,
  ]);

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
            title={dataMartTitle}
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
                      dataMartStatus.code === DataMartStatus.PUBLISHED
                        ? StatusTypeEnum.SUCCESS
                        : StatusTypeEnum.NEUTRAL
                    }
                    variant='subtle'
                  >
                    {dataMartStatus.displayName}
                  </StatusLabel>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {dataMartStatus.code === DataMartStatus.PUBLISHED
                  ? 'Your published Data Mart is ready for scheduled runs'
                  : 'Draft Data Mart is not available for scheduled runs. Publish it to activate scheduling.'}
              </TooltipContent>
            </Tooltip>
            {dataMartStatus.code === DataMartStatus.DRAFT && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant='default'
                      onClick={() => {
                        void handlePublish();
                      }}
                      disabled={isPublishing || !canPublish}
                      className='ml-2 flex items-center gap-1'
                    >
                      <CircleCheck className='h-4 w-4' />
                      Publish Data Mart
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canPublish && (
                  <TooltipContent>
                    <div>Cannot publish Data Mart. Fix the issues below.</div>
                    {dataMartValidationErrors.length > 0 && (
                      <ul className='mt-1 list-disc space-y-1 pl-4'>
                        {getValidationErrorMessages(dataMartValidationErrors).map(
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
              {dataMartDefinitionType === DataMartDefinitionType.CONNECTOR && (
                <>
                  <ConnectorRunView
                    configuration={dataMartDefinition ?? null}
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
            runSchemaActualization,
            isSchemaActualizationLoading,
          }}
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description={
          <>
            Are you sure you want to delete <strong>"{dataMartTitle}"</strong>? This action cannot
            be undone.
          </>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void (async () => {
            try {
              await deleteDataMart(dataMartId);
              setIsDeleteDialogOpen(false);
              navigate('/data-marts');
            } catch (error) {
              console.error('Failed to delete Data Mart:', error);
            }
          })();
        }}
      />

      {/* Controlled ConnectorRunView for toast "Run Now" action */}
      {dataMartDefinitionType === DataMartDefinitionType.CONNECTOR && (
        <ConnectorRunView
          configuration={dataMartDefinition ?? null}
          onManualRun={data => {
            void handleManualRun({
              runType: data.runType,
              data: data.data,
            });
          }}
          open={isRunSheetOpen}
          onOpenChange={setIsRunSheetOpen}
        />
      )}
    </div>
  );
}
