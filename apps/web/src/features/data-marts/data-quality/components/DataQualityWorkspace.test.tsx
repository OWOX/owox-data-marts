// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataQualityWorkspace } from './DataQualityWorkspace';
import type {
  DataQualityCompactSummary,
  DataQualityConfig,
  DataQualityConfigResponse,
} from '../model/types';
import { useDataQualityWorkspace } from '../model/use-data-quality-workspace';

vi.mock('../model/use-data-quality-workspace', () => ({
  useDataQualityWorkspace: vi.fn(),
}));

const configResponse: DataQualityConfigResponse = {
  savedConfig: null,
  source: 'DEFAULT',
  permissions: { canEdit: true, canRun: true },
  runEligibility: { eligible: true, code: null, activeRunId: null },
  availableChecks: ['empty_table', 'null_rate', 'column_uniqueness', 'relationship_integrity'],
  relationships: [
    {
      id: 'rel-1',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    },
  ],
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
        key: 'column_uniqueness:field:email',
        category: 'column_uniqueness',
        scope: { type: 'FIELD', fieldId: 'email' },
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
    saveConfig.mockImplementation(async (config: DataQualityConfig) => responseForConfig(config));
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
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('customer_id → id')).toBeInTheDocument();
    expect(screen.getByText('Relationship ID: rel-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable Relationship integrity')).toBeDisabled();
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
    const fieldPicker = screen.getByRole('combobox', { name: 'Select field' });
    const checkPicker = screen.getByRole('combobox', { name: 'Select check' });
    expect(fieldPicker).toBeInTheDocument();
    expect(checkPicker).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.queryByLabelText('Enable Null rate')).not.toBeInTheDocument();

    fireEvent.click(fieldPicker);
    fireEvent.click(screen.getByRole('option', { name: 'email' }));
    expect(screen.queryByRole('region', { name: 'email' })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Select check' }));
    fireEvent.click(screen.getByRole('option', { name: 'Null rate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

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

  it('keeps an added check after a successful Save', async () => {
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
    });
  });

  it('keeps an added check after a successful Save & Run', async () => {
    renderWorkspace();

    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
    });
  });

  it('preserves an unsaved draft when a background config refresh arrives', async () => {
    const view = renderWorkspace();
    await addFieldCheck('email', 'Null rate');
    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: { ...configResponse.effectiveConfig, timezone: 'Europe/Kyiv' },
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
      expect(screen.getByLabelText('Timezone')).toHaveValue('UTC');
    });
  });

  it('adopts a background config refresh while the draft is clean', async () => {
    const view = renderWorkspace();

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: { ...configResponse.effectiveConfig, timezone: 'Europe/Kyiv' },
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Kyiv');
    });
  });

  it('hydrates the new Data Mart config even when the previous Data Mart draft is dirty', async () => {
    const view = renderWorkspace();
    await addFieldCheck('email', 'Null rate');

    mockWorkspace({
      configResponse: {
        ...configResponse,
        effectiveConfig: { ...configResponse.effectiveConfig, timezone: 'Europe/Kyiv' },
      },
    });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-2' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Kyiv');
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

    expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();
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

  it('ignores only the stale pre-save config, then adopts the first legitimate Save & Run response', async () => {
    let resolveStartRun: (value: null) => void = () => undefined;
    startRun.mockReturnValueOnce(
      new Promise<null>(resolve => {
        resolveStartRun = resolve;
      })
    );
    const view = renderWorkspace();
    await addFieldCheck('email', 'Null rate');
    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    mockWorkspace({ configResponse: { ...configResponse }, isStarting: true });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );
    expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();

    await act(async () => {
      resolveStartRun(null);
      await Promise.resolve();
    });

    // The response that was current before submission is the only known-stale value.
    mockWorkspace({ configResponse: { ...configResponse }, isStarting: false });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'email' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });

    const submitted = startRun.mock.calls[0]?.[0] as DataQualityConfig;
    const discoveredDisabledRule = {
      ...configResponse.effectiveConfig.rules[2],
      key: 'column_uniqueness:field:new_field',
      scope: { type: 'FIELD' as const, fieldId: 'new_field' },
      enabled: false,
    };
    const legitimateResponse: DataQualityConfigResponse = {
      ...responseForConfig(submitted),
      effectiveConfig: {
        ...responseForConfig(submitted).effectiveConfig,
        rules: [
          ...responseForConfig(submitted).effectiveConfig.rules.map(rule =>
            rule.key === 'null_rate:field:email'
              ? { ...rule, parameters: { thresholdPercent: 2 } }
              : rule
          ),
          discoveredDisabledRule,
        ],
      },
    };
    mockWorkspace({ configResponse: legitimateResponse, isStarting: false });
    view.rerender(
      <MemoryRouter>
        <DataQualityWorkspace projectId='project-1' dataMartId='mart-1' />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Null rate threshold percent')).toHaveValue(2);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });
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
    await addFieldCheck('email', 'Null rate');
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
        key: 'null_rate:field:customer email',
        scope: { type: 'FIELD', fieldId: 'customer email' },
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

    expect(screen.getByLabelText('Timezone')).toBeDisabled();
    expect(screen.getByLabelText('Enable Empty table')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add checks' })).toBeDisabled();
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

async function addFieldCheck(fieldId: string, checkLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Select field' }));
  fireEvent.click(screen.getByRole('option', { name: fieldId }));
  fireEvent.click(await screen.findByRole('combobox', { name: 'Select check' }));
  fireEvent.click(screen.getByRole('option', { name: checkLabel }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
}

function withFieldRule(
  rule: DataQualityConfigResponse['effectiveConfig']['rules'][number]
): DataQualityConfigResponse {
  return {
    ...configResponse,
    effectiveConfig: {
      ...configResponse.effectiveConfig,
      rules: configResponse.effectiveConfig.rules.map(current =>
        current.key === 'null_rate:field:email' ? rule : current
      ),
    },
  };
}

function responseForConfig(config: DataQualityConfig): DataQualityConfigResponse {
  const rulesByKey = new Map(config.rules.map(rule => [rule.key, rule]));
  return {
    ...configResponse,
    source: 'SAVED',
    savedConfig: config,
    effectiveConfig: {
      timezone: config.timezone,
      rules: configResponse.effectiveConfig.rules.map(rule => ({
        ...rule,
        ...rulesByKey.get(rule.key),
      })),
    },
  };
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
