// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityWorkspace } from './DataQualityWorkspace';
import type { DataQualityCompactSummary, DataQualityConfigResponse } from '../model/types';
import { useDataQualityWorkspace } from '../model/use-data-quality-workspace';

vi.mock('../model/use-data-quality-workspace', () => ({
  useDataQualityWorkspace: vi.fn(),
}));

const configResponse: DataQualityConfigResponse = {
  savedConfig: null,
  source: 'DEFAULT',
  permissions: { canEdit: true, canRun: true },
  runEligibility: { eligible: true, code: null, activeRunId: null },
  availableChecks: ['empty_table', 'null_rate', 'relationship_integrity'],
  effectiveConfig: {
    timezone: 'UTC',
    rules: [
      {
        key: 'empty_table:data_mart',
        category: 'empty_table',
        scope: { type: 'DATA_MART' },
        severity: 'error',
        enabled: true,
        parameters: {},
        isApplicable: true,
      },
      {
        key: 'null_rate:field:email',
        category: 'null_rate',
        scope: { type: 'FIELD', fieldId: 'email' },
        severity: 'warning',
        enabled: false,
        parameters: { thresholdPercent: 1 },
        isApplicable: true,
      },
      {
        key: 'relationship_integrity:relationship:rel-1',
        category: 'relationship_integrity',
        scope: { type: 'RELATIONSHIP', relationshipId: 'rel-1' },
        severity: 'warning',
        enabled: false,
        parameters: {},
        isApplicable: false,
        notApplicableReason: 'Target Data Mart is unavailable',
      },
    ],
  },
};

const saveConfig = vi.fn();
const startRun = vi.fn();

function mockWorkspace(overrides: Record<string, unknown> = {}) {
  vi.mocked(useDataQualityWorkspace).mockReturnValue({
    configResponse,
    latestRun: null,
    isLoading: false,
    isError: false,
    error: null,
    isResultsLoading: false,
    resultsError: null,
    isSaving: false,
    isStarting: false,
    saveConfig,
    startRun,
    ...overrides,
  } as ReturnType<typeof useDataQualityWorkspace>);
}

