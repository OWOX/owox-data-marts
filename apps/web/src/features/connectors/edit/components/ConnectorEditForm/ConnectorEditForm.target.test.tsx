import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorEditForm } from './ConnectorEditForm';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import type { ConnectorConfig } from '../../../../data-marts/edit/model/types';

interface SelectionProps {
  onConnectorSelect: (connector: ConnectorListItem) => void;
}
interface ConfigurationProps {
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
}
interface TargetProps {
  target: { fullyQualifiedName: string; isValid: boolean } | null;
  onTargetChange: (target: { fullyQualifiedName: string; isValid: boolean } | null) => void;
}
interface NavigationProps {
  onNext: () => void;
  onBack: () => void;
}
interface NodesProps {
  onFieldSelect: (fieldName: string) => void;
}

const { connectorHook, selection, configuration, targets, navigation, nodes } = vi.hoisted(() => ({
  connectorHook: { current: {} as Record<string, unknown> },
  selection: [] as SelectionProps[],
  configuration: [] as ConfigurationProps[],
  targets: [] as TargetProps[],
  navigation: [] as NavigationProps[],
  nodes: [] as NodesProps[],
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('./steps', () => ({
  ConnectorSelectionStep: (props: SelectionProps) => {
    selection.push(props);
    return null;
  },
  NodesSelectionStep: (props: NodesProps) => {
    nodes.push(props);
    return null;
  },
  FieldsSelectionStep: () => null,
  TargetSetupStep: (props: TargetProps) => {
    targets.push(props);
    return null;
  },
  ConfigurationStep: (props: ConfigurationProps) => {
    configuration.push(props);
    return null;
  },
}));

vi.mock('./components', () => ({
  Stepper: () => null,
  StepNavigation: (props: NavigationProps) => {
    navigation.push(props);
    return null;
  },
  StepperHeroBlock: () => null,
  OpenIssueLink: () => null,
}));

vi.mock('../../../../idp', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'user-1', projectId: 'project-1', roles: ['editor'] },
  }),
}));

vi.mock('../../../../../app/permissions', () => ({
  usePermissions: () => ({ canEdit: true }),
}));

vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => p }),
}));

vi.mock('../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => connectorHook.current,
}));

