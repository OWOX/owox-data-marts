import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { ConnectorEditForm } from './ConnectorEditForm';
import { DataStorageType } from '../../../../data-storage';

interface RecordedProps {
  initialConfiguration?: Record<string, unknown>;
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
}

interface RecordedFieldsProps {
  selectedFields: string[];
  onFieldToggle: (fieldName: string, isChecked: boolean) => void;
}

interface RecordedNavigationProps {
  canGoNext: boolean;
  onNext: () => void;
}

const { connectorHook, recorded, recordedFields, recordedNavigation, toastError } = vi.hoisted(
  () => ({
    connectorHook: { current: {} as Record<string, unknown> },
    recorded: [] as RecordedProps[],
    recordedFields: [] as RecordedFieldsProps[],
    recordedNavigation: [] as RecordedNavigationProps[],
    toastError: vi.fn(),
  })
);

vi.mock('react-hot-toast', () => ({
  toast: { error: toastError },
}));

vi.mock('./steps', () => ({
  ConnectorSelectionStep: () => null,
  NodesSelectionStep: () => null,
  FieldsSelectionStep: (props: RecordedFieldsProps) => {
    recordedFields.push(props);
    return null;
  },
  TargetSetupStep: () => null,
  ConfigurationStep: (props: RecordedProps) => {
    recorded.push(props);
    return null;
  },
}));

vi.mock('./components', () => ({
  Stepper: () => null,
  StepNavigation: (props: RecordedNavigationProps) => {
    recordedNavigation.push(props);
    return null;
  },
  StepperHeroBlock: () => null,
  OpenIssueLink: () => null,
}));

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => connectorHook.current,
}));

const createGoogleAdsConnectorHook = () => ({
  connectors: [
    {
      name: 'GoogleAds',
      displayName: 'Google Ads',
      description: '',
      logoBase64: null,
      docUrl: null,
    },
  ],
  connectorSpecification: [{ name: 'CustomerId', requiredType: 'string', required: true }],
  connectorFields: null,
  loading: false,
  loadingSpecification: false,
  loadingFields: false,
  error: null,
  fetchAvailableConnectors: vi.fn(),
  fetchConnectorSpecification: vi.fn(),
  fetchConnectorFields: vi.fn(),
  previewConnectorFields: vi.fn(),
});

const createGoogleSheetsConnectorHook = () => {
  const previewFields = [
    {
      name: 'sheet',
      uniqueKeys: ['_owox_row_number'],
      defaultFields: ['_owox_row_number', 'Campaign', 'Spend'],
      fields: [
        { name: '_owox_row_number', type: 'NUMBER' },
        { name: 'Campaign', type: 'STRING' },
        { name: 'Spend', type: 'NUMBER' },
      ],
    },
  ];

  const hook = {
    connectors: [
      {
        name: 'GoogleSheets',
        displayName: 'Google Sheets',
        description: '',
        logoBase64: null,
        docUrl: null,
      },
    ],
    connectorSpecification: [],
    connectorFields: null as typeof previewFields | null,
    loading: false,
    loadingSpecification: false,
    loadingFields: false,
    error: null,
    fetchAvailableConnectors: vi.fn(),
    fetchConnectorSpecification: vi.fn(),
    fetchConnectorFields: vi.fn(),
    previewConnectorFields: vi.fn().mockImplementation(async () => {
      hook.connectorFields = previewFields;
      return previewFields;
    }),
  };

  return hook;
};

function renderForm() {
  return render(
    <ConnectorEditForm
      onSubmit={vi.fn()}
      dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
      configurationOnly
    />
  );
}

const lastProps = () => recorded[recorded.length - 1];

describe('ConnectorEditForm configuration echo', () => {
  beforeEach(() => {
    connectorHook.current = createGoogleAdsConnectorHook();
    recorded.length = 0;
    recordedFields.length = 0;
    recordedNavigation.length = 0;
    toastError.mockReset();
  });

  // ConfigurationStep tells its own echo apart from a genuine outside change by
  // comparing references (its `lastEchoedConfigRef`). Cloning the configuration here
  // would silently reintroduce the dropped-character bug, so pin the contract.
  it('passes the reported configuration object back by reference', () => {
    renderForm();

    const onConfigurationChange = lastProps().onConfigurationChange;
    expect(onConfigurationChange).toBeTypeOf('function');

    const reported = { CustomerId: 'ABC' };
    act(() => {
      onConfigurationChange?.(reported);
    });

    expect(
      lastProps().initialConfiguration,
      'initialConfiguration must be the very object reported by ConfigurationStep. A clone ' +
        "here (equal contents, new reference) breaks that step's echo guard and drops " +
        'typed characters.'
    ).toBe(reported);
  });

  it('keeps passing the same reference across repeated reports', () => {
    renderForm();

    const first = { CustomerId: 'A' };
    act(() => {
      lastProps().onConfigurationChange?.(first);
    });
    expect(lastProps().initialConfiguration).toBe(first);

    const second = { CustomerId: 'AB' };
    act(() => {
      lastProps().onConfigurationChange?.(second);
    });
    expect(lastProps().initialConfiguration).toBe(second);
  });

  it('keeps Next enabled after deselecting a Google Sheets column', async () => {
    connectorHook.current = createGoogleSheetsConnectorHook();
    renderForm();

    await act(async () => {
      recordedNavigation.at(-1)?.onNext();
    });

    await waitFor(() => {
      expect(recordedNavigation.at(-1)?.canGoNext).toBe(true);
      expect(recordedFields.at(-1)?.selectedFields).toContain('Spend');
    });

    act(() => {
      recordedFields.at(-1)?.onFieldToggle('Spend', false);
    });

    expect(recordedFields.at(-1)?.selectedFields).not.toContain('Spend');
    expect(recordedNavigation.at(-1)?.canGoNext).toBe(true);
  });

  it('shows Google Sheets preview server errors in the configuration wizard', async () => {
    const hook = createGoogleSheetsConnectorHook();
    hook.previewConnectorFields.mockRejectedValue({
      response: {
        status: 502,
        data: { message: 'Connector provider is temporarily unavailable' },
      },
    });
    connectorHook.current = hook;
    renderForm();
    renderForm();

    await act(async () => {
      recordedNavigation.at(-1)?.onNext();
    });

    expect(toastError).toHaveBeenCalledWith('Connector provider is temporarily unavailable');
  });
});
