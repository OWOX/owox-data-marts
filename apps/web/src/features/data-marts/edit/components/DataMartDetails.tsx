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
import { ArrowLeft, CircleCheckBig, MoreVertical, Play, Trash2 } from 'lucide-react';
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
import NoAccess from '../../../../pages/NoAccess.tsx';

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

  const isConnector = dataMartDefinitionType === DataMartDefinitionType.CONNECTOR;
  const isPublished = dataMartStatus.code === DataMartStatus.PUBLISHED;
  const isDraft = dataMartStatus.code === DataMartStatus.DRAFT;

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

  // Show promo once a published data mart page is opened.
  // For CONNECTOR type — show SCHEDULE_DATA promo, for others — USE_DATA promo.
  // Show once to prevent multiple toasts for the same data mart.
  useEffect(() => {
    if (!dataMartId) return;
    if (!isPublished) return;

    showPromo({
      step: isConnector ? PromoStep.SCHEDULE_DATA : PromoStep.USE_DATA,
      projectId,
      dataMartId,
      isInsightsEnabled: shouldShowInsights,
      showOnce: true,
    });
  }, [dataMartId, isPublished, isConnector, showPromo, projectId, shouldShowInsights]);

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
      showPromo({
        step: isConnector ? PromoStep.SCHEDULE_DATA : PromoStep.USE_DATA,
        projectId,
        dataMartId,
        isInsightsEnabled: shouldShowInsights,
        showOnce: true,
      });
    } catch (error) {
      console.log(error instanceof Error ? error.message : 'Failed to publish Data Mart');
    } finally {
      setIsPublishing(false);
    }
  }, [
    dataMartId,
    isConnector,
    publishDataMart,
    runSchemaActualization,
    showPromo,
    projectId,
    shouldShowInsights,
  ]);

  const handleManualRun = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!dataMartId) return;
      if (!isPublished) {
        toast.error('Manual run is only available for published Data Marts');
        return;
      }
      lastRunIdRef.current = runs[0]?.id || null;
      await runDataMart({ id: dataMartId, payload });
    },
    [dataMartId, isPublished, runDataMart, runs]
  );

  // Show promo after the first successful manual connector run
  useEffect(() => {
    if (!isManualRunTriggered || !runs.length) return;
    if (!isConnector) return;

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
            showOnce: true,
          });
        }
      }
    }
  }, [
    runs,
    isManualRunTriggered,
    isConnector,
    resetManualRunTriggered,
    showPromo,
    projectId,
    dataMartId,
    shouldShowInsights,
  ]);

  if (isLoading) {
    // TODO:: Add skeleton loading indicator
  }

  if (error?.statusCode === 403) {
    return <NoAccess />;
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

  // Config for publish button and tooltip based on data mart type
  const publishText = {
    buttonLabel: isConnector ? 'Publish & Run Data Mart' : 'Publish Data Mart',
    tooltipText: isConnector
      ? 'Publish and start loading data'
      : 'Publish to enable reports and scheduled runs',
  };

  return (
    <div
      className='min-w-[600px] px-4 py-6 md:min-w-0 md:px-8 md:py-4 lg:px-12 xl:px-16'
      data-testid='datamartDetails'
    >
      <div className='items-top -mt-2.5 mb-4 flex flex-col-reverse justify-between gap-2 md:-mt-0 md:flex-row md:items-start md:gap-4'>
        {/* Title and back button */}
        <div className='-ml-4 flex min-w-0 items-start md:-ml-6 md:gap-2 lg:-ml-11'>
          <Button
            onClick={() => {
              navigate('/data-marts');
            }}
            variant='ghost'
            className='mt-1 size-7 md:mt-0 md:size-8 lg:size-9'
            aria-label='Back to Data Marts'
            title='Back to Data Marts'
          >
            <ArrowLeft className='h-4 w-4 lg:h-5 lg:w-5' />
          </Button>
          <div data-testid='datamartTitleInput' className='min-w-0 flex-1'>
            <InlineEditTitle
              title={dataMartTitle}
              onUpdate={handleTitleUpdate}
              className='text-2xl font-medium'
            />
          </div>
        </div>

        {/* Publish button and status */}
        <div
          className={cn(
            'flex w-full min-w-0 shrink-0 items-center justify-end gap-4 md:w-auto md:justify-start',
            isPublishing ? 'opacity-50' : ''
          )}
        >
          <div className='flex min-w-0 shrink-0 items-center gap-4'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn('shrink-0', !canPublish ? 'md:pt-1' : '')}>
                  <StatusLabel
                    type={isPublished ? StatusTypeEnum.SUCCESS : StatusTypeEnum.NEUTRAL}
                    variant='subtle'
                  >
                    {dataMartStatus.displayName}
                  </StatusLabel>
                </div>
              </TooltipTrigger>
              <TooltipContent side='bottom'>
                {isPublished
                  ? 'Your published Data Mart is ready for scheduled runs'
                  : 'Draft Data Mart is not available for scheduled runs. Publish it to activate scheduling.'}
              </TooltipContent>
            </Tooltip>
            {isDraft && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='relative shrink-0'>
                    <Button
                      variant='default'
                      onClick={() => {
                        void handlePublish();
                      }}
                      disabled={isPublishing || !canPublish}
                      className={cn(
                        'relative z-10',
                        canPublish && 'shadow-brand-blue-500/20 shadow-lg'
                      )}
                      data-testid='datamartPublishButton'
                    >
                      <CircleCheckBig className='h-4 w-4' />
                      {publishText.buttonLabel}
                    </Button>
                    <div
                      className={cn(
                        'bg-brand-blue-500/15 pointer-events-none absolute -top-1 -right-1 -bottom-1 -left-1 z-0 hidden rounded-lg md:-top-1.5 md:-right-1.5 md:-bottom-1.5 md:-left-1.5 md:block',
                        !canPublish
                          ? ''
                          : 'bg-brand-blue-500/25 motion-safe:animate-[soft-glow_3s_ease-in-out_infinite]'
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side='bottom' className='max-w-sm'>
                  {!canPublish ? (
                    <>
                      <p>Please complete the following steps:</p>
                      <ul className='mt-1 list-disc space-y-0.5 pl-4 font-medium'>
                        {getRequiredSetupActions(dataMartValidationErrors).map(action => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>{publishText.tooltipText}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='size-7 md:size-8 lg:size-9'>
                <MoreVertical className='h-4 w-4 lg:h-5 lg:w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {isConnector && (
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
                data-testid='datamartDeleteButton'
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

      <div className='relative'>
        <nav
          className='no-scrollbar -mb-px flex gap-2 overflow-x-auto border-b whitespace-nowrap'
          aria-label='Tabs'
          role='tablist'
          data-testid='datamartTabNav'
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
        <div className='from-background pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent' />
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
    </div>
  );
}