describe('DataQualityWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveConfig.mockResolvedValue(configResponse);
    startRun.mockResolvedValue(null);
    mockWorkspace();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the default preset in Table, Field and Relationship groups', () => {
    renderWorkspace();

    expect(screen.getByText('System preset')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Table checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Field checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Relationship checks' })).toBeInTheDocument();
    expect(screen.getByText('Target Data Mart is unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable Relationship integrity')).toBeDisabled();
    expect(screen.getByText('1 enabled')).toBeInTheDocument();
  });

  it('allows an enabled stale rule to be switched off without allowing it back on', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: {
          ...configResponse.effectiveConfig,
          rules: configResponse.effectiveConfig.rules.map(rule =>
            rule.scope.type === 'RELATIONSHIP' ? { ...rule, enabled: true } : rule
          ),
        },
      },
    });

    renderWorkspace();

    const toggle = screen.getByLabelText('Enable Relationship integrity');
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
  });

  it('uses Save & Run for dirty config and sends the complete unversioned replacement', async () => {
    const registerUnsavedGuard = vi.fn();
    renderWorkspace({ registerUnsavedGuard });

    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Europe/Kyiv' } });
    fireEvent.click(screen.getByLabelText('Enable Null rate'));
    fireEvent.change(screen.getByLabelText('Null rate threshold percent'), {
      target: { value: '3.5' },
    });

    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
    expect(registerUnsavedGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        changeLabel: 'Data Quality configuration',
        isDirty: expect.any(Function),
        save: expect.any(Function),
        discard: expect.any(Function),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledTimes(1);
    });
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'Europe/Kyiv',
        rules: expect.arrayContaining([
          expect.objectContaining({
            key: 'null_rate:field:email',
            enabled: true,
            parameters: { thresholdPercent: 3.5 },
          }),
        ]),
      })
    );
    expect(startRun.mock.calls[0]?.[0]).not.toHaveProperty('version');
    expect(startRun.mock.calls[0]?.[0].rules[0]).not.toHaveProperty('isApplicable');
  });

  it('runs without saving when the form is clean', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith();
    });
  });

  it('allows dirty Save & Run to resolve the saved ALL_DISABLED blocker', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: {
          ...configResponse.effectiveConfig,
          rules: configResponse.effectiveConfig.rules.map(rule => ({ ...rule, enabled: false })),
        },
        permissions: { canEdit: true, canRun: false },
        runEligibility: { eligible: false, code: 'NO_APPLICABLE_CHECKS', activeRunId: null },
      },
    });
    renderWorkspace();

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Enable Null rate'));

    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeEnabled();
  });

  it('disables editing and running according to API permissions', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        permissions: { canEdit: false, canRun: false },
      },
    });

    renderWorkspace();

    expect(screen.getByLabelText('Timezone')).toBeDisabled();
    expect(screen.getByLabelText('Enable Empty table')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getByText('You have read-only access to Data Quality.')).toBeInTheDocument();
  });

  it('renders all-disabled state returned by the latest run', () => {
    mockWorkspace({
      latestRun: {
        id: 'quality-run-1',
        dataMartRunId: 'run-1',
        summary: {
          state: 'ALL_DISABLED',
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
        },
        results: [],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: null,
        finishedAt: '2026-07-15T12:00:01.000Z',
      },
    });

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'All checks are disabled' })).toBeInTheDocument();
  });

  it('derives all-disabled before the first run from the effective config', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: {
          ...configResponse.effectiveConfig,
          rules: configResponse.effectiveConfig.rules.map(rule => ({ ...rule, enabled: false })),
        },
      },
    });

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'All checks are disabled' })).toBeInTheDocument();
    expect(screen.getByText('0 enabled')).toBeInTheDocument();
  });

  it('uses the compact Data Mart summary only as a fallback while latest is unavailable', () => {
    renderWorkspace({
      qualitySummary: {
        state: 'ISSUES',
        enabledChecks: 2,
        totalChecks: 2,
        passedChecks: 1,
        failedChecks: 1,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 1,
        errorFindings: 0,
        violationCount: 3,
        highestSeverity: 'warning',
        dataMartRunId: 'run-fallback',
        lastRunAt: '2026-07-15T10:00:00.000Z',
      },
    });

    expect(screen.getByRole('heading', { name: 'Quality issues found' })).toBeInTheDocument();
    expect(screen.getByText('3 violations')).toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it.each(['QUEUED', 'RUNNING'] as const)('prevents a second run while the latest is %s', state => {
    mockWorkspace({ latestRun: buildLatestRun(state) });

    renderWorkspace();

    expect(
      screen.getByRole('button', { name: state === 'QUEUED' ? 'Queued' : 'Running' })
    ).toBeDisabled();
    expect(screen.queryByText(/Last checked/)).not.toBeInTheDocument();
  });

  it('presents enabled but wholly non-applicable checks distinctly before the first run', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        permissions: { canEdit: true, canRun: false },
        runEligibility: {
          eligible: false,
          code: 'NO_APPLICABLE_CHECKS',
          activeRunId: null,
        },
        effectiveConfig: {
          ...configResponse.effectiveConfig,
          rules: configResponse.effectiveConfig.rules.map(rule => ({
            ...rule,
            enabled: true,
            isApplicable: false,
            notApplicableReason: 'Scope is unavailable',
          })),
        },
      },
    });

    renderWorkspace({
      qualitySummary: {
        state: 'NEVER_RUN',
        enabledChecks: configResponse.effectiveConfig.rules.length,
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
        dataMartRunId: null,
        lastRunAt: null,
      },
    });

    expect(screen.getByRole('heading', { name: 'No checks are applicable' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'All checks are disabled' })
    ).not.toBeInTheDocument();
  });

  it('renders the request error instead of an endless skeleton', () => {
    mockWorkspace({ configResponse: undefined, isError: true, isLoading: false });

    renderWorkspace();

    expect(screen.getByText('Unable to load Data Quality')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-loading')).not.toBeInTheDocument();
  });
});

function renderWorkspace({
  registerUnsavedGuard = vi.fn(),
  qualitySummary,
}: {
  registerUnsavedGuard?: ComponentProps<typeof DataQualityWorkspace>['registerUnsavedGuard'];
  qualitySummary?: DataQualityCompactSummary;
} = {}) {
  return render(
    <MemoryRouter>
      <DataQualityWorkspace
        projectId='project-1'
        dataMartId='mart-1'
        qualitySummary={qualitySummary}
        registerUnsavedGuard={registerUnsavedGuard}
      />
    </MemoryRouter>
  );
}

function buildLatestRun(state: 'QUEUED' | 'RUNNING') {
  return {
    id: 'quality-run-active',
    dataMartRunId: 'run-active',
    summary: {
      state,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
    },
    results: [],
    createdAt: '2026-07-15T12:00:00.000Z',
    startedAt: state === 'RUNNING' ? '2026-07-15T12:00:01.000Z' : null,
    finishedAt: null,
  };
}
