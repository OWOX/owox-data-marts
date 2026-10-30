import { useContext, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigurationStep } from './ConfigurationStep';
import type { ConnectorSpecificationResponseApiDto } from '../../../../shared/api';
import { ConnectorApiService, RequiredType } from '../../../../shared/api';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import {
  ConnectPickedSpreadsheetContext,
  type CredentialConfigSheetProps,
} from '../../../../../credentials';
import { DataMartContext } from '../../../../../data-marts/edit/model/context/context';

vi.mock('../../../../../../utils', () => ({ trackEvent: vi.fn() }));

const oauthMocks = vi.hoisted(() => ({
  exchangeCredentials: vi.fn(),
  checkStatus: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../../../../shared/model/hooks/useOAuth', () => ({
  useOAuth: () => oauthMocks,
}));

const credentialsState = vi.hoisted(() => ({
  credentials: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const definitionsState = vi.hoisted(() => ({
  definitions: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('../../../../../credentials/useCredentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../credentials/useCredentials')>()),
  useCredentials: () => credentialsState,
  useCredentialDefinitions: () => definitionsState,
}));

const sheet = vi.hoisted(() => ({
  props: null as null | CredentialConfigSheetProps,
  // What a Source Connect inside the sheet hands its picked spreadsheet to.
  pickSpreadsheet: null as null | ((credentialId: string, spreadsheetId: string) => void),
}));
vi.mock('../../../../../credentials/components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: (props: CredentialConfigSheetProps) => {
    sheet.props = props;
    sheet.pickSpreadsheet = useContext(ConnectPickedSpreadsheetContext);
    return null;
  },
}));

const builderApi = vi.hoisted(() => ({
  credentialRequirement: vi.fn(),
  fittingCredentials: vi.fn(),
}));
vi.mock('../../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    credentialRequirement = builderApi.credentialRequirement;
    fittingCredentials = builderApi.fittingCredentials;
  },
}));

const definitions = [
  { id: 'source:GoogleAds:oauth2', displayName: 'Google Ads', connectors: ['GoogleAds'] },
  {
    id: 'source:GoogleAds:service_account',
    displayName: 'Google Ads service account',
    connectors: ['GoogleAds'],
  },
  {
    id: 'source:FacebookMarketing:oauth2',
    displayName: 'Facebook Ads',
    connectors: ['FacebookMarketing'],
  },
  { id: 'github', displayName: 'GitHub', connectors: ['GitHub'] },
  {
    id: 'source:GoogleSheets:oauth2',
    displayName: 'Sheets Source Google account',
    connectors: ['GoogleSheets'],
  },
  {
    id: 'google-service-account',
    displayName: 'Google Service Account',
    connectors: ['GoogleSheets'],
  },
  {
    id: 'custom-connector',
    displayName: 'Custom connector',
    connectors: [],
    auth: { type: 'custom-connector' },
  },
];

function credential(id: string, definitionId: string, title = id) {
  return {
    id,
    title,
    definition: definitions.find(definition => definition.id === definitionId),
    enabled: true,
    canUse: true,
    identity: null,
  };
}

/** Renders inside the Data Mart the configuration belongs to, as the Data Setup page does. */
function inDataMart(ui: ReactNode, sourceCredentials: unknown[] = []) {
  return (
    <MemoryRouter>
      <DataMartContext.Provider value={{ dataMart: { id: 'dm-1', sourceCredentials } } as never}>
        {ui}
      </DataMartContext.Provider>
    </MemoryRouter>
  );
}

async function openCredentialOptions() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
  return (await within(document.body).findAllByRole('option')).map(option => option.textContent);
}

async function selectCredential(title: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
  // An option also names the provider after the title.
  fireEvent.click(
    await within(document.body).findByRole('option', { name: new RegExp(`^${title}`) })
  );
}

beforeEach(() => {
  credentialsState.credentials = [];
  definitionsState.definitions = definitions;
  sheet.props = null;
  sheet.pickSpreadsheet = null;
  builderApi.credentialRequirement.mockReset();
  builderApi.fittingCredentials.mockReset();
});

const connector = {
  name: 'GoogleAds',
  displayName: 'Google Ads',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const spec: ConnectorSpecificationResponseApiDto[] = [
  {
    name: 'CustomerId',
    title: 'Customer ID',
    requiredType: RequiredType.STRING,
    required: true,
  },
  {
    // Not AuthType: a Credential replaces that one, and these tests type into the nested field.
    name: 'Mode',
    title: 'Mode',
    requiredType: RequiredType.OBJECT,
    required: true,
    oneOf: [
      {
        label: 'Service Account',
        value: 'service_account',
        requiredType: RequiredType.OBJECT,
        items: {
          ServiceAccountKey: {
            name: 'ServiceAccountKey',
            title: 'Service Account Key',
            requiredType: RequiredType.STRING,
            required: true,
            attributes: ['SECRET'],
          },
        },
      },
    ],
  },
];

/**
 * Mimics ConnectorEditForm: stores the reported configuration by reference and
 * hands that same object straight back as `initialConfiguration`.
 */
function Harness() {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  return (
    <ConfigurationStep
      connector={connector}
      connectorSpecification={spec}
      initialConfiguration={configuration}
      onConfigurationChange={setConfiguration}
    />
  );
}

/** Types one character the way a browser does: append to the current DOM value. */
function typeChar(input: HTMLInputElement, char: string) {
  fireEvent.change(input, { target: { value: input.value + char } });
}

describe('ConfigurationStep', () => {
  // The two typing tests below are smoke coverage for controlled-input wiring, not
  // regression cover for the parent/child echo race. Verified by reverting the echo
  // guard in ConfigurationStep: they still pass. `fireEvent` wraps every event in
  // `act()`, which flushes effects to completion between keystrokes, so the prop can
  // never be staler than local state and the race cannot occur here. The echo contract
  // is pinned by reference in ConnectorEditForm.test.tsx instead.
  it('keeps every typed character in a top-level field', () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>(/Customer ID/i);

    for (const char of 'ABCDEFGH') {
      typeChar(input, char);
    }

    expect(input.value).toBe('ABCDEFGH');
  });

  it('keeps every typed character in a nested oneOf secret field', () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>(/Service Account Key/i);

    for (const char of 'ABCDEFGH') {
      typeChar(input, char);
    }

    expect(input.value).toBe('ABCDEFGH');
  });

  // Real regression cover: verified to fail when `isSecret` is made value-derived again.
  // `isSecret` must come from the spec alone. Deriving it from the value flipped it on
  // the first keystroke, which swapped ConfigurationStringField for
  // ConfigurationSecretField, remounted the input and dropped focus.
  it('renders a nested secret field as the same element across the first keystroke', () => {
    render(<Harness />);
    const before = screen.getByLabelText<HTMLInputElement>(/Service Account Key/i);
    before.focus();
    expect(document.activeElement).toBe(before);

    typeChar(before, 'A');

    const after = screen.getByLabelText(/Service Account Key/i);
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
  });
});

