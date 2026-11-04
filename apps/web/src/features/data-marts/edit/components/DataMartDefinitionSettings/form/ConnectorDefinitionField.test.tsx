import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../../data-storage/shared/model/types/data-storage-type.enum';
import { DataMartDefinitionType, DataMartStatus } from '../../../../shared/enums';
import type { ConnectorConfig } from '../../../model/types/connector-definition-config';
import type { DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema';
import { getEmptyDefinition } from '../../../utils/definition-helpers';
import { ConnectorDefinitionField } from './ConnectorDefinitionField';

const testState = vi.hoisted(() => ({
  outletContext: null as unknown,
  publishDataMart: vi.fn(),
  runDataMart: vi.fn(),
  getDataMartRuns: vi.fn(),
}));

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useOutletContext: () => testState.outletContext,
}));

vi.mock('../../../model/context/useDataMartContext', () => ({
  useDataMartContext: () => ({
    publishDataMart: testState.publishDataMart,
    runDataMart: testState.runDataMart,
    getDataMartRuns: testState.getDataMartRuns,
  }),
}));

const connector: ConnectorConfig = {
  source: {
    name: 'BankOfCanada',
    configuration: [{ _id: 'cfg-1' }],
    node: 'rates',
    fields: ['date'],
  },
  storage: { fullyQualifiedName: 'dataset.rates' },
};

// Each sheet is replaced by its two final actions, so a test picks Save & Run or Save directly.
const finishButtons = (submit: (c: ConnectorConfig, runAfterSave: boolean) => void) => (
  <>
    <button
      type='button'
      onClick={() => {
        submit(connector, true);
      }}
    >
      Save & Run
    </button>
    <button
      type='button'
      onClick={() => {
        submit(connector, false);
      }}
    >
      Save
    </button>
  </>
);

vi.mock('../../../../../connectors/edit/components/ConnectorDefinitionField', async () => ({
  ...(await vi.importActual<object>(
    '../../../../../connectors/edit/components/ConnectorDefinitionField/connector-definition.helpers'
  )),
  ConnectorSetupButton: ({
    onSetupConnector,
  }: {
    onSetupConnector: (c: ConnectorConfig, runAfterSave: boolean) => void;
  }) => finishButtons(onSetupConnector),
  ConnectorConfigurationItem: ({
    configIndex,
    onUpdateConfiguration,
  }: {
    configIndex: number;
    onUpdateConfiguration: (i: number) => (c: ConnectorConfig, runAfterSave: boolean) => void;
  }) => finishButtons(onUpdateConfiguration(configIndex)),
  AddConfigurationButton: () => null,
  ConnectorVersionControl: () => null,
}));

vi.mock('../../../../../connectors/edit/components/ConnectorEditSheet/ConnectorEditSheet', () => ({
  ConnectorEditSheet: () => null,
}));

function Field({ status, saveSucceeds }: { status: DataMartStatus; saveSucceeds: boolean }) {
  const isDraft = status === DataMartStatus.DRAFT;
  const methods = useForm<DataMartDefinitionFormData>({
    defaultValues: {
      definitionType: DataMartDefinitionType.CONNECTOR,
      // A draft starts from the setup button; a published Data Mart edits its configuration.
      definition: isDraft ? getEmptyDefinition(DataMartDefinitionType.CONNECTOR) : { connector },
    } as unknown as DataMartDefinitionFormData,
  });
  return (
    <FormProvider {...methods}>
      <ConnectorDefinitionField
        control={methods.control}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        saveDataMartDefinition={(_e, onSaved) => {
          if (saveSucceeds) onSaved?.();
        }}
      />
    </FormProvider>
  );
}

const renderField = (status: DataMartStatus, saveSucceeds = true) => {
  testState.outletContext = {
    dataMart: {
      id: 'dm-1',
      status: { code: status },
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY, config: {} },
    },
  };
  render(<Field status={status} saveSucceeds={saveSucceeds} />);
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ConnectorDefinitionField — Save & Run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.publishDataMart.mockResolvedValue(undefined);
    testState.runDataMart.mockResolvedValue('run-1');
    testState.getDataMartRuns.mockResolvedValue([]);
  });

  it('publishes a draft after the save and starts no manual run', async () => {
    renderField(DataMartStatus.DRAFT);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(testState.publishDataMart).toHaveBeenCalledWith('dm-1');
    });
    expect(testState.runDataMart).not.toHaveBeenCalled();
  });

  it('starts a manual run of a published Data Mart after the save', async () => {
    renderField(DataMartStatus.PUBLISHED);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(testState.runDataMart).toHaveBeenCalledWith({
        id: 'dm-1',
        payload: { runType: 'INCREMENTAL' },
      });
    });
    expect(testState.publishDataMart).not.toHaveBeenCalled();
  });

  it('neither publishes nor runs when the save fails', async () => {
    renderField(DataMartStatus.DRAFT, false);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));
    await settle();

    expect(testState.publishDataMart).not.toHaveBeenCalled();
    expect(testState.runDataMart).not.toHaveBeenCalled();
  });

  it.each([DataMartStatus.DRAFT, DataMartStatus.PUBLISHED])(
    'only saves a %s Data Mart on plain Save',
    async status => {
      renderField(status);

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await settle();

      expect(testState.publishDataMart).not.toHaveBeenCalled();
      expect(testState.runDataMart).not.toHaveBeenCalled();
    }
  );

  it('leaves a failed publish to the API client error and skips the run refresh', async () => {
    testState.publishDataMart.mockRejectedValue(new Error('Publish rejected'));
    renderField(DataMartStatus.DRAFT);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    await waitFor(() => {
      expect(testState.publishDataMart).toHaveBeenCalled();
    });
    expect(testState.getDataMartRuns).not.toHaveBeenCalled();
  });

  it('keeps a failed run refresh after publish handled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      testState.getDataMartRuns.mockImplementation(() => {
        const failed = Promise.reject(new Error('Runs unavailable'));
        // Not a Promise instance, so the spy does not mark the rejection as handled.
        return {
          then: failed.then.bind(failed),
          catch: failed.catch.bind(failed),
        } as unknown as Promise<void>;
      });
      renderField(DataMartStatus.DRAFT);

      fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

      await waitFor(() => {
        expect(testState.getDataMartRuns).toHaveBeenCalledWith('dm-1');
      });
      await new Promise(resolve => setImmediate(resolve));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
