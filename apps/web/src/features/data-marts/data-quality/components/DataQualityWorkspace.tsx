import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { Label } from '@owox/ui/components/label';
import { Skeleton } from '@owox/ui/components/skeleton';
import { AlertCircle, Loader2, Play, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../../shared/components/Button';
import { timezoneService } from '../../../../services';
import {
  areDataQualityConfigsEqual,
  getDisplayedDataQualityFieldRuleKeys,
  getSelectableDataQualityFields,
  isTableLevelDataFreshness,
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
    saveConfig,
    startRun,
  } = useDataQualityWorkspace(projectId, dataMartId);

  const workspaceKey = `${projectId}:${dataMartId}`;
  const workspaceKeyRef = useRef(workspaceKey);
  workspaceKeyRef.current = workspaceKey;
  const [editor, setEditor] = useState<DataQualityEditorState | null>(null);
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

  const isDirty = !areDataQualityConfigsEqual(draft, baseline);
  const canEdit = configResponse?.permissions.canEdit ?? false;
  const canRun = configResponse?.permissions.canRun ?? false;
  const isMutationBusy = isSaving || isStarting;
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

  const timezones = useMemo(() => {
    try {
      return Array.from(
        new Set(['UTC', 'Europe/Kyiv', draft?.timezone ?? 'UTC', ...timezoneService.getTimezones()])
      ).sort();
    } catch {
      return Array.from(new Set(['UTC', 'Europe/Kyiv', draft?.timezone ?? 'UTC']));
    }
  }, [draft?.timezone]);

  const fieldRules = useMemo(
    () => configResponse?.effectiveConfig.rules.filter(rule => rule.scope.type === 'FIELD') ?? [],
    [configResponse]
  );
  const displayedRuleKeys = useMemo(
    () => getDisplayedDataQualityFieldRuleKeys(baseline, draft),
    [baseline, draft]
  );
  const selectableFields = useMemo(
    () => getSelectableDataQualityFields(fieldRules, displayedRuleKeys),
    [displayedRuleKeys, fieldRules]
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
  const canStartCurrentConfig = isDirty
    ? canEdit && draftApplicableEnabledChecks > 0 && (canRun || dirtyConfigCanResolveEligibility)
    : canRun;
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
  const runButtonLabel = isStarting
    ? 'Queuing'
    : activeRunState === 'QUEUED'
      ? 'Queued'
      : activeRunState === 'RUNNING'
        ? 'Running'
        : isDirty
          ? 'Save & Run'
          : 'Run';

  const run = async () => {
    try {
      if (isDirty) {
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
      } else {
        await startRun();
        if (workspaceKeyRef.current !== workspaceKey) return;
        toast.success('Quality run queued');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start quality run');
    }
  };

  return (
    <div className='space-y-4' data-testid='datamartTabQuality'>
      <DataQualitySummaryPanel summary={displayedSummary} checkedAt={displayedCheckedAt} />

      {!canEdit && (
        <Alert>
          <AlertCircle />
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>You have read-only access to Data Quality.</AlertDescription>
        </Alert>
      )}

      <Card className='gap-4 py-5'>
        <CardHeader className='flex-row flex-wrap items-start justify-between gap-4 px-5'>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='font-semibold'>Checks configuration</h2>
              <span className='bg-muted rounded px-2 py-0.5 text-xs'>
                {configResponse.source === 'DEFAULT' ? 'System preset' : 'Saved configuration'}
              </span>
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>
              All checks in one run consume one Data Quality run event.
            </p>
          </div>
          <div className='min-w-64 space-y-1'>
            <Label htmlFor='data-quality-timezone'>Timezone</Label>
            <select
              id='data-quality-timezone'
              aria-label='Timezone'
              className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-50'
              value={draft.timezone}
              disabled={!canEdit || isMutationBusy}
              onChange={event => {
                const timezone = event.target.value;
                setEditor(current =>
                  current?.workspaceKey === workspaceKey
                    ? { ...current, draft: { ...current.draft, timezone } }
                    : current
                );
              }}
            >
              {timezones.map(timezone => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className='space-y-6 px-5'>
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
            disabled={!canEdit || isMutationBusy}
            onAddCheck={ruleKey => {
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
        </CardContent>
      </Card>

      <div className='bg-background/95 sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t py-3 backdrop-blur'>
        <Button
          variant='ghost'
          disabled={!isDirty || isMutationBusy || !canEdit}
          onClick={handleDiscard}
        >
          <RotateCcw className='size-4' />
          Discard
        </Button>
        {isDirty && (
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
        )}
        <Button
          disabled={isMutationBusy || isRunActive || !canStartCurrentConfig}
          onClick={() => {
            void run();
          }}
        >
          {isMutationBusy || isRunActive ? (
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
          ) : (
            <Play className='size-4' aria-hidden='true' />
          )}
          {runButtonLabel}
        </Button>
      </div>

      {latestRun && latestRun.results.length > 0 && (
        <section className='space-y-3' aria-labelledby='quality-results-title'>
          <h2 id='quality-results-title' className='text-lg font-semibold'>
            Check results
          </h2>
          {latestRun.results.map(result => (
            <DataQualityResultCard key={result.id} result={result} />
          ))}
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
    label: string;
    details?: string[];
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
        <p className='text-muted-foreground rounded-md border border-dashed p-4 text-sm'>
          No checks are available for this scope.
        </p>
      ) : (
        <div className='space-y-3'>
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
                scopeLabel={scopePresentation?.label}
                scopeDetails={scopePresentation?.details}
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
): { label: string; details?: string[] } {
  if (rule.scope.type !== 'RELATIONSHIP') {
    return { label: '' };
  }

  const relationshipId = rule.scope.relationshipId;
  const relationship = relationships.find(item => item.id === relationshipId);
  if (!relationship) {
    return { label: `Relationship ID: ${relationshipId}` };
  }

  const joinMapping = relationship.joinConditions
    .map(condition => `${condition.sourceFieldName} → ${condition.targetFieldName}`)
    .join(', ');

  return {
    label: relationship.targetAlias,
    details: [joinMapping, `Relationship ID: ${relationship.id}`].filter(Boolean),
  };
}
