import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Label } from '@owox/ui/components/label';
import { Skeleton } from '@owox/ui/components/skeleton';
import {
  AlertCircle,
  FileCheck2,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Button } from '../../../../shared/components/Button';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../shared/components/CollapsibleCard';
import { formatDateShort } from '../../../../utils/date-formatters';
import { timezoneService } from '../../../../services';
import {
  areDataQualityConfigsEqual,
  DATA_QUALITY_CATEGORY_LABELS,
  getDataQualityRelationshipPresentation,
  getDisplayedDataQualityFieldRuleKeys,
  getSelectableDataQualityFields,
  isTableLevelDataFreshness,
  sortDataQualityResults,
  toStoredDataQualityConfig,
} from '../model/data-quality.model';
import type {
  DataQualityCompactSummary,
  DataQualityConfig,
  DataQualityRelationshipMetadata,
  DataQualityRuleConfig,
  EffectiveDataQualityRuleConfig,
} from '../model/types';
import { useDataQualityWorkspace } from '../model/use-data-quality-workspace';
import { DataQualityFieldChecks } from './DataQualityFieldChecks';
import { DataQualityResultCard } from './DataQualityResultCard';
import { DataQualityRuleEditor } from './DataQualityRuleEditor';
import { DataQualitySummaryPanel } from './DataQualitySummaryPanel';

interface QualityGuardRegistration {
  changeLabel: string;
  isDirty: () => boolean;
  getSchema: () => undefined;
  save: () => Promise<undefined>;
  discard: () => undefined;
}

interface DataQualityWorkspaceProps {
  projectId: string;
  dataMartId: string;
  qualitySummary?: DataQualityCompactSummary;
  schemaFields?: { name: string; alias?: string; type: string }[];
  registerUnsavedGuard?: (registration: QualityGuardRegistration | null) => void;
}

interface DataQualityEditorState {
  workspaceKey: string;
  draft: DataQualityConfig;
  baseline: DataQualityConfig;
}

interface PendingConfigConfirmation {
  workspaceKey: string;
  staleConfig: DataQualityConfig;
}

type DataQualityResultFilter = 'ALL' | 'ISSUES' | 'PASSED' | 'NOT_APPLICABLE';

const NEVER_RUN_SUMMARY = {
  state: 'NEVER_RUN' as const,
  enabledChecks: 0,
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  notApplicableChecks: 0,
  errorChecks: 0,
  noticeFindings: 0,
  warningFindings: 0,
  errorFindings: 0,
  violationCount: 0,
  highestSeverity: null,
};