const googleSheets: ConnectorListItem = {
  name: 'GoogleSheets',
  displayName: 'Google Sheets',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const facebookAds: ConnectorListItem = {
  name: 'FacebookMarketing',
  displayName: 'Facebook Ads',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const facebookFields = [
  {
    name: 'insights',
    uniqueKeys: ['date'],
    defaultFields: ['date', 'spend'],
    fields: [
      { name: 'date', type: 'DATE' },
      { name: 'spend', type: 'NUMBER' },
    ],
  },
];

const previewFields = [
  {
    name: 'sheet',
    uniqueKeys: ['_owox_row_number'],
    defaultFields: ['_owox_row_number', 'Campaign'],
    fields: [
      { name: '_owox_row_number', type: 'NUMBER' },
      { name: 'Campaign', type: 'STRING' },
    ],
  },
];

function createHook() {
  const hook = {
    connectors: [googleSheets, facebookAds],
    connectorSpecification: [],
    connectorFields: null as typeof previewFields | null,
    loading: false,
    loadingSpecification: false,
    loadingFields: false,
    error: null,
    fetchAvailableConnectors: vi.fn(),
    fetchConnectorSpecification: vi.fn(),
    fetchConnectorFields: vi.fn().mockImplementation(async () => {
      hook.connectorFields = facebookFields as unknown as typeof previewFields;
    }),
    previewConnectorFields: vi.fn().mockImplementation(async () => {
      hook.connectorFields = previewFields;
      return previewFields;
    }),
  };
  return hook;
}

function renderForm(existingConnector: ConnectorConfig | null = null) {
  return render(
    <MemoryRouter>
      <ConnectorEditForm
        onSubmit={vi.fn()}
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        existingConnector={existingConnector}
      />
    </MemoryRouter>
  );
}

const last = <T,>(items: T[]) => items[items.length - 1];
const next = () =>
  act(async () => {
    last(navigation).onNext();
  });
const back = () =>
  act(async () => {
    last(navigation).onBack();
  });
const configure = (config: Record<string, unknown>) =>
  act(async () => {
    last(configuration).onConfigurationChange?.(config);
  });

async function reachTargetStep() {
  await next(); // step 2 → previews the sheet, step 3
  await next(); // step 3 → step 4
  await waitFor(() => {
    expect(targets.length).toBeGreaterThan(0);
  });
}

describe('ConnectorEditForm target reset', () => {
  beforeEach(() => {
    selection.length = 0;
    configuration.length = 0;
    targets.length = 0;
    navigation.length = 0;
    nodes.length = 0;
    connectorHook.current = createHook();
  });

  it('drops the seeded target when the sheet changes while creating a Data Mart', async () => {
    renderForm();
    act(() => {
      last(selection).onConnectorSelect(googleSheets);
    });
    await next(); // step 1 → step 2
    await configure({ SpreadsheetId: 'doc-1', SheetName: 'Plan' });
    await reachTargetStep();
    act(() => {
      last(targets).onTargetChange({
        fullyQualifiedName: 'google_sheets_owox.plan',
        isValid: true,
      });
    });

    await back(); // step 3
    await back(); // step 2
    await configure({ SpreadsheetId: 'doc-1', SheetName: 'Fact' });
    targets.length = 0;
    await reachTargetStep();

    expect(last(targets).target).toBeNull();
  });

  it('drops the seeded target when another connector is picked, and keeps it on a re-click', async () => {
    renderForm();
    act(() => {
      last(selection).onConnectorSelect(googleSheets);
    });
    await next();
    await configure({ SpreadsheetId: 'doc-1', SheetName: 'Plan' });
    await reachTargetStep();
    act(() => {
      last(targets).onTargetChange({
        fullyQualifiedName: 'google_sheets_owox.plan',
        isValid: true,
      });
    });

    await back();
    await back();
    await back(); // step 1
    act(() => {
      last(selection).onConnectorSelect(googleSheets); // same connector: nothing is lost
    });
    await next();
    targets.length = 0;
    await reachTargetStep();
    expect(last(targets).target?.fullyQualifiedName).toBe('google_sheets_owox.plan');

    await back();
    await back();
    await back();
    act(() => {
      last(selection).onConnectorSelect(facebookAds);
    });
    expect(connectorHook.current.fetchConnectorSpecification).toHaveBeenCalled();
    // The target the user had is gone with the connector. A non-Google-Sheets wizard has
    // five steps (nodes and fields are mocked away), so the target step is the fifth.
    targets.length = 0;
    await next(); // step 2: configuration
    await next(); // step 3: nodes
    await waitFor(() => {
      expect(nodes.length).toBeGreaterThan(0);
    });
    act(() => {
      last(nodes).onFieldSelect('insights');
    });
    await next(); // step 4: fields
    await next(); // step 5: target
    await waitFor(() => {
      expect(targets.length).toBeGreaterThan(0);
    });
    expect(last(targets).target).toBeNull();
  });

  it('never clears the saved target while editing an existing Google Sheets Data Mart', async () => {
    const existing: ConnectorConfig = {
      source: {
        name: 'GoogleSheets',
        configuration: [{ SpreadsheetId: 'doc-1', SheetName: 'Plan' }],
        node: 'sheet',
        fields: ['_owox_row_number', 'Campaign'],
      },
      storage: { fullyQualifiedName: 'google_sheets_owox.saved_plan' },
    };
    renderForm(existing);
    await next(); // the wizard still opens on the connector step; step 2 is the configuration
    await waitFor(() => {
      expect(configuration.length).toBeGreaterThan(0);
    });

    await configure({ SpreadsheetId: 'doc-1', SheetName: 'Fact' });
    await reachTargetStep();

    expect(last(targets).target?.fullyQualifiedName).toBe('google_sheets_owox.saved_plan');
  });
});