const googleSheetsConnector = {
  name: 'GoogleSheets',
  displayName: 'Google Sheets',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const connectorSpecification = [
  {
    name: 'SheetName',
    title: 'Sheet Name',
    requiredType: RequiredType.STRING,
    required: true,
  },
];

function ConfigurationHarness() {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});

  return (
    <MemoryRouter>
      <button
        type='button'
        onClick={() => {
          setConfiguration({ SheetName: 'External Sheet' });
        }}
      >
        Apply external configuration
      </button>
      <ConfigurationStep
        connector={googleSheetsConnector}
        connectorSpecification={connectorSpecification}
        initialConfiguration={configuration}
        onConfigurationChange={setConfiguration}
      />
    </MemoryRouter>
  );
}

describe('ConfigurationStep state synchronization', () => {
  it('still applies genuine external configuration changes', () => {
    render(<ConfigurationHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply external configuration' }));

    expect(screen.getByRole('textbox', { name: 'Sheet Name *' })).toHaveValue('External Sheet');
  });

  it('does not emit initial configuration back as a user edit', () => {
    const onConfigurationChange = vi.fn();

    render(
      <MemoryRouter>
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={connectorSpecification}
          initialConfiguration={{ SheetName: 'Existing Sheet' }}
          onConfigurationChange={onConfigurationChange}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('textbox', { name: 'Sheet Name *' })).toHaveValue('Existing Sheet');
    expect(onConfigurationChange).not.toHaveBeenCalled();
  });
});

describe('ConfigurationStep Google Sheets OAuth fields', () => {
  const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/sheet-1/edit';
  const oauthSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'AuthType',
      title: 'Auth Type',
      requiredType: RequiredType.OBJECT,
      required: true,
      oneOf: [
        {
          label: 'OAuth2',
          value: 'oauth2',
          requiredType: RequiredType.OBJECT,
          attributes: ['OAUTH_FLOW'],
          items: {
            RefreshToken: {
              name: 'RefreshToken',
              title: 'Refresh Token',
              requiredType: RequiredType.STRING,
              required: true,
            },
          },
        },
      ],
    },
    {
      name: 'SpreadsheetId',
      title: 'Spreadsheet ID or URL',
      requiredType: RequiredType.STRING,
      required: true,
    },
  ];

  it('shows a configuration still on its old OAuth key read-only, with its spreadsheet', async () => {
    oauthMocks.getSettings.mockResolvedValue({
      isEnabled: true,
      vars: {
        ClientId: 'client-id',
        RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        PickerApiKey: 'picker-key',
        ProjectNumber: '123456789',
      },
    });
    oauthMocks.checkStatus.mockResolvedValue({
      valid: true,
      user: { id: 'user-1', name: 'analyst@example.com', email: 'analyst@example.com' },
    });

    render(
      inDataMart(
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={oauthSpecification}
          initialConfiguration={{
            _id: 'cfg-1',
            AuthType: { oauth2: { _source_credential_id: 'credential-1' } },
            SpreadsheetId: spreadsheetUrl,
          }}
          isEditingExisting
        />
      )
    );

    expect(await screen.findByRole('link', { name: spreadsheetUrl })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change spreadsheet' })).toBeDisabled();
    expect(screen.getByText('Uses its own key until you select a Credential')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).not.toBeInTheDocument();
  });
});

