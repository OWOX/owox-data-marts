// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityWorkspace } from './DataQualityWorkspace';
import type { DataQualityConfig, DataQualityConfigResponse } from '../model/types';
import { useDataQualityWorkspace } from '../model/use-data-quality-workspace';

vi.mock('../model/use-data-quality-workspace', () => ({
  useDataQualityWorkspace: vi.fn(),
}));

const configResponse: DataQualityConfigResponse = {
  savedConfig: null,
  source: 'DEFAULT',
  configRevision: 'a'.repeat(64),
  permissions: { canEdit: true, canRun: true },
  runEligibility: { eligible: true, code: null, activeRunId: null },
  relationships: [
    {
      id: 'rel-1',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    },
  ],
  effectiveConfig: {
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
        key: 'null_rate:field:["email"]',
        category: 'null_rate',
        scope: { type: 'FIELD', fieldPath: ['email'] },
        severity: 'warning',
        enabled: false,
        parameters: { thresholdPercent: 1 },
        isApplicable: true,
      },
      {
        key: 'column_uniqueness:field:["email"]',
        category: 'column_uniqueness',
        scope: { type: 'FIELD', fieldPath: ['email'] },
        severity: 'error',
        enabled: false,
        parameters: {},
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
const cancelRun = vi.fn();

function mockWorkspace(overrides: Record<string, unknown> = {}) {
  vi.mocked(useDataQualityWorkspace).mockReturnValue({
    configResponse,
    activeRun: null,
    latestRunOverview: null,
    latestRun: null,
    isLoading: false,
    isError: false,
    error: null,
    isResultsLoading: false,
    resultsError: null,
    isSaving: false,
    isStarting: false,
    isCancelling: false,
    saveConfig,
    startRun,
    cancelRun,
    ...overrides,
  } as ReturnType<typeof useDataQualityWorkspace>);
}

describe('DataQualityWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    saveConfig.mockImplementation(async (config: DataQualityConfig) => responseForConfig(config));
    startRun.mockResolvedValue(null);
    cancelRun.mockResolvedValue(undefined);
    mockWorkspace();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows Table, Field and Relationship groups', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Table checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Field checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Relationship checks' })).toBeInTheDocument();
    expect(screen.getByText('Target Data Mart is unavailable')).toBeInTheDocument();
    expect(screen.getByText('Relationship integrity · orders')).toBeInTheDocument();
    expect(screen.getByText('customer_id → id')).toBeInTheDocument();
    expect(screen.getByText('Relationship ID: rel-1')).toBeInTheDocument();
    const tableRule = screen.getByTestId('quality-rule-empty_table:data_mart');
    expect(tableRule.parentElement).toHaveClass('bg-background');
    expect(
      screen.getByTestId('quality-rule-relationship_integrity:relationship:rel-1').parentElement
    ).toHaveClass('bg-background');
    expect(screen.getByLabelText('Enable Relationship integrity · orders')).toBeDisabled();
    expect(screen.getByText('1 enabled')).toBeInTheDocument();
  });

  it('falls back to the relationship id when display metadata is unavailable', () => {
    mockWorkspace({ configResponse: { ...configResponse, relationships: [] } });

    renderWorkspace();

    expect(screen.getByText('Relationship ID: rel-1')).toBeInTheDocument();
    expect(screen.queryByText('orders')).not.toBeInTheDocument();
    expect(screen.queryByText('customer_id → id')).not.toBeInTheDocument();
  });

  it('hides disabled-only fields and offers Add checks as a separate action', () => {
    renderWorkspace();

    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enable Null rate')).not.toBeInTheDocument();
    expect(screen.getByText('No field checks are configured.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add checks' })).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: 'Select field' })).not.toBeInTheDocument();
  });

  it('requires a field and a check selection, then adds only that check', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
    expect(screen.getByRole('dialog', { name: 'Add field check' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search fields…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Enable Null rate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /email/ }));
    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Null rate/ }));

    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Enable Null rate')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable Null rate')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Enable Column uniqueness')).not.toBeInTheDocument();
    expect(screen.getAllByText('email')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
  });

  it('allows another hidden check to be added for a field already shown', async () => {
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    await addFieldCheck('email', 'Column uniqueness');

    const fieldPanel = screen.getByRole('region', { name: 'email' });
    expect(within(fieldPanel).getByLabelText('Enable Null rate')).toBeInTheDocument();
    expect(within(fieldPanel).getByLabelText('Enable Column uniqueness')).toBeInTheDocument();
    expect(within(fieldPanel).getByText('2 enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add checks' })).toBeDisabled();
  });

  it('preserves an unsaved draft when a background config refresh arrives', async () => {
    const view = renderWorkspace();
    await addFieldCheck('email', 'Null rate');
    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: withEmptyTableSeverity('warning'),
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
      expect(screen.getByLabelText('Severity for Empty table')).toHaveValue('error');
    });
  });

  it('adds a newly discovered rule to an existing dirty draft before saving', async () => {
    const view = renderWorkspace();
    fireEvent.change(screen.getByLabelText('Severity for Empty table'), {
      target: { value: 'warning' },
    });

    const newRule = {
      key: 'null_rate:field:["phone"]',
      category: 'null_rate' as const,
      scope: { type: 'FIELD' as const, fieldPath: ['phone'] },
      severity: 'warning' as const,
      enabled: false,
      parameters: { thresholdPercent: 0 },
      isApplicable: true,
    };
    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: {
          ...configResponse.effectiveConfig,
          rules: [...configResponse.effectiveConfig.rules, newRule],
        },
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await addFieldCheck('phone', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({
              key: newRule.key,
              enabled: true,
            }),
          ]),
        })
      );
    });
  });

  it('adopts a background config refresh while the draft is clean', async () => {
    const view = renderWorkspace();

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: withEmptyTableSeverity('warning'),
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Severity for Empty table')).toHaveValue('warning');
    });
  });

  it('hydrates the new Data Mart config even when the previous Data Mart draft is dirty', async () => {
    const view = renderWorkspace();
    await addFieldCheck('email', 'Null rate');

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: withEmptyTableSeverity('warning'),
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-2' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Severity for Empty table')).toHaveValue('warning');
      expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
    });
  });

  it('does not render or submit the previous Data Mart config before the new workspace hydrates', async () => {
    const registerUnsavedGuard = vi.fn();
    const view = renderWorkspace({ registerUnsavedGuard });
    await addFieldCheck('email', 'Null rate');

    mockWorkspace({ configResponse: undefined, isLoading: true });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-2' />
      </MemoryRouter>
    );

    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
    const currentRegistration = [...registerUnsavedGuard.mock.calls]
      .reverse()
      .find(([registration]) => registration !== null)?.[0];
    await currentRegistration?.save();
    expect(saveConfig).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it('adopts the normalized response after Save', async () => {
    saveConfig.mockResolvedValueOnce({
      ...withFieldRule({
        ...configResponse.effectiveConfig.rules[1],
        enabled: true,
        parameters: { thresholdPercent: 2 },
      }),
      source: 'SAVED',
    });
    renderWorkspace();
    await addFieldCheck('email', 'Null rate');
    fireEvent.change(screen.getByLabelText('Null rate threshold percent'), {
      target: { value: '3.5' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Null rate threshold percent')).toHaveValue(2);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });
  });

  it('starts dirty Save & Run with the revision returned by the successful save', async () => {
    const savedRevision = 'b'.repeat(64);
    const registerUnsavedGuard = vi.fn();
    saveConfig.mockImplementationOnce(async (submitted: DataQualityConfig) => {
      const response = responseForConfig(submitted);
      return {
        ...response,
        configRevision: savedRevision,
        effectiveConfig: {
          ...response.effectiveConfig,
          rules: response.effectiveConfig.rules.map(rule =>
            rule.key === 'null_rate:field:["email"]'
              ? { ...rule, parameters: { thresholdPercent: 2 } }
              : rule
          ),
        },
      };
    });
    renderWorkspace({ registerUnsavedGuard });
    await addFieldCheck('email', 'Null rate');
    fireEvent.change(screen.getByLabelText('Null rate threshold percent'), {
      target: { value: '3.5' },
    });
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
      expect(saveConfig).toHaveBeenCalledTimes(1);
      expect(startRun).toHaveBeenCalledWith(savedRevision);
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
      expect(screen.getByLabelText('Null rate threshold percent')).toHaveValue(2);
      expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({
            key: 'null_rate:field:["email"]',
            enabled: true,
            parameters: { thresholdPercent: 3.5 },
          }),
        ]),
      })
    );
    expect(saveConfig.mock.calls[0]?.[0].rules[0]).not.toHaveProperty('isApplicable');
    expect(saveConfig.mock.invocationCallOrder[0]).toBeLessThan(
      startRun.mock.invocationCallOrder[0]
    );
  });

  it('keeps the saved configuration and surfaces a stale-revision Run failure', async () => {
    const message = 'Data Quality configuration changed before the run could be queued';
    const toastError = vi.spyOn(toast, 'error');
    startRun.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: {
          code: 'DATA_QUALITY_CONFIG_REVISION_CONFLICT',
          message,
          path: '/api/data-marts/mart-1/data-quality/runs',
          statusCode: 409,
          timestamp: '2026-07-28T00:00:00.000Z',
        },
      },
    });
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledTimes(1);
      expect(startRun).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });
    expect(startRun).toHaveBeenCalledWith(configResponse.configRevision);
    expect(toastError).toHaveBeenCalledWith(
      `Configuration saved, but the quality run was not started: ${message}`
    );
  });

  it('retains an added field check when Save fails', async () => {
    saveConfig.mockRejectedValueOnce(new Error('save unavailable'));
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
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

    const toggle = screen.getByLabelText('Enable Relationship integrity · orders');
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
  });

  it('runs without saving when the form is clean', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith();
    });
  });

  it('keeps Run on the saved configuration while dirty edits use the floating Save & Run action', async () => {
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');

    expect(screen.getByText('Unsaved configuration changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith();
    });
  });

  it('allows dirty Save & Run to resolve the saved ALL_DISABLED blocker', async () => {
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
    expect(
      screen.getByLabelText('Run unavailable: Enable at least one applicable Data Quality check')
    ).toBeInTheDocument();
    await addFieldCheck('email', 'Null rate');

    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeEnabled();
  });

  it('keeps a field visible after its last check is disabled until Save', async () => {
    mockWorkspace({
      configResponse: withFieldRule({
        ...configResponse.effectiveConfig.rules[1],
        enabled: true,
      }),
    });
    renderWorkspace();

    const fieldPanel = screen.getByRole('region', { name: 'email' });
    expect(within(fieldPanel).getByText('1 enabled')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Enable Null rate'));

    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
    expect(within(fieldPanel).getByText('0 enabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
    });
  });

  it('restores the baseline and removes newly added checks on Discard', async () => {
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Enable Null rate')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('shows an enabled stale field so its last check can be disabled', () => {
    mockWorkspace({
      configResponse: withFieldRule({
        ...configResponse.effectiveConfig.rules[1],
        enabled: true,
        isApplicable: false,
        notApplicableReason: 'Field was removed',
      }),
    });
    renderWorkspace();

    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
    expect(screen.getByText('Field was removed')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Enable Null rate');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
  });

  it('gives field panels an accessible name when the field id contains whitespace', () => {
    mockWorkspace({
      configResponse: withFieldRule({
        ...configResponse.effectiveConfig.rules[1],
        key: 'null_rate:field:["customer email"]',
        scope: { type: 'FIELD', fieldPath: ['customer email'] },
        enabled: true,
      }),
    });
    renderWorkspace();

    expect(screen.getByRole('region', { name: 'customer email' })).toBeInTheDocument();
  });

  it('disables editing and running according to API permissions', () => {
    mockWorkspace({
      configResponse: {
        ...configResponse,
        permissions: { canEdit: false, canRun: false },
      },
    });

    renderWorkspace();

    expect(screen.getByLabelText('Enable Empty table')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add checks' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(
      screen.getByLabelText('Run unavailable: Editor access is required to run Data Quality checks')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have view-only access. You can browse the configuration and reports, but editing and running checks requires the Editor role.'
      )
    ).toBeInTheDocument();
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
    expect(screen.queryByText('0 enabled')).not.toBeInTheDocument();
  });

  it('prioritizes latest report problems and filters result cards without leaving the tab', () => {
    mockWorkspace({
      latestRun: {
        runId: 'quality-run-terminal',
        summary: {
          state: 'ISSUES',
          enabledChecks: 3,
          totalChecks: 3,
          passedChecks: 1,
          failedChecks: 1,
          notApplicableChecks: 0,
          errorChecks: 1,
          noticeFindings: 0,
          warningFindings: 1,
          errorFindings: 0,
          violationCount: 2,
          highestSeverity: 'warning',
        },
        results: [
          buildResult('passed-result', 'PASSED', 'error'),
          buildResult('failed-result', 'FAILED', 'warning'),
          buildResult('error-result', 'ERROR', 'error'),
        ],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: '2026-07-15T12:00:01.000Z',
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
    });

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Latest report' })).toBeInTheDocument();
    const reportCard = screen
      .getByRole('heading', { name: 'Latest report' })
      .closest('[data-slot="card"]');
    expect(reportCard).toContainElement(screen.getByLabelText('Filter check results'));
    const cards = screen.getAllByTestId(/quality-result-/);
    expect(cards.map(card => card.dataset.testid)).toEqual([
      'quality-result-error-result',
      'quality-result-failed-result',
      'quality-result-passed-result',
    ]);
    expect(screen.getByRole('link', { name: 'View in Run History' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/mart-1/run-history'
    );
    expect(screen.queryByRole('button', { name: 'Not applicable 0' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passed 1' }));

    expect(screen.getByTestId('quality-result-passed-result')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-result-error-result')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quality-result-failed-result')).not.toBeInTheDocument();
  });

  it('hides every zero-count result filter', () => {
    mockWorkspace({
      latestRun: {
        runId: 'quality-run-passed',
        summary: {
          state: 'PASSED',
          enabledChecks: 1,
          totalChecks: 1,
          passedChecks: 1,
          failedChecks: 0,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 0,
          errorFindings: 0,
          violationCount: 0,
          highestSeverity: null,
        },
        results: [buildResult('passed-result', 'PASSED', 'error')],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: '2026-07-15T12:00:01.000Z',
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
    });

    renderWorkspace();

    expect(screen.getByRole('button', { name: 'All 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passed 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Needs attention 0' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not applicable 0' })).not.toBeInTheDocument();
  });

  it('shows the relationship alias and join fields from the run snapshot in the latest report', () => {
    mockWorkspace({
      latestRun: {
        runId: 'quality-run-relationship',
        snapshot: {
          config: configResponse.effectiveConfig,
          schema: null,
          relationships: [
            {
              id: 'rel-1',
              sourceDataMartId: 'mart-1',
              targetDataMartId: 'mart-orders',
              targetAlias: 'orders',
              joinConditions: [
                { sourceFieldName: 'customer_id', targetFieldName: 'id' },
                { sourceFieldName: 'region_id', targetFieldName: 'region_id' },
              ],
            },
          ],
          definitionType: 'TABLE',
        },
        summary: {
          state: 'ISSUES',
          enabledChecks: 1,
          totalChecks: 1,
          passedChecks: 0,
          failedChecks: 1,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 1,
          errorFindings: 0,
          violationCount: 2,
          highestSeverity: 'warning',
        },
        results: [
          {
            id: 'relationship-result',
            ruleKey: 'relationship_integrity:relationship:rel-1',
            category: 'relationship_integrity',
            scope: { type: 'RELATIONSHIP', relationshipId: 'rel-1' },
            severity: 'warning',
            status: 'FAILED',
            violationCount: 2,
            description: 'Missing target rows',
            examples: [],
            sql: null,
            error: null,
            redacted: false,
          },
        ],
        createdAt: '2026-07-15T12:00:00.000Z',
        startedAt: '2026-07-15T12:00:01.000Z',
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
    });

    renderWorkspace();

    const resultCard = screen.getByTestId('quality-result-relationship-result');
    expect(within(resultCard).getByText('Relationship integrity · orders')).toBeInTheDocument();
    expect(
      within(resultCard).getByText('customer_id → id, region_id → region_id')
    ).toBeInTheDocument();
    expect(within(resultCard).getByText('Relationship ID: rel-1')).toBeInTheDocument();
  });

  it('remembers whether Checks configuration and Latest report are collapsed', () => {
    const activeRun = buildLatestRun('RUNNING');
    mockWorkspace({
      latestRun: {
        ...activeRun,
        summary: {
          ...activeRun.summary,
          state: 'ISSUES',
          failedChecks: 1,
          warningFindings: 1,
          violationCount: 2,
          highestSeverity: 'warning',
        },
        results: [buildResult('failed-result', 'FAILED', 'warning')],
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
    });

    const { unmount } = renderWorkspace();

    fireEvent.click(screen.getByText('Checks configuration'));
    fireEvent.click(screen.getByText('Latest report'));

    expect(localStorage.getItem('collapsed-card-data-quality-checks-configuration')).toBe('true');
    expect(localStorage.getItem('collapsed-card-data-quality-latest-report')).toBe('true');

    unmount();
    renderWorkspace();

    expect(getCollapsibleBody('Checks configuration')).toHaveClass('grid-rows-[0fr]');
    expect(getCollapsibleBody('Latest report')).toHaveClass('grid-rows-[0fr]');
  });

  it('offers cancellation while a run is active', () => {
    mockWorkspace({ activeRun: buildLatestRun('RUNNING') });

    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    expect(cancelRun).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Last checked/)).not.toBeInTheDocument();
  });

  it('keeps the last terminal report visible while a newer run is active', () => {
    mockWorkspace({
      activeRun: buildLatestRun('RUNNING'),
      latestRun: {
        ...buildLatestRun('RUNNING'),
        runId: 'run-terminal',
        summary: {
          ...buildLatestRun('RUNNING').summary,
          state: 'ISSUES',
          failedChecks: 1,
          warningFindings: 1,
          violationCount: 1,
          highestSeverity: 'warning',
        },
        results: [buildResult('terminal-result', 'FAILED', 'warning')],
        finishedAt: '2026-07-15T12:00:02.000Z',
      },
    });

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Running checks…' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Latest report' })).toBeInTheDocument();
    expect(screen.getByTestId('quality-result-terminal-result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeEnabled();
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

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'No checks are applicable' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'All checks are disabled' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`${String(configResponse.effectiveConfig.rules.length)} not applicable`)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`${String(configResponse.effectiveConfig.rules.length)} enabled`)
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
}: {
  registerUnsavedGuard?: ComponentProps<typeof DataQualityWorkspace>['registerUnsavedGuard'];
} = {}) {
  return render(
    <MemoryRouter>
      <DataQualityWorkspace
        projectId='project-1'
        dataMartId='mart-1'
        registerUnsavedGuard={registerUnsavedGuard}
      />
    </MemoryRouter>
  );
}

function getCollapsibleBody(title: string): Element {
  const card = screen.getByText(title).closest('[data-slot="card"]');
  const body = card?.children.item(1);
  if (!body) throw new Error(`Collapsible body for ${title} was not found`);
  return body;
}

async function addFieldCheck(fieldLabel: string, checkLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(fieldLabel) }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(checkLabel) }));
}

function withFieldRule(
  rule: DataQualityConfigResponse['effectiveConfig']['rules'][number]
): DataQualityConfigResponse {
  return {
    ...configResponse,
    effectiveConfig: {
      ...configResponse.effectiveConfig,
      rules: configResponse.effectiveConfig.rules.map(current =>
        current.key === 'null_rate:field:["email"]' ? rule : current
      ),
    },
  };
}

function withEmptyTableSeverity(
  severity: 'error' | 'warning' | 'notice'
): DataQualityConfigResponse['effectiveConfig'] {
  return {
    rules: configResponse.effectiveConfig.rules.map(rule =>
      rule.key === 'empty_table:data_mart' ? { ...rule, severity } : rule
    ),
  };
}

function responseForConfig(config: DataQualityConfig): DataQualityConfigResponse {
  const rulesByKey = new Map(config.rules.map(rule => [rule.key, rule]));
  return {
    ...configResponse,
    source: 'SAVED',
    savedConfig: config,
    effectiveConfig: {
      rules: configResponse.effectiveConfig.rules.map(rule => ({
        ...rule,
        ...rulesByKey.get(rule.key),
      })),
    },
  };
}

function buildLatestRun(state: 'QUEUED' | 'RUNNING') {
  return {
    runId: 'run-active',
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

function buildResult(
  id: string,
  status: 'PASSED' | 'FAILED' | 'ERROR',
  severity: 'error' | 'warning'
) {
  return {
    id,
    ruleKey: id,
    category: 'empty_table' as const,
    scope: { type: 'DATA_MART' as const },
    severity,
    status,
    violationCount: status === 'FAILED' ? 2 : 0,
    description: id,
    examples: [],
    sql: null,
    error: status === 'ERROR' ? { code: null, message: 'failed', details: null } : null,
    redacted: false,
  };
}