export function DataQualityWorkspace({
  projectId,
  dataMartId,
  qualitySummary,
  schemaFields = [],
  registerUnsavedGuard,
}: DataQualityWorkspaceProps) {
  const {
    configResponse,
    latestRun,
    isLoading,
    isError,
    isResultsLoading,
    resultsError,
    isSaving,
    isStarting,
    isCancelling,
    saveConfig,
    startRun,
    cancelRun,
  } = useDataQualityWorkspace(projectId, dataMartId);

  const workspaceKey = `${projectId}:${dataMartId}`;
  const workspaceKeyRef = useRef(workspaceKey);
  workspaceKeyRef.current = workspaceKey;
  const [editor, setEditor] = useState<DataQualityEditorState | null>(null);
  const [resultFilter, setResultFilter] = useState<DataQualityResultFilter>('ALL');
  const pendingConfigConfirmationRef = useRef<PendingConfigConfirmation | null>(null);
  const currentEditor = editor?.workspaceKey === workspaceKey ? editor : null;
  const draft = currentEditor?.draft ?? null;
  const baseline = currentEditor?.baseline ?? null;
  const draftRef = useRef<DataQualityConfig | null>(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!configResponse) return;
    const next = toStoredDataQualityConfig(configResponse.effectiveConfig);
    setEditor(current => {
      if (current?.workspaceKey !== workspaceKey) {
        pendingConfigConfirmationRef.current = null;
        return { workspaceKey, draft: next, baseline: next };
      }

      const pending = pendingConfigConfirmationRef.current;
      if (pending?.workspaceKey === workspaceKey) {
        if (areDataQualityConfigsEqual(next, pending.staleConfig)) return current;
        pendingConfigConfirmationRef.current = null;
      }

      if (!areDataQualityConfigsEqual(current.draft, current.baseline)) return current;
      if (
        areDataQualityConfigsEqual(current.draft, next) &&
        areDataQualityConfigsEqual(current.baseline, next)
      ) {
        return current;
      }
      return { workspaceKey, draft: next, baseline: next };
    });
  }, [configResponse, workspaceKey]);

  useEffect(() => {
    setResultFilter('ALL');
  }, [latestRun?.id, workspaceKey]);

  const isDirty = !areDataQualityConfigsEqual(draft, baseline);
  const canEdit = configResponse?.permissions.canEdit ?? false;
  const canRun = configResponse?.permissions.canRun ?? false;
  const isMutationBusy = isSaving || isStarting || isCancelling;
  const activeRunState = latestRun?.summary.state;
  const isRunActive = activeRunState === 'QUEUED' || activeRunState === 'RUNNING';

  const handleSave = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    const response = await saveConfig(current);
    const normalized = toStoredDataQualityConfig(response.effectiveConfig);
    if (workspaceKeyRef.current !== workspaceKey) return;
    pendingConfigConfirmationRef.current = null;
    setEditor(editorState => {
      if (editorState?.workspaceKey !== workspaceKey) return editorState;
      const draftChangedDuringSave = !areDataQualityConfigsEqual(editorState.draft, current);
      return {
        workspaceKey,
        draft: draftChangedDuringSave ? editorState.draft : normalized,
        baseline: normalized,
      };
    });
    toast.success('Data Quality configuration saved');
  }, [saveConfig, workspaceKey]);

  const handleDiscard = useCallback(() => {
    setEditor(current =>
      current?.workspaceKey === workspaceKey ? { ...current, draft: current.baseline } : current
    );
  }, [workspaceKey]);

  useEffect(() => {
    registerUnsavedGuard?.({
      changeLabel: 'Data Quality configuration',
      isDirty: () => !areDataQualityConfigsEqual(draftRef.current, baseline),
      getSchema: () => undefined,
      save: async () => {
        await handleSave();
        return undefined;
      },
      discard: () => {
        handleDiscard();
        return undefined;
      },
    });
    return () => registerUnsavedGuard?.(null);
  }, [baseline, handleDiscard, handleSave, registerUnsavedGuard, isDirty]);

  const timezoneOptions = useMemo(() => {
    const currentTimezone = draft?.timezone ?? 'UTC';
    let options: { value: string; label: string }[] = [];

    try {
      options = timezoneService.getTimezonesWithOffset().map(timezone => ({
        value: timezone.identifier,
        label: timezone.displayName,
      }));
    } catch {
      // Keep the stored timezone selectable when the browser cannot enumerate IANA zones.
    }

    if (!options.some(option => option.value === currentTimezone)) {
      const offset = timezoneService.formatOffset(
        timezoneService.getTimezoneOffset(currentTimezone)
      );
      options.unshift({
        value: currentTimezone,
        label: `${currentTimezone} (${offset})`,
      });
    }

    return options;
  }, [draft?.timezone]);

  const fieldRules = useMemo(
    () => configResponse?.effectiveConfig.rules.filter(rule => rule.scope.type === 'FIELD') ?? [],
    [configResponse]
  );
  const displayedRuleKeys = useMemo(
    () => getDisplayedDataQualityFieldRuleKeys(baseline, draft),
    [baseline, draft]
  );
  const selectableFields = useMemo(() => {
    const metadata = new Map(
      schemaFields.map(field => [field.alias ?? field.name, { type: field.type }])
    );
    return getSelectableDataQualityFields(fieldRules, displayedRuleKeys).map(field => ({
      ...field,
      type: metadata.get(field.id)?.type,
    }));
  }, [displayedRuleKeys, fieldRules, schemaFields]);
  const fieldTypes = useMemo(
    () =>
      Object.fromEntries(
        schemaFields.map(field => [field.alias ?? field.name, field.type])
      ) as Record<string, string>,
    [schemaFields]
  );

  if (isError) {
    return (
      <Alert variant='destructive' data-testid='datamartTabQuality'>
        <AlertCircle />
        <AlertTitle>Unable to load Data Quality</AlertTitle>
        <AlertDescription>Refresh the page or try again later.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !configResponse || !draft) {
    return (
      <div className='space-y-4' data-testid='datamartTabQuality'>
        <Skeleton className='h-36 w-full' />
        <Skeleton className='h-72 w-full' />
      </div>
    );
  }

  const updateRule = (key: string, next: DataQualityRuleConfig) => {
    setEditor(current =>
      current?.workspaceKey === workspaceKey
        ? {
            ...current,
            draft: {
              ...current.draft,
              rules: current.draft.rules.map(rule => (rule.key === key ? next : rule)),
            },
          }
        : current
    );
  };

  const applicableEnabledChecks = configResponse.effectiveConfig.rules.filter(
    rule => rule.enabled && rule.isApplicable
  ).length;
  const configuredEnabledChecks = configResponse.effectiveConfig.rules.filter(
    rule => rule.enabled
  ).length;
  const applicableKeys = new Set(
    configResponse.effectiveConfig.rules.filter(rule => rule.isApplicable).map(rule => rule.key)
  );
  const draftApplicableEnabledChecks = draft.rules.filter(
    rule => rule.enabled && applicableKeys.has(rule.key)
  ).length;
  const eligibilityCode = configResponse.runEligibility.code;
  const dirtyConfigCanResolveEligibility = eligibilityCode === 'NO_APPLICABLE_CHECKS';
  const canStartDraftConfig =
    isDirty &&
    canEdit &&
    draftApplicableEnabledChecks > 0 &&
    (canRun || dirtyConfigCanResolveEligibility);
  const beforeFirstRunSummary = {
    ...NEVER_RUN_SUMMARY,
    state: configuredEnabledChecks === 0 ? ('ALL_DISABLED' as const) : ('NEVER_RUN' as const),
    enabledChecks: configuredEnabledChecks,
    totalChecks: applicableEnabledChecks === 0 ? configuredEnabledChecks : 0,
    notApplicableChecks: applicableEnabledChecks === 0 ? configuredEnabledChecks : 0,
  };
  const displayedSummary =
    latestRun?.summary ?? (qualitySummary?.dataMartRunId ? qualitySummary : beforeFirstRunSummary);
  const displayedSummaryIsActive =
    displayedSummary.state === 'QUEUED' || displayedSummary.state === 'RUNNING';
  const displayedCheckedAt = displayedSummaryIsActive
    ? null
    : (latestRun?.finishedAt ?? latestRun?.createdAt ?? qualitySummary?.lastRunAt);
  const runButtonLabel = isStarting ? 'Queuing' : 'Run';

  const runSavedConfig = async () => {
    try {
      await startRun();
      if (workspaceKeyRef.current !== workspaceKey) return;
      toast.success('Quality run queued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start quality run');
    }
  };

  const saveAndRun = async () => {
    if (!isDirty) return runSavedConfig();

    try {
      const submitted = draft;
      const pendingConfirmation = {
        workspaceKey,
        staleConfig: toStoredDataQualityConfig(configResponse.effectiveConfig),
      };
      pendingConfigConfirmationRef.current = pendingConfirmation;
      try {
        await startRun(submitted);
      } catch (error) {
        if (pendingConfigConfirmationRef.current === pendingConfirmation) {
          pendingConfigConfirmationRef.current = null;
        }
        throw error;
      }
      if (workspaceKeyRef.current !== workspaceKey) {
        if (pendingConfigConfirmationRef.current === pendingConfirmation) {
          pendingConfigConfirmationRef.current = null;
        }
        return;
      }
      // A refresh that was already in flight may have observed the old server value and
      // cleared the first guard while this mutation was pending. Re-arm it after success so
      // only that exact pre-submission value is ignored; the next distinct server config wins.
      pendingConfigConfirmationRef.current = pendingConfirmation;
      setEditor(current =>
        current?.workspaceKey === workspaceKey
          ? { workspaceKey, draft: submitted, baseline: submitted }
          : current
      );
      toast.success('Configuration saved and quality run queued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start quality run');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelRun();
      toast.success('Quality run cancellation requested');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel quality run');
    }
  };

  const sortedResults = latestRun ? sortDataQualityResults(latestRun.results) : [];
  const resultFilterOptions = [
    { key: 'ALL' as const, label: 'All', count: sortedResults.length },
    {
      key: 'ISSUES' as const,
      label: 'Needs attention',
      count: sortedResults.filter(result => result.status === 'FAILED' || result.status === 'ERROR')
        .length,
    },
    {
      key: 'PASSED' as const,
      label: 'Passed',
      count: sortedResults.filter(result => result.status === 'PASSED').length,
    },
    {
      key: 'NOT_APPLICABLE' as const,
      label: 'Not applicable',
      count: sortedResults.filter(result => result.status === 'NOT_APPLICABLE').length,
    },
  ];
  const visibleResults = sortedResults.filter(result => {
    if (resultFilter === 'ALL') return true;
    if (resultFilter === 'ISSUES') return result.status === 'FAILED' || result.status === 'ERROR';
    return result.status === resultFilter;
  });
  const resultRelationships = latestRun?.snapshot?.relationships ?? configResponse.relationships;

  return (
    <div className='space-y-4' data-testid='datamartTabQuality'>
      <DataQualitySummaryPanel
        summary={displayedSummary}
        checkedAt={displayedCheckedAt}
        actions={
          isRunActive ? (
            <Button
              variant='outline'
              disabled={isCancelling}
              onClick={() => {
                void handleCancel();
              }}
            >
              {isCancelling ? (
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              ) : (
                <X className='size-4' aria-hidden='true' />
              )}
              Cancel run
            </Button>
          ) : (
            <Button
              disabled={isMutationBusy || !canRun}
              onClick={() => {
                void runSavedConfig();
              }}
            >
              {isStarting ? (
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              ) : (
                <Play className='size-4' aria-hidden='true' />
              )}
              {runButtonLabel}
            </Button>
          )
        }
      />

      {!canEdit && (
        <Alert>
          <AlertCircle />
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            You have view-only access. You can browse the configuration and reports, but editing and
            running checks requires the Editor role.
          </AlertDescription>
        </Alert>
      )}

      <CollapsibleCard collapsible name='data-quality-checks-configuration'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={ListChecks}
            tooltip='Choose the checks that run together against this Data Mart'
          >
            <h2>Checks configuration</h2>
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='space-y-6'>
            <div
              className='bg-background flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3'
              data-testid='data-quality-timezone-row'
            >
              <Label className='shrink-0' htmlFor='data-quality-timezone'>
                Timezone
              </Label>
              <Combobox
                id='data-quality-timezone'
                options={timezoneOptions}
                value={draft.timezone}
                disabled={!canEdit || isMutationBusy}
                onValueChange={timezone => {
                  setEditor(current =>
                    current?.workspaceKey === workspaceKey
                      ? { ...current, draft: { ...current.draft, timezone } }
                      : current
                  );
                }}
                placeholder='Select timezone'
                emptyMessage='No timezones found'
                className='w-full sm:w-64'
              />
              <p className='text-muted-foreground text-xs'>
                Applies to time-sensitive field checks.
              </p>
            </div>
            <RuleGroup
              title='Table checks'
              rules={configResponse.effectiveConfig.rules.filter(
                rule => rule.scope.type === 'DATA_MART' && !isTableLevelDataFreshness(rule)
              )}
              draft={draft}
              disabled={!canEdit || isMutationBusy}
              onChange={updateRule}
            />
            <DataQualityFieldChecks
              rules={fieldRules}
              draft={draft}
              displayedRuleKeys={displayedRuleKeys}
              selectableFields={selectableFields}
              fieldTypes={fieldTypes}
              disabled={!canEdit || isMutationBusy}
              onAddCheck={ruleKey => {
                const addedRule = fieldRules.find(rule => rule.key === ruleKey);
                setEditor(current =>
                  current?.workspaceKey === workspaceKey
                    ? {
                        ...current,
                        draft: {
                          ...current.draft,
                          rules: current.draft.rules.map(rule =>
                            rule.key === ruleKey ? { ...rule, enabled: true } : rule
                          ),
                        },
                      }
                    : current
                );
                if (addedRule?.scope.type === 'FIELD') {
                  toast.success(
                    `${DATA_QUALITY_CATEGORY_LABELS[addedRule.category]} added to ${addedRule.scope.fieldId} — not saved yet`
                  );
                }
              }}
              onChange={updateRule}
            />
            <RuleGroup
              title='Relationship checks'
              rules={configResponse.effectiveConfig.rules.filter(
                rule => rule.scope.type === 'RELATIONSHIP'
              )}
              draft={draft}
              disabled={!canEdit || isMutationBusy}
              onChange={updateRule}
              getScopePresentation={rule =>
                getRelationshipScopePresentation(rule, configResponse.relationships)
              }
            />
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      {isDirty && (
        <div className='bg-background/95 sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-3 shadow-lg backdrop-blur'>
          <div className='mr-auto min-w-0'>
            <p className='text-sm font-medium'>Unsaved configuration changes</p>
          </div>
          <Button variant='ghost' disabled={isMutationBusy || !canEdit} onClick={handleDiscard}>
            <RotateCcw className='size-4' />
            Discard
          </Button>
          <Button
            variant='outline'
            disabled={isMutationBusy || !canEdit}
            onClick={() => {
              void handleSave().catch((error: unknown) => {
                toast.error(
                  error instanceof Error ? error.message : 'Failed to save configuration'
                );
              });
            }}
          >
            <Save className='size-4' />
            Save
          </Button>
          <Button
            disabled={isMutationBusy || isRunActive || !canStartDraftConfig}
            onClick={() => {
              void saveAndRun();
            }}
          >
            {isStarting ? (
              <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            ) : (
              <Play className='size-4' aria-hidden='true' />
            )}
            Save & Run
          </Button>
        </div>
      )}

      {latestRun && sortedResults.length > 0 && (
        <section aria-labelledby='quality-results-title'>
          <CollapsibleCard collapsible name='data-quality-latest-report'>
            <CollapsibleCardHeader>
              <CollapsibleCardHeaderTitle
                icon={FileCheck2}
                tooltip='Review the latest Data Quality check results'
                subtitle={`Last checked ${formatDateShort(latestRun.finishedAt ?? latestRun.createdAt)}`}
              >
                <h2 id='quality-results-title'>Latest report</h2>
              </CollapsibleCardHeaderTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <div className='space-y-3'>
                <header className='flex flex-wrap items-center gap-3'>
                  <p className='text-muted-foreground text-xs'>
                    From the run on {formatDateShort(latestRun.finishedAt ?? latestRun.createdAt)} ·{' '}
                    <Link
                      className='hover:text-foreground font-medium hover:underline'
                      to={`/ui/${projectId}/data-marts/${dataMartId}/run-history`}
                    >
                      View in Run History
                    </Link>
                  </p>
                  <div
                    className='ml-auto flex shrink-0 flex-wrap gap-1'
                    aria-label='Filter check results'
                  >
                    {resultFilterOptions.map(option => (
                      <Button
                        key={option.key}
                        type='button'
                        size='sm'
                        variant={resultFilter === option.key ? 'secondary' : 'ghost'}
                        aria-pressed={resultFilter === option.key}
                        onClick={() => {
                          setResultFilter(option.key);
                        }}
                      >
                        {option.label} {option.count}
                      </Button>
                    ))}
                  </div>
                </header>
                {visibleResults.map(result => {
                  const relationshipPresentation =
                    result.scope.type === 'RELATIONSHIP'
                      ? getDataQualityRelationshipPresentation(
                          result.scope.relationshipId,
                          resultRelationships
                        )
                      : undefined;

                  return (
                    <DataQualityResultCard
                      key={result.id}
                      result={result}
                      titleSuffix={relationshipPresentation?.titleSuffix}
                      scopeLabel={relationshipPresentation?.scopeLabel}
                      scopeDetails={relationshipPresentation?.scopeDetails}
                      targetAlias={relationshipPresentation?.targetAlias}
                    />
                  );
                })}
              </div>
            </CollapsibleCardContent>
            <CollapsibleCardFooter />
          </CollapsibleCard>
        </section>
      )}

      {isResultsLoading && <Skeleton className='h-40 w-full' />}
      {resultsError && (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>Unable to load check results</AlertTitle>
          <AlertDescription>
            The run summary is available, but its detailed report failed to load.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface RuleGroupProps {
  title: string;
  rules: EffectiveDataQualityRuleConfig[];
  draft: DataQualityConfig;
  disabled: boolean;
  onChange: (key: string, next: DataQualityRuleConfig) => void;
  getScopePresentation?: (rule: EffectiveDataQualityRuleConfig) => {
    titleSuffix?: string;
    scopeLabel: string;
    scopeDetails: string[];
  };
}

function RuleGroup({
  title,
  rules,
  draft,
  disabled,
  onChange,
  getScopePresentation,
}: RuleGroupProps) {
  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      {rules.length === 0 ? (
        <p className='bg-background text-muted-foreground rounded-md border border-dashed p-4 text-sm'>
          No checks are available for this scope.
        </p>
      ) : (
        <div className='bg-background divide-y overflow-hidden rounded-lg border'>
          {rules.map(rule => {
            const value = draft.rules.find(item => item.key === rule.key);
            if (!value) return null;
            const scopePresentation = getScopePresentation?.(rule);
            return (
              <DataQualityRuleEditor
                key={rule.key}
                rule={rule}
                value={value}
                disabled={disabled}
                titleSuffix={scopePresentation?.titleSuffix}
                scopeLabel={scopePresentation?.scopeLabel}
                scopeDetails={scopePresentation?.scopeDetails}
                onChange={next => {
                  onChange(rule.key, next);
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function getRelationshipScopePresentation(
  rule: EffectiveDataQualityRuleConfig,
  relationships: DataQualityRelationshipMetadata[]
): {
  titleSuffix?: string;
  scopeLabel: string;
  scopeDetails: string[];
} {
  if (rule.scope.type !== 'RELATIONSHIP') {
    return { scopeLabel: '', scopeDetails: [] };
  }

  return getDataQualityRelationshipPresentation(rule.scope.relationshipId, relationships);
}
