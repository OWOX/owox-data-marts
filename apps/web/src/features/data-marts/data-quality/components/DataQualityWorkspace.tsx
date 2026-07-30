import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
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
import { extractApiError } from '../../../../app/api';
import { Button } from '../../../../shared/components/Button';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../shared/components/CollapsibleCard';
import { formatDateShort } from '../../../../utils/date-formatters';
import {
  areDataQualityConfigsEqual,
  DATA_QUALITY_CATEGORY_LABELS,
  getDataQualityRelationshipPresentation,
  getDisplayedDataQualityFieldRuleKeys,
  getSelectableDataQualityFields,
  sortDataQualityResults,
  toStoredDataQualityConfig,
} from '../model/data-quality.model';
import type {
  DataQualityConfig,
  DataQualityConfigResponse,
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

interface DataQualitySchemaFieldMetadata {
  name: string;
  type: string;
  fields?: DataQualitySchemaFieldMetadata[];
}

interface DataQualityWorkspaceProps {
  projectId: string;
  dataMartId: string;
  schemaFields?: DataQualitySchemaFieldMetadata[];
  registerUnsavedGuard?: (registration: QualityGuardRegistration | null) => void;
}

interface DataQualityEditorState {
  workspaceKey: string;
  draft: DataQualityConfig;
  baseline: DataQualityConfig;
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
  schemaFields = [],
  registerUnsavedGuard,
}: DataQualityWorkspaceProps) {
  const {
    configResponse,
    activeRun,
    latestRunOverview,
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
        return { workspaceKey, draft: next, baseline: next };
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
  }, [latestRun?.runId, workspaceKey]);

  const isDirty = !areDataQualityConfigsEqual(draft, baseline);
  const canEdit = configResponse?.permissions.canEdit ?? false;
  const canRun = configResponse?.permissions.canRun ?? false;
  const isMutationBusy = isSaving || isStarting || isCancelling;
  const activeRunState = activeRun?.summary.state;
  const isRunActive = activeRunState === 'QUEUED' || activeRunState === 'RUNNING';

  const persistConfig = useCallback(
    async (current: DataQualityConfig) => {
      const response = await saveConfig(current);
      const normalized = toStoredDataQualityConfig(response.effectiveConfig);
      if (workspaceKeyRef.current !== workspaceKey) return null;
      setEditor(editorState => {
        if (editorState?.workspaceKey !== workspaceKey) return editorState;
        const draftChangedDuringSave = !areDataQualityConfigsEqual(editorState.draft, current);
        return {
          workspaceKey,
          draft: draftChangedDuringSave ? editorState.draft : normalized,
          baseline: normalized,
        };
      });
      return response;
    },
    [saveConfig, workspaceKey]
  );

  const handleSave = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    if (!(await persistConfig(current))) return;
    toast.success('Data Quality configuration saved');
  }, [persistConfig]);

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

  const fieldRules = useMemo(
    () => configResponse?.effectiveConfig.rules.filter(rule => rule.scope.type === 'FIELD') ?? [],
    [configResponse]
  );
  const displayedRuleKeys = useMemo(
    () => getDisplayedDataQualityFieldRuleKeys(baseline, draft),
    [baseline, draft]
  );
  const fieldTypes = useMemo(() => getDataQualityFieldTypes(schemaFields), [schemaFields]);
  const selectableFields = useMemo(() => {
    return getSelectableDataQualityFields(fieldRules, displayedRuleKeys).map(field => ({
      ...field,
      type: fieldTypes[field.fieldPathKey],
    }));
  }, [displayedRuleKeys, fieldRules, fieldTypes]);

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
    enabledChecks: applicableEnabledChecks,
    totalChecks: configuredEnabledChecks,
    notApplicableChecks: configuredEnabledChecks - applicableEnabledChecks,
  };
  const latestSummaryRun = latestRunOverview ?? latestRun;
  const displayedSummary = activeRun?.summary ?? latestSummaryRun?.summary ?? beforeFirstRunSummary;
  const displayedSummaryIsActive =
    displayedSummary.state === 'QUEUED' || displayedSummary.state === 'RUNNING';
  const displayedCheckedAt = displayedSummaryIsActive
    ? null
    : (latestSummaryRun?.finishedAt ?? latestSummaryRun?.createdAt ?? null);
  const runButtonLabel = isStarting ? 'Queuing' : 'Run';
  const savedRunUnavailableReason = getRunUnavailableReason({
    canRun,
    isMutationBusy,
    isRunActive,
    eligibilityCode,
  });
  const draftRunUnavailableReason = getDraftRunUnavailableReason({
    canEdit,
    canStartDraftConfig,
    draftApplicableEnabledChecks,
    isMutationBusy,
    isRunActive,
    eligibilityCode,
  });

  const runSavedConfig = async () => {
    try {
      await startRun();
      if (workspaceKeyRef.current !== workspaceKey) return;
      toast.success('Quality run queued');
    } catch (error) {
      toast.error(getDataQualityErrorMessage(error, 'Failed to start quality run'));
    }
  };

  const saveAndRun = async () => {
    if (!isDirty) return runSavedConfig();

    const submitted = draft;
    let savedConfigResponse: DataQualityConfigResponse;
    try {
      const response = await persistConfig(submitted);
      if (!response) return;
      savedConfigResponse = response;
    } catch (error) {
      toast.error(getDataQualityErrorMessage(error, 'Failed to save configuration'));
      return;
    }

    try {
      await startRun(savedConfigResponse.configRevision);
      if (workspaceKeyRef.current !== workspaceKey) return;
      toast.success('Configuration saved and quality run queued');
    } catch (error) {
      const details = `: ${getDataQualityErrorMessage(error, 'Failed to start quality run')}`;
      toast.error(`Configuration saved, but the quality run was not started${details}`);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelRun();
      toast.success('Quality run cancellation requested');
    } catch (error) {
      toast.error(getDataQualityErrorMessage(error, 'Failed to cancel quality run'));
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
  const visibleResultFilterOptions = resultFilterOptions.filter(
    option => option.key === 'ALL' || option.count > 0
  );
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
            <DisabledActionReason label='Run' reason={savedRunUnavailableReason}>
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
            </DisabledActionReason>
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
            <RuleGroup
              title='Table checks'
              rules={configResponse.effectiveConfig.rules.filter(
                rule => rule.scope.type === 'DATA_MART'
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
                if (addedRule?.scope.type !== 'FIELD') return;
                const nextDraft = enableRuleInDraft(draftRef.current, addedRule);
                if (!nextDraft) return;

                setEditor(current =>
                  current?.workspaceKey === workspaceKey
                    ? { ...current, draft: nextDraft }
                    : current
                );
                toast.success(
                  `${DATA_QUALITY_CATEGORY_LABELS[addedRule.category]} added to ${addedRule.scope.fieldPath.join('.')} — not saved yet`
                );
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
                toast.error(getDataQualityErrorMessage(error, 'Failed to save configuration'));
              });
            }}
          >
            <Save className='size-4' />
            Save
          </Button>
          <DisabledActionReason label='Save & Run' reason={draftRunUnavailableReason}>
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
          </DisabledActionReason>
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
                    {visibleResultFilterOptions.map(option => (
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

function getDataQualityErrorMessage(error: unknown, fallback: string): string {
  const apiError = extractApiError(error) as ReturnType<typeof extractApiError> | undefined;
  return apiError?.message ?? (error instanceof Error ? error.message : fallback);
}

const RUN_ELIGIBILITY_MESSAGES: Record<
  Exclude<DataQualityConfigResponse['runEligibility']['code'], null>,
  string
> = {
  NOT_PUBLISHED: 'Publish this Data Mart before running Data Quality checks',
  OUTPUT_SCHEMA_REQUIRED: 'Configure an Output Schema before running Data Quality checks',
  DEFINITION_REQUIRED: 'Configure a Data Mart definition before running Data Quality checks',
  NO_APPLICABLE_CHECKS: 'Enable at least one applicable Data Quality check',
  ACTIVE_RUN: 'A Data Quality run is already active',
};

function getRunUnavailableReason({
  canRun,
  isMutationBusy,
  isRunActive,
  eligibilityCode,
}: {
  canRun: boolean;
  isMutationBusy: boolean;
  isRunActive: boolean;
  eligibilityCode: DataQualityConfigResponse['runEligibility']['code'];
}): string | null {
  if (isMutationBusy) return 'Another Data Quality action is in progress';
  if (isRunActive) return RUN_ELIGIBILITY_MESSAGES.ACTIVE_RUN;
  if (eligibilityCode) return RUN_ELIGIBILITY_MESSAGES[eligibilityCode];
  if (!canRun) return 'Editor access is required to run Data Quality checks';
  return null;
}

function getDraftRunUnavailableReason({
  canEdit,
  canStartDraftConfig,
  draftApplicableEnabledChecks,
  isMutationBusy,
  isRunActive,
  eligibilityCode,
}: {
  canEdit: boolean;
  canStartDraftConfig: boolean;
  draftApplicableEnabledChecks: number;
  isMutationBusy: boolean;
  isRunActive: boolean;
  eligibilityCode: DataQualityConfigResponse['runEligibility']['code'];
}): string | null {
  if (isMutationBusy) return 'Another Data Quality action is in progress';
  if (isRunActive) return RUN_ELIGIBILITY_MESSAGES.ACTIVE_RUN;
  if (!canEdit) return 'Editor access is required to save and run Data Quality checks';
  if (draftApplicableEnabledChecks === 0) return RUN_ELIGIBILITY_MESSAGES.NO_APPLICABLE_CHECKS;
  if (!canStartDraftConfig && eligibilityCode) return RUN_ELIGIBILITY_MESSAGES[eligibilityCode];
  return null;
}

function DisabledActionReason({
  label,
  reason,
  children,
}: {
  label: string;
  reason: string | null;
  children: React.ReactNode;
}) {
  if (!reason) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`${label} unavailable: ${reason}`} className='inline-flex'>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function getDataQualityFieldTypes(
  fields: readonly DataQualitySchemaFieldMetadata[]
): Record<string, string> {
  return Object.fromEntries(getDataQualityFieldTypeEntries(fields, []));
}

function getDataQualityFieldTypeEntries(
  fields: readonly DataQualitySchemaFieldMetadata[],
  parentPath: readonly string[]
): readonly (readonly [string, string])[] {
  return fields.flatMap(field => {
    const fieldPath = [...parentPath, field.name];
    return [
      [JSON.stringify(fieldPath), field.type] as const,
      ...getDataQualityFieldTypeEntries(field.fields ?? [], fieldPath),
    ];
  });
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

function enableRuleInDraft(
  draft: DataQualityConfig | null,
  effectiveRule: EffectiveDataQualityRuleConfig
): DataQualityConfig | null {
  if (!draft) return null;
  const existingRule = draft.rules.find(rule => rule.key === effectiveRule.key);
  if (existingRule?.enabled) return null;

  if (existingRule) {
    return {
      ...draft,
      rules: draft.rules.map(rule =>
        rule.key === effectiveRule.key ? { ...rule, enabled: true } : rule
      ),
    };
  }

  const storedRule = toStoredDataQualityConfig({ rules: [effectiveRule] }).rules[0];
  return {
    ...draft,
    rules: [...draft.rules, { ...storedRule, enabled: true }],
  };
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