describe('ConfigurationStep dynamic field options', () => {
  const dynamicSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'SpreadsheetId',
      title: 'Spreadsheet ID or URL',
      requiredType: RequiredType.STRING,
      required: true,
    },
    {
      name: 'SheetName',
      title: 'Sheet Name',
      requiredType: RequiredType.STRING,
      required: true,
      attributes: ['DYNAMIC_OPTIONS'],
      optionsDependsOn: ['SpreadsheetId'],
    },
  ];
  const sheets = [
    { value: 'Summary', label: 'Summary' },
    { value: 'Data', label: 'Data' },
  ];

  function DynamicHarness({
    initial,
    onChange,
  }: {
    initial: Record<string, unknown>;
    onChange: (configuration: Record<string, unknown>) => void;
  }) {
    const [configuration, setConfiguration] = useState<Record<string, unknown>>(initial);
    return (
      <ConfigurationStep
        connector={googleSheetsConnector}
        connectorSpecification={dynamicSpecification}
        initialConfiguration={configuration}
        onConfigurationChange={next => {
          setConfiguration(next);
          onChange(next);
        }}
      />
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the sheet tabs once the spreadsheet is known', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue(sheets);
    const onChange = vi.fn();

    render(
      <MemoryRouter>
        <DynamicHarness initial={{}} onChange={onChange} />
      </MemoryRouter>
    );

    // The label names the combobox, required marker included, like any other field.
    const combobox = await screen.findByRole('combobox', { name: 'Sheet Name *' });
    expect(combobox).toBeDisabled();
    expect(combobox).toHaveTextContent('Complete the settings above to load sheet names');
    expect(previewSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Spreadsheet ID or URL *' }), {
      target: { value: 'sheet-1' },
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sheet Name *' })).toBeEnabled();
    });
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SheetName',
      expect.objectContaining({ SpreadsheetId: 'sheet-1' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      undefined
    );
  });

  it('keeps a stored sheet name visible while the tabs load and once it is confirmed', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockResolvedValue(
      sheets
    );
    const onChange = vi.fn();

    render(
      <MemoryRouter>
        <DynamicHarness
          initial={{ SpreadsheetId: 'sheet-1', SheetName: 'Data' }}
          onChange={onChange}
        />
      </MemoryRouter>
    );

    // Still loading: the value must not be replaced by a placeholder.
    const combobox = await screen.findByRole('combobox', { name: 'Sheet Name *' });
    expect(combobox).toHaveTextContent('Data');

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Sheet Name *' })).toBeEnabled();
    });
    expect(screen.getByRole('combobox', { name: 'Sheet Name *' })).toHaveTextContent('Data');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Opening a valid configuration is not an edit.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('flags a sheet name that no longer exists instead of clearing it', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockResolvedValue(
      sheets
    );
    const onChange = vi.fn();

    render(
      <MemoryRouter>
        <DynamicHarness
          initial={{ SpreadsheetId: 'sheet-1', SheetName: 'Old tab' }}
          onChange={onChange}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"Old tab" was not found among the available sheet names'
    );
    expect(screen.getByRole('combobox', { name: 'Sheet Name *' })).toHaveTextContent('Old tab');
    expect(screen.getByRole('combobox', { name: 'Sheet Name *' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    // The user did not change anything, so the form must not become dirty.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to a text input when the tabs cannot be loaded', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockRejectedValue(
      new Error('Google Sheets access denied')
    );
    const onChange = vi.fn();

    render(
      <MemoryRouter>
        <DynamicHarness initial={{ SpreadsheetId: 'sheet-1' }} onChange={onChange} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('textbox', { name: 'Sheet Name *' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Google Sheets access denied');

    fireEvent.change(screen.getByRole('textbox', { name: 'Sheet Name *' }), {
      target: { value: 'Typed tab' },
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ SheetName: 'Typed tab' }));
    });
  });
});

