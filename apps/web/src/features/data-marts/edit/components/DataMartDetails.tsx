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
import { ArrowLeft, CircleCheckBig, Rocket, MoreVertical, Play, Trash2, Info } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { NavLink, Outlet } from 'react-router-dom';
import { useFlags } from '../../../../app/store/hooks';
import { Button } from '../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import { StatusLabel, StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { useProjectRoute } from '../../../../shared/hooks';
import { checkVisible } from '../../../../utils';
import { ConnectorRunView } from '../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView.tsx';
import { DataStorageType } from '../../../data-storage';
import { useAuth } from '../../../idp';
import {
  DataMartDefinitionType,
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
  DataMartStatus,
  getRequiredSetupActions,
} from '../../shared';
import { useSchemaActualizeTrigger } from '../../shared/hooks/useSchemaActualizeTrigger';
import { PromoStep, useDataMartNextStepPromo } from '../hooks/useDataMartNextStepPromo';
import { useDataMart } from '../model';
import NotFound from '../../../../pages/NotFound.tsx';

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
    updateDataMartOwners,
    updateDataMartDefinition,
    actualizeDataMartSchema,
    updateDataMartSchema,
    publishDataMart,
    runDataMart,
    cancelDataMartRun,
    getDataMartRuns,
    loadMoreDataMartRuns,
    isLoading,
    isLoadingMoreRuns,
    hasMoreRunsToLoad,
    hasActiveRuns,
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

  const shouldShowInsights = checkVisible('INSIGHTS_ENABLED', 'true', flags);

  const { showPromo, dismissAllPromos } = useDataMartNextStepPromo();

  // Show promo every time a published data mart page is opened.
  // For CONNECTOR type — show LOAD_DATA promo, for others — USE_DATA promo.
  useEffect(() => {
    if (!dataMartId) return;
    if (dataMartStatus.code !== DataMartStatus.PUBLISHED) return;

    const isConnector = dataMartDefinitionType === DataMartDefinitionType.CONNECTOR;

    showPromo({
      step: isConnector ? PromoStep.LOAD_DATA : PromoStep.USE_DATA,
      projectId,
      dataMartId,
      isInsightsEnabled: shouldShowInsights,
      suppressible: true,
      onManualRunClick: () => {
        setIsRunSheetOpen(true);
      },
    });
  }, [
    dataMartId,
    dataMartStatus.code,
    dataMartDefinitionType,
    showPromo,
    projectId,
    shouldShowInsights,
  ]);

  // Dismiss all promo toasts when leaving the data mart page
  useEffect(() => {
    return () => {
      dismissAllPromos();
    };
  }, [dismissAllPromos]);

  const navigation = [
    { name: 'Overview', path: 'overview' },
    { name: 'Data Setup', path: 'data-setup' },
    ...(shouldShowInsights ? [{ name: 'Insights', path: 'insights-v2' }] : []),
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

    // Check if the latest run has reached a terminal state
    const isTerminalState = [
      DataMartRunStatus.SUCCESS,
      DataMartRunStatus.FAILED,
      DataMartRunStatus.CANCELLED,
      DataMartRunStatus.INTERRUPTED,
      DataMartRunStatus.RESTRICTED,
    ].includes(latestRun.status);

    if (isTerminalState) {
      // Mark this run as processed and reset the manual run trigger
      lastRunIdRef.current = latestRun.id;
      resetManualRunTriggered();

      // Show promo only if the latest run was a successful manual connector run
      if (
        latestRun.status === DataMartRunStatus.SUCCESS &&
        latestRun.triggerType === DataMartRunTriggerType.MANUAL &&
        latestRun.type === DataMartRunType.CONNECTOR
      ) {
        // Count total successful manual connector runs
        const successfulManualConnectorRuns = runs.filter(
          run =>
            run.status === DataMartRunStatus.SUCCESS &&
            run.triggerType === DataMartRunTriggerType.MANUAL &&
            run.type === DataMartRunType.CONNECTOR
        );

        // Show promo only after the very first successful manual connector run
        if (successfulManualConnectorRuns.length === 1) {
          showPromo({
            step: PromoStep.USE_DATA,
            projectId,
            dataMartId,
            isInsightsEnabled: shouldShowInsights,
          });
        }
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
    // TODO:: Add skeleton loading indicator
  }

  if (error?.statusCode === 404) {
    return <NotFound />;
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
    <div className='min-w-[600px] px-12 py-6'>
      {dataMartStatus.code === DataMartStatus.DRAFT && (
        <div
          className='bg-brand-blue-500/10 text-brand-blue-500 relative mb-3.5 space-x-2 rounded-lg px-4 py-2 text-center text-sm leading-relaxed sm:px-10 md:-mx-10 md:-mt-4'
          aria-live='polite'
        >
          {!canPublish ? (
            <>
              <Info className='-mt-0.5 inline-block h-4 w-4 shrink-0' />
              <span>
                You can publish this Data Mart after you{' '}
                {getRequiredSetupActions(dataMartValidationErrors).map((action, index) => (
                  <span key={action}>
                    {index > 0 && ' and '}
                    <span className='font-medium'>{action}</span>
                  </span>
                ))}
                .
              </span>
            </>
          ) : (
            <>
              <Rocket className='-mt-0.5 inline-block h-4 w-4 shrink-0' />
              <span>Ready to publish.</span>
            </>
          )}
          <span className='border-t-brand-blue-500/10 pointer-events-none absolute right-32 -bottom-2 h-0 w-0 border-t-[8px] border-r-[8px] border-l-[8px] border-r-transparent border-l-transparent select-none md:right-40' />
        </div>
      )}
      <div className='items-top mb-4 flex flex-col-reverse justify-between gap-4 md:flex-row md:gap-0'>
        {/* Title and back button */}
        <div className='-ml-10 flex items-center space-x-1'>
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

        {/* Publish button and status */}
        <div
          className={cn('flex min-w-[120px] items-center gap-2', isPublishing ? 'opacity-50' : '')}
        >
          <div className='flex w-full items-center justify-between gap-2 md:w-auto'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('mr-4', !canPublish ? 'pt-1.5' : '')}>
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
              <TooltipContent side='bottom'>
                {dataMartStatus.code === DataMartStatus.PUBLISHED
                  ? 'Your published Data Mart is ready for scheduled runs'
                  : 'Draft Data Mart is not available for scheduled runs. Publish it to activate scheduling.'}
              </TooltipContent>
            </Tooltip>
            {dataMartStatus.code === DataMartStatus.DRAFT && (
              <div className='relative'>
                <Button
                  variant='default'
                  onClick={() => {
                    void handlePublish();
                  }}
                  disabled={isPublishing || !canPublish}
                  className='relative z-10'
                >
                  <CircleCheckBig className='h-4 w-4' />
                  Publish Data Mart
                </Button>
                <div
                  className={cn(
                    'bg-brand-blue-500/15 absolute -top-1.5 -right-1.5 -bottom-1.5 -left-1.5 z-0 rounded-lg',
                    !canPublish ? '' : 'dark:bg-brand-blue-500/50 animate-pulse'
                  )}
                />
              </div>
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
        <nav
          className='no-scrollbar -mb-px flex gap-2 overflow-x-auto border-b whitespace-nowrap'
          aria-label='Tabs'
          role='tablist'
        >
          {navigation.map(item => {
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 px-4 py-4 text-sm font-medium whitespace-nowrap',
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
            isLoadingMoreRuns,
            hasMoreRunsToLoad,
            hasActiveRuns,
            error,
            getErrorMessage,
            updateDataMartDescription,
            updateDataMartDefinition,
            updateDataMartOwners,
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
            projectId,
          }}
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description={
          <span className='mt-2 block space-y-2'>
            <span className='block'>
              Are you sure you want to delete <strong>"{dataMartTitle}"</strong>? This action cannot
              be undone.
            </span>
            {dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY && (
              <span className='text-destructive block'>
                Deleting this data mart will also make it unavailable in the Google Sheets
                extension.
              </span>
            )}
          </span>
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
