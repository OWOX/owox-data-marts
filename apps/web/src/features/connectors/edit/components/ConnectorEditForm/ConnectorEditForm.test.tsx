import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { ConnectorEditForm } from './ConnectorEditForm';
import { DataStorageType } from '../../../../data-storage';

interface RecordedProps {
  initialConfiguration?: Record<string, unknown>;
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
}

const { recorded } = vi.hoisted(() => ({ recorded: [] as RecordedProps[] }));

vi.mock('./steps', () => ({
  ConnectorSelectionStep: () => null,
  NodesSelectionStep: () => null,
  FieldsSelectionStep: () => null,
  TargetSetupStep: () => null,
  ConfigurationStep: (props: RecordedProps) => {
    recorded.push(props);
    return null;
  },
}));

vi.mock('./components', () => ({
  Stepper: () => null,
  StepNavigation: () => null,
  StepperHeroBlock: () => null,
  OpenIssueLink: () => null,
}));

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => ({
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
  }),
}));

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
    recorded.length = 0;
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
});