describe('ConfigurationStep Google Sheets Credential', () => {
  const freshSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'AuthType',
      title: 'Auth Type',
      requiredType: RequiredType.OBJECT,
      required: true,
      oneOf: [
        {
          label: 'OAuth2',
          value: 'oauth2',
          requiredType: RequiredType.OBJECT,
          attributes: ['OAUTH_FLOW'],
          items: {
            RefreshToken: {
              name: 'RefreshToken',
              title: 'Refresh Token',
              requiredType: RequiredType.STRING,
              required: true,
            },
          },
        },
        {
          label: 'Service Account',
          value: 'service_account',
          requiredType: RequiredType.OBJECT,
          items: {
            ServiceAccountKey: {
              name: 'ServiceAccountKey',
              title: 'Service Account Key',
              requiredType: RequiredType.STRING,
              required: true,
              attributes: ['SECRET'],
            },
          },
        },
      ],
    },
    {
      name: 'SpreadsheetId',
      title: 'Spreadsheet ID or URL',
      requiredType: RequiredType.STRING,
      required: true,
      attributes: ['DYNAMIC_OPTIONS'],
      optionsDependsOn: ['AuthType'],
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    oauthMocks.getSettings.mockResolvedValue({
      isEnabled: true,
      vars: {
        ClientId: 'client-id',
        RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        PickerApiKey: 'picker-key',
        ProjectNumber: '123456789',
      },
    });
    oauthMocks.checkStatus.mockResolvedValue({
      valid: true,
      user: { id: 'user-2', name: 'owner@example.com', email: 'owner@example.com' },
    });
    credentialsState.credentials = [
      credential('sheets-oauth', 'source:GoogleSheets:oauth2', 'Marketing sheets'),
      credential('sheets-sa', 'google-service-account', 'Reporting robot'),
    ];
  });

  function renderNewSheets(onConfigurationChange = vi.fn()) {
    function Harness() {
      const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
      return (
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={freshSpecification}
          initialConfiguration={configuration}
          onConfigurationChange={next => {
            setConfiguration(next);
            onConfigurationChange(next);
          }}
        />
      );
    }
    render(inDataMart(<Harness />));
    return onConfigurationChange;
  }

  it('asks for a Credential before the spreadsheet, with no sign-in of its own', async () => {
    const onConfigurationChange = renderNewSheets();

    expect(await screen.findByRole('combobox', { name: 'Credential' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).not.toBeInTheDocument();
    // Seeded defaults are not reported as a user change; the first real edit is.
    expect(onConfigurationChange).not.toHaveBeenCalled();

    await selectCredential('Reporting robot');

    expect(
      await screen.findByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).toBeInTheDocument();
    expect(onConfigurationChange).toHaveBeenLastCalledWith({
      AuthType: { service_account: {} },
      _credential_id: 'sheets-sa',
    });
  });

  it('a Sheets Source Google account Credential lists the spreadsheets it can open', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue([
        { value: 'sheet-1', label: 'Goals' },
        { value: 'sheet-2', label: 'Budget' },
      ]);
    const onConfigurationChange = renderNewSheets();

    await selectCredential('Marketing sheets');

    const combobox = await screen.findByRole('combobox', { name: 'Spreadsheet ID or URL *' });
    await waitFor(() => {
      expect(combobox).toBeEnabled();
    });
    expect(previewSpy).toHaveBeenCalledWith(
      'GoogleSheets',
      'SpreadsheetId',
      expect.objectContaining({ _credential_id: 'sheets-oauth' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      'dm-1'
    );
    expect(screen.queryByRole('button', { name: 'Choose spreadsheet' })).not.toBeInTheDocument();

    fireEvent.click(combobox);
    fireEvent.click(await within(document.body).findByRole('option', { name: 'Goals' }));

    expect(onConfigurationChange).toHaveBeenLastCalledWith({
      AuthType: { oauth2: {} },
      _credential_id: 'sheets-oauth',
      SpreadsheetId: 'sheet-1',
    });
  });

  it('offers a text input when the spreadsheet list cannot be loaded', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockRejectedValue(
      new Error('Google Drive API has not been used')
    );
    renderNewSheets();

    await selectCredential('Marketing sheets');

    expect(
      await screen.findByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).toBeInTheDocument();
  });

  it('a service account keeps the plain spreadsheet input and loads no list', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue([]);
    renderNewSheets();

    await selectCredential('Reporting robot');

    expect(
      await screen.findByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).toBeInTheDocument();
    expect(previewSpy).not.toHaveBeenCalledWith(
      'GoogleSheets',
      'SpreadsheetId',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('an old-key service account screen stays a plain input against the dynamic spec', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue([{ value: 'sheet-1', label: 'Goals' }]);
    render(
      inDataMart(
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={freshSpecification}
          initialConfiguration={{
            _id: 'cfg-1',
            AuthType: { service_account: { _source_credential_id: 'old-sa' } },
            SpreadsheetId: 'sheet-1',
          }}
          isEditingExisting
        />
      )
    );

    expect(
      await screen.findByRole('textbox', { name: 'Spreadsheet ID or URL *' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Spreadsheet ID or URL *' })
    ).not.toBeInTheDocument();
    expect(previewSpy).not.toHaveBeenCalled();
  });

  it('loads the tabs of a saved configuration with its Data Mart and bound Credential', async () => {
    const previewSpy = vi
      .spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions')
      .mockResolvedValue([{ value: 'Data', label: 'Data' }]);

    render(
      inDataMart(
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={[
            ...freshSpecification,
            {
              name: 'SheetName',
              title: 'Sheet Name',
              requiredType: RequiredType.STRING,
              required: true,
              attributes: ['DYNAMIC_OPTIONS'],
              optionsDependsOn: ['AuthType', 'SpreadsheetId'],
            },
          ]}
          initialConfiguration={{
            _id: 'cfg-1',
            _credential_id: 'sheets-oauth',
            AuthType: { oauth2: {} },
            SpreadsheetId: 'sheet-1',
          }}
          isEditingExisting
        />
      )
    );

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledWith(
        'GoogleSheets',
        'SheetName',
        expect.objectContaining({ _id: 'cfg-1', _credential_id: 'sheets-oauth' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        'dm-1'
      );
    });
    previewSpy.mockRestore();
  });

  it('a configuration on its old key drops its spreadsheet when it takes a Credential', async () => {
    const onConfigurationChange = vi.fn();
    render(
      inDataMart(
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={freshSpecification}
          initialConfiguration={{
            _id: 'cfg-1',
            AuthType: { oauth2: { _source_credential_id: 'old-oauth' } },
            SpreadsheetId: 'https://docs.google.com/spreadsheets/d/old/edit',
          }}
          onConfigurationChange={onConfigurationChange}
          isEditingExisting
        />
      )
    );

    await selectCredential('Marketing sheets');

    expect(onConfigurationChange).toHaveBeenLastCalledWith({
      _id: 'cfg-1',
      AuthType: { oauth2: {} },
      _credential_id: 'sheets-oauth',
      SpreadsheetId: '',
    });
  });

  it('a Credential connected from the form keeps the spreadsheet its Connect picked', async () => {
    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/picked/edit';
    const onConfigurationChange = renderNewSheets();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Credential' }));
    fireEvent.click(
      await within(document.body).findByRole('option', { name: '+ Create new Credential' })
    );
    act(() => {
      sheet.pickSpreadsheet?.('sheets-new', spreadsheetUrl);
      sheet.props?.onCreated?.(
        credential('sheets-new', 'source:GoogleSheets:oauth2', 'New sheets') as never
      );
    });

    expect(onConfigurationChange).toHaveBeenLastCalledWith({
      AuthType: { oauth2: {} },
      _credential_id: 'sheets-new',
      SpreadsheetId: spreadsheetUrl,
    });
  });

  it('a member who cannot see the Credential still gets the spreadsheet list', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockResolvedValue([
      { value: 'sheet-1', label: 'Goals' },
    ]);
    render(
      inDataMart(
        <ConfigurationStep
          connector={googleSheetsConnector}
          connectorSpecification={freshSpecification}
          initialConfiguration={{
            _id: 'cfg-1',
            _credential_id: 'sheets-private',
            AuthType: { oauth2: {} },
            SpreadsheetId: 'sheet-1',
          }}
          isEditingExisting
        />,
        [{ configId: 'cfg-1', summary: { access: 'restricted', state: 'ready' } }]
      )
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Spreadsheet ID or URL *' })).toHaveTextContent(
        'Goals'
      );
    });
  });
});

describe('ConfigurationStep seeding of an existing configuration', () => {
  const seededSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'Mode',
      title: 'Mode',
      requiredType: RequiredType.OBJECT,
      required: true,
      oneOf: [
        {
          label: 'Service Account',
          value: 'service_account',
          requiredType: RequiredType.OBJECT,
          items: {
            ServiceAccountKey: {
              name: 'ServiceAccountKey',
              title: 'Service Account Key',
              requiredType: RequiredType.STRING,
              required: true,
            },
          },
        },
      ],
    },
    {
      name: 'SheetName',
      title: 'Sheet Name',
      requiredType: RequiredType.STRING,
      required: true,
    },
    {
      name: 'HeaderRow',
      title: 'Header Row',
      requiredType: RequiredType.NUMBER,
      required: true,
      default: 1,
    },
  ];

  it('applies spec defaults and the oneOf seed to a non-empty configuration too', async () => {
    const onValidationChange = vi.fn();

    render(
      <MemoryRouter>
        <ConfigurationStep
          connector={connector}
          connectorSpecification={seededSpecification}
          initialConfiguration={{ SheetName: 'Existing Sheet' }}
          onValidationChange={onValidationChange}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole('spinbutton', { name: 'Header Row *' })).toHaveValue(1);
    expect(screen.getByRole('textbox', { name: 'Sheet Name *' })).toHaveValue('Existing Sheet');
    expect(screen.getByRole('textbox', { name: 'Service Account Key *' })).toBeInTheDocument();
  });
});

// Re-picking a version in Edit config re-seeds the saved configuration against the new
// specification. A secret that version added was masked as well, so it looked stored and Save
// was enabled; the mask was dropped on save, and every run failed on the empty value.
describe('ConfigurationStep editing a saved configuration against a newer specification', () => {
  const newerSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'Token',
      title: 'Token',
      requiredType: RequiredType.STRING,
      required: true,
      attributes: ['SECRET'],
    },
    {
      name: 'NewKey',
      title: 'New Key',
      requiredType: RequiredType.STRING,
      required: true,
      attributes: ['SECRET'],
    },
  ];

  it('masks only the secrets the old key has, and a key it lacks asks for a Credential', async () => {
    credentialsState.credentials = [
      credential('ads-oauth', 'source:GoogleAds:oauth2', 'Ads account'),
    ];
    const onValidationChange = vi.fn();

    render(
      inDataMart(
        <ConfigurationStep
          connector={connector}
          connectorSpecification={newerSpecification}
          initialConfiguration={{ _id: 'cfg-1', _secrets_id: 'secret-1', Token: '**********' }}
          isEditingExisting
          onValidationChange={onValidationChange}
        />
      )
    );

    // The new secret is an empty input; only the stored one has an Edit button. Both read-only.
    const newKey = await screen.findByRole('textbox', { name: 'New Key *' });
    expect(newKey).toHaveValue('');
    expect(newKey).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(false);
    });

    await selectCredential('Ads account');
    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(true);
    });
  });
});

describe('ConfigurationStep Credential', () => {
  const adsSpecification: ConnectorSpecificationResponseApiDto[] = [
    {
      name: 'CustomerId',
      title: 'Customer ID',
      requiredType: RequiredType.STRING,
      required: true,
    },
    {
      name: 'AuthType',
      title: 'Auth Type',
      requiredType: RequiredType.OBJECT,
      required: true,
      oneOf: [
        {
          label: 'OAuth2',
          value: 'oauth2',
          requiredType: RequiredType.OBJECT,
          attributes: ['OAUTH_FLOW'],
          items: {
            RefreshToken: {
              name: 'RefreshToken',
              title: 'Refresh Token',
              requiredType: RequiredType.STRING,
              required: true,
              attributes: ['SECRET'],
            },
          },
        },
        {
          label: 'Service Account',
          value: 'service_account',
          requiredType: RequiredType.OBJECT,
          items: {
            ServiceAccountKey: {
              name: 'ServiceAccountKey',
              title: 'Service Account Key',
              requiredType: RequiredType.STRING,
              required: true,
              attributes: ['SECRET'],
            },
          },
        },
      ],
    },
  ];

  function Harness({
    initial = {},
    onChange = vi.fn(),
    connectorItem = connector,
    specification = adsSpecification,
    ...props
  }: Partial<Parameters<typeof ConfigurationStep>[0]> & {
    initial?: Record<string, unknown>;
    onChange?: (configuration: Record<string, unknown>, automatic?: boolean) => void;
    connectorItem?: ConnectorListItem;
    specification?: ConnectorSpecificationResponseApiDto[];
  }) {
    const [configuration, setConfiguration] = useState<Record<string, unknown>>(initial);
    return (
      <ConfigurationStep
        connector={connectorItem}
        connectorSpecification={specification}
        initialConfiguration={configuration}
        onConfigurationChange={(...reported) => {
          setConfiguration(reported[0]);
          onChange(...reported);
        }}
        {...props}
      />
    );
  }

  it('a connector with key fields shows a Credential field instead of its auth fields', () => {
    render(inDataMart(<Harness />));

    expect(screen.getByRole('combobox', { name: 'Credential' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Customer ID *' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Service Account' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Service Account Key/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Refresh Token/)).not.toBeInTheDocument();
  });

  it("offers only Credentials of the connector's definitions", async () => {
    credentialsState.credentials = [
      credential('ads-oauth', 'source:GoogleAds:oauth2', 'Ads account'),
      credential('ads-sa', 'source:GoogleAds:service_account', 'Ads robot'),
      credential('fb', 'source:FacebookMarketing:oauth2', 'Facebook page'),
    ];
    render(inDataMart(<Harness />));

    expect(await openCredentialOptions()).toEqual([
      expect.stringContaining('Ads account'),
      expect.stringContaining('Ads robot'),
      '+ Create new Credential',
    ]);
  });

  describe('custom connector', () => {
    const customConnector: ConnectorListItem = {
      name: 'MyApi',
      displayName: 'My API',
      description: '',
      logoBase64: null,
      docUrl: null,
      isCustom: true,
      id: 'cdef-1',
      version: 2,
    };
    const customSpecification: ConnectorSpecificationResponseApiDto[] = [
      { name: 'Mode', title: 'Mode', requiredType: RequiredType.STRING, required: true },
      { name: 'ClientId', title: 'Client ID', requiredType: RequiredType.STRING, required: true },
      {
        name: 'Token',
        title: 'API Token',
        requiredType: RequiredType.STRING,
        required: true,
        attributes: ['SECRET'],
      },
      { name: 'Account', title: 'Account', requiredType: RequiredType.STRING, required: true },
    ];
    // The server's own manifest parse: every key parameter, and what the selected branch needs.
    const requirementFor = (query: { selection?: string }) =>
      Promise.resolve({
        hosts: ['api.example.com', 'auth.example.com'],
        keyParameters: ['ClientId', 'Token'],
        selectionParameter: 'Mode',
        fieldList:
          query.selection === 'oauth'
            ? [
                { key: 'ClientId', label: 'Client ID', secret: false, required: true },
                { key: 'Token', label: 'API Token', secret: true, required: false },
              ]
            : [],
      });

    it('a custom connector offers only fitting Credentials', async () => {
      builderApi.credentialRequirement.mockImplementation(requirementFor);
      builderApi.fittingCredentials.mockResolvedValue([
        { id: 'cc-fit', title: 'Fits', hosts: ['api.example.com'], fieldKeys: ['ClientId'] },
      ]);
      credentialsState.credentials = [
        credential('cc-fit', 'custom-connector', 'Fitting key'),
        credential('cc-other', 'custom-connector', 'Other API key'),
        credential('ads-oauth', 'source:GoogleAds:oauth2', 'Ads account'),
      ];

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
            pinnedVersion={3}
          />
        )
      );

      await screen.findByRole('combobox', { name: 'Credential' });
      expect(builderApi.fittingCredentials).toHaveBeenCalledWith({
        connectorName: 'MyApi',
        version: 3,
        selection: 'oauth',
      });
      expect(screen.queryByRole('textbox', { name: 'Client ID *' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'API Token *' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Account *' })).toBeInTheDocument();
      expect(await openCredentialOptions()).toEqual([
        expect.stringContaining('Fitting key'),
        '+ Create new Credential',
      ]);
    });

    it('+ Create new Credential for a custom connector is prefilled from the backend requirement', async () => {
      builderApi.credentialRequirement.mockImplementation(requirementFor);
      builderApi.fittingCredentials.mockResolvedValue([]);

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
            pinnedVersion={3}
          />
        )
      );

      await screen.findByRole('combobox', { name: 'Credential' });
      await openCredentialOptions();
      fireEvent.click(
        within(document.body).getByRole('option', { name: '+ Create new Credential' })
      );
      expect(builderApi.credentialRequirement).toHaveBeenCalledWith({
        connectorName: 'MyApi',
        version: 3,
        selection: 'oauth',
      });
      expect(sheet.props?.customConnectorPrefill).toEqual({
        hosts: ['api.example.com', 'auth.example.com'],
        fieldList: [
          { key: 'ClientId', label: 'Client ID', secret: false, required: true },
          { key: 'Token', label: 'API Token', secret: true, required: false },
        ],
      });
    });

    it.each([
      ['an edited configuration', { _id: 'cfg-1', Mode: 'oauth', Account: 'acc-1' }],
      ['a new configuration', { Mode: 'oauth', Account: 'acc-1' }],
    ])('keeps a Credential created from the field (%s)', async (_label, initial) => {
      builderApi.credentialRequirement.mockImplementation(requirementFor);
      builderApi.fittingCredentials.mockResolvedValue([]);
      const onChange = vi.fn();
      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={initial}
            pinnedVersion={3}
            onChange={onChange}
          />
        )
      );
      await screen.findByRole('combobox', { name: 'Credential' });
      await openCredentialOptions();
      fireEvent.click(
        within(document.body).getByRole('option', { name: '+ Create new Credential' })
      );
      act(() => {
        sheet.props?.onCreated?.(credential('cc-new', 'custom-connector', 'New key') as never);
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      expect(onChange.mock.lastCall?.[0]).toHaveProperty('_credential_id', 'cc-new');
    });

    it('a hidden key parameter with a default is never sent beside a Credential', async () => {
      const hiddenScope: ConnectorSpecificationResponseApiDto = {
        name: 'Scope',
        title: 'Scope',
        requiredType: RequiredType.STRING,
        required: false,
        default: 'read',
        attributes: ['HIDE_IN_CONFIG_FORM'],
      };
      builderApi.credentialRequirement.mockImplementation((query: { selection?: string }) =>
        requirementFor(query).then(requirement => ({
          ...requirement,
          keyParameters: [...requirement.keyParameters, 'Scope'],
        }))
      );
      builderApi.fittingCredentials.mockResolvedValue([
        { id: 'cc-fit', title: 'Fits', hosts: ['api.example.com'], fieldKeys: ['ClientId'] },
      ]);
      credentialsState.credentials = [credential('cc-fit', 'custom-connector', 'Fitting key')];
      const onChange = vi.fn();

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={[...customSpecification, hiddenScope]}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
            onChange={onChange}
          />
        )
      );

      await screen.findByRole('combobox', { name: 'Credential' });
      await openCredentialOptions();
      fireEvent.click(within(document.body).getByRole('option', { name: /Fitting key/ }));

      await waitFor(() => {
        expect(onChange.mock.lastCall?.[0]).toHaveProperty('_credential_id', 'cc-fit');
      });
      for (const [config] of onChange.mock.calls) expect(config).not.toHaveProperty('Scope');
    });

    it('keeps a hidden key default on the typed path and drops it beside a Credential', async () => {
      const hiddenScope: ConnectorSpecificationResponseApiDto = {
        name: 'Scope',
        title: 'Scope',
        requiredType: RequiredType.STRING,
        required: false,
        default: 'read',
        attributes: ['HIDE_IN_CONFIG_FORM'],
      };
      builderApi.credentialRequirement.mockImplementation((query: { selection?: string }) =>
        requirementFor(query).then(requirement => ({
          ...requirement,
          keyParameters: [...requirement.keyParameters, 'Scope'],
        }))
      );
      builderApi.fittingCredentials.mockResolvedValue([]);
      credentialsState.credentials = [credential('cc-fit', 'custom-connector', 'Fitting key')];

      const typed = vi.fn();
      const first = render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={[...customSpecification, hiddenScope]}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
            onChange={typed}
          />
        )
      );
      fireEvent.change(await screen.findByRole('textbox', { name: 'Account *' }), {
        target: { value: 'acc-1' },
      });
      await waitFor(() => {
        expect(typed.mock.lastCall?.[0]).toHaveProperty('Scope', 'read');
      });
      first.unmount();

      const bound = vi.fn();
      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={[...customSpecification, hiddenScope]}
            initial={{ _id: 'cfg-1', Mode: 'oauth', _credential_id: 'cc-fit' }}
            onChange={bound}
          />
        )
      );
      fireEvent.change(await screen.findByRole('textbox', { name: 'Account *' }), {
        target: { value: 'acc-2' },
      });
      await waitFor(() => {
        expect(bound.mock.lastCall?.[0]).toHaveProperty('Account', 'acc-2');
      });
      for (const [config] of bound.mock.calls) expect(config).not.toHaveProperty('Scope');
    });

    it('switching the version of a bound custom configuration drops a parameter the new version keys', async () => {
      builderApi.credentialRequirement.mockImplementation((query: { version?: number }) =>
        requirementFor({}).then(requirement => ({
          ...requirement,
          keyParameters:
            query.version === 4
              ? [...requirement.keyParameters, 'Account']
              : requirement.keyParameters,
        }))
      );
      builderApi.fittingCredentials.mockResolvedValue([
        { id: 'cc-fit', title: 'Fits', hosts: ['api.example.com'], fieldKeys: ['ClientId'] },
      ]);
      credentialsState.credentials = [credential('cc-fit', 'custom-connector', 'Fitting key')];
      const onChange = vi.fn();
      function Versions() {
        const [version, setVersion] = useState(3);
        return (
          <>
            <button
              onClick={() => {
                setVersion(4);
              }}
            >
              switch
            </button>
            <Harness
              connectorItem={customConnector}
              specification={customSpecification}
              initial={{ _id: 'cfg-1', Mode: 'oauth', Account: 'acc-1', _credential_id: 'cc-fit' }}
              pinnedVersion={version}
              onChange={onChange}
            />
          </>
        );
      }

      render(inDataMart(<Versions />));
      await screen.findByRole('textbox', { name: 'Account *' });
      fireEvent.click(screen.getByRole('button', { name: 'switch' }));

      await waitFor(() => {
        expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('Account');
      });
      expect(onChange.mock.lastCall?.[0]).toHaveProperty('_credential_id', 'cc-fit');
    });

    describe('a branch change the picked Credential does not fit', () => {
      const fitOnlyOauth = (query: { selection?: string }) =>
        Promise.resolve(
          query.selection === 'oauth'
            ? [{ id: 'cc-fit', title: 'Fits', hosts: ['api.example.com'], fieldKeys: ['ClientId'] }]
            : []
        );

      it('a branch change that the picked Credential does not fit clears it', async () => {
        builderApi.credentialRequirement.mockImplementation(requirementFor);
        builderApi.fittingCredentials.mockImplementation(fitOnlyOauth);
        credentialsState.credentials = [credential('cc-fit', 'custom-connector', 'Fitting key')];
        const onChange = vi.fn();
        const onValidationChange = vi.fn();

        render(
          inDataMart(
            <Harness
              connectorItem={customConnector}
              specification={customSpecification}
              initial={{ _id: 'cfg-1', Mode: 'oauth', Account: 'acc-1' }}
              onChange={onChange}
              onValidationChange={onValidationChange}
            />
          )
        );
        await screen.findByRole('combobox', { name: 'Credential' });
        await openCredentialOptions();
        fireEvent.click(within(document.body).getByRole('option', { name: /Fitting key/ }));
        await waitFor(() => {
          expect(onValidationChange).toHaveBeenLastCalledWith(true);
        });

        fireEvent.change(await screen.findByRole('textbox', { name: 'Mode *' }), {
          target: { value: 'basic' },
        });

        await waitFor(() => {
          expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('_credential_id');
        });
        await waitFor(() => {
          expect(onValidationChange).toHaveBeenLastCalledWith(false);
        });
      });

      it('keeps the Credential a saved configuration was bound to', async () => {
        builderApi.credentialRequirement.mockImplementation(requirementFor);
        builderApi.fittingCredentials.mockImplementation(fitOnlyOauth);
        credentialsState.credentials = [credential('cc-fit', 'custom-connector', 'Fitting key')];
        const onChange = vi.fn();

        render(
          inDataMart(
            <Harness
              connectorItem={customConnector}
              specification={customSpecification}
              initial={{ _id: 'cfg-1', Mode: 'oauth', Account: 'acc-1', _credential_id: 'cc-fit' }}
              onChange={onChange}
            />
          )
        );
        await screen.findByRole('combobox', { name: 'Credential' });
        fireEvent.change(screen.getByRole('textbox', { name: 'Mode *' }), {
          target: { value: 'basic' },
        });
        await waitFor(() => {
          expect(builderApi.fittingCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ selection: 'basic' })
          );
        });
        await screen.findByRole('combobox', { name: 'Credential' });

        for (const [config] of onChange.mock.calls)
          expect(config).toHaveProperty('_credential_id', 'cc-fit');
      });
    });

    it('asks for the requirement again when the selection changes', async () => {
      builderApi.credentialRequirement.mockImplementation(requirementFor);
      builderApi.fittingCredentials.mockResolvedValue([]);

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
          />
        )
      );

      await screen.findByRole('combobox', { name: 'Credential' });
      fireEvent.change(screen.getByRole('textbox', { name: 'Mode *' }), {
        target: { value: 'basic' },
      });
      await waitFor(() => {
        expect(builderApi.credentialRequirement).toHaveBeenCalledWith(
          expect.objectContaining({ selection: 'basic' })
        );
      });
    });

    it('asks for the requirement once when the manifest has no selection parameter', async () => {
      builderApi.credentialRequirement.mockResolvedValue({
        hosts: ['api.example.com'],
        keyParameters: ['ClientId', 'Token'],
        fieldList: [],
      });
      builderApi.fittingCredentials.mockResolvedValue([]);

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Account: 'acc-1' }}
          />
        )
      );

      await screen.findByRole('combobox', { name: 'Credential' });
      expect(builderApi.credentialRequirement).toHaveBeenCalledTimes(1);
    });

    it('guesses no key field when the requirement fails, and offers to try again', async () => {
      builderApi.credentialRequirement
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(requirementFor);
      builderApi.fittingCredentials.mockResolvedValue([]);
      const onValidationChange = vi.fn();

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Mode: 'oauth', Account: 'acc-1' }}
            onValidationChange={onValidationChange}
          />
        )
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Could not load Credentials.');
      expect(screen.queryByRole('textbox', { name: 'API Token *' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Client ID *' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Credential' })).not.toBeInTheDocument();
      expect(onValidationChange).not.toHaveBeenCalledWith(true);

      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('combobox', { name: 'Credential' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Account *' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'API Token *' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('offers to try again when the fitting Credentials fail to load', async () => {
      builderApi.credentialRequirement.mockImplementation(requirementFor);
      builderApi.fittingCredentials
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([]);

      render(
        inDataMart(
          <Harness
            connectorItem={customConnector}
            specification={customSpecification}
            initial={{ _id: 'cfg-1', Mode: 'oauth' }}
          />
        )
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Could not load Credentials.');
      expect(screen.queryByRole('combobox', { name: 'Credential' })).not.toBeInTheDocument();

      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('combobox', { name: 'Credential' })).toBeInTheDocument();
      expect(builderApi.fittingCredentials).toHaveBeenCalledTimes(2);
    });
  });

  it('+ Create new Credential opens the form with the provider preset and selects it on save', async () => {
    const githubConnector = { ...connector, name: 'GitHub', displayName: 'GitHub' };
    const githubSpecification: ConnectorSpecificationResponseApiDto[] = [
      {
        name: 'AccessToken',
        title: 'Access Token',
        requiredType: RequiredType.STRING,
        required: true,
        attributes: ['SECRET'],
      },
      {
        name: 'Repository',
        title: 'Repository',
        requiredType: RequiredType.STRING,
        required: true,
      },
    ];
    const onChange = vi.fn();
    render(
      inDataMart(
        <Harness
          connectorItem={githubConnector}
          specification={githubSpecification}
          initial={{ Repository: 'owox/data-marts' }}
          onChange={onChange}
        />
      )
    );

    expect(screen.queryByRole('textbox', { name: 'Access Token *' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
    fireEvent.click(
      await within(document.body).findByRole('option', { name: '+ Create new Credential' })
    );

    expect(sheet.props?.initialDefinitionId).toBe('github');
    expect(sheet.props?.allowedDefinitionIds).toEqual(['github']);
    act(() => {
      sheet.props?.onCreated?.(credential('cred-new', 'github', 'Repo token') as never);
    });

    expect(onChange).toHaveBeenLastCalledWith({
      Repository: 'owox/data-marts',
      _credential_id: 'cred-new',
    });
  });

  it('with exactly one fitting Credential a new configuration selects it', async () => {
    credentialsState.credentials = [
      credential('ads-sa', 'source:GoogleAds:service_account', 'Ads robot'),
      credential('fb', 'source:FacebookMarketing:oauth2', 'Facebook page'),
    ];
    const onChange = vi.fn();
    render(inDataMart(<Harness initial={{ CustomerId: '123' }} onChange={onChange} />));

    // Reported as picked for the user, so it alone does not make the form dirty.
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        { CustomerId: '123', AuthType: { service_account: {} }, _credential_id: 'ads-sa' },
        true
      );
    });
    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent('Ads robot');
  });

  it('a configuration still on its old key shows it and keeps it until a Credential is selected', async () => {
    credentialsState.credentials = [
      credential('ads-sa', 'source:GoogleAds:service_account', 'Ads robot'),
    ];
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    render(
      inDataMart(
        <Harness
          initial={{
            _id: 'cfg-1',
            _secrets_id: 'secret-1',
            CustomerId: '123',
            AuthType: { service_account: { ServiceAccountKey: '**********' } },
          }}
          onChange={onChange}
          onValidationChange={onValidationChange}
          isEditingExisting
        />
      )
    );

    expect(screen.getByText('Uses its own key until you select a Credential')).toBeInTheDocument();
    expect(screen.getByLabelText(/Service Account Key/)).toBeDisabled();
    await waitFor(() => {
      expect(onValidationChange).toHaveBeenLastCalledWith(true);
    });
    // An existing configuration is never switched to a Credential on its own.
    expect(onChange).not.toHaveBeenCalled();

    await selectCredential('Ads robot');

    expect(onChange).toHaveBeenLastCalledWith({
      _id: 'cfg-1',
      CustomerId: '123',
      AuthType: { service_account: {} },
      _credential_id: 'ads-sa',
    });
    expect(
      screen.queryByText('Uses its own key until you select a Credential')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Service Account Key/)).not.toBeInTheDocument();
  });

  it('keeps the bound Credential of a saved configuration and shows its state', () => {
    render(
      inDataMart(
        <Harness
          initial={{ _id: 'cfg-1', _credential_id: 'ads-gone', AuthType: { oauth2: {} } }}
          isEditingExisting
        />,
        [
          {
            configId: 'cfg-1',
            summary: {
              access: 'visible',
              id: 'ads-gone',
              title: 'Disabled ads key',
              definitionId: 'source:GoogleAds:oauth2',
              providerName: 'Google Ads',
              identity: null,
              state: 'disabled',
            },
          },
        ]
      )
    );

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(
      'Disabled ads key'
    );
    expect(screen.getByText('Credential disabled')).toBeInTheDocument();
  });

  it('the copy-from-another-Data-Mart button is gone', () => {
    render(inDataMart(<Harness />));

    expect(screen.queryByRole('button', { name: /another Data/ })).not.toBeInTheDocument();
  });
});
