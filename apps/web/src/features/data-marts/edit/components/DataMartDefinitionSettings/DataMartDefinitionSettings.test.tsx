import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import { DataMartDefinitionType } from '../../../shared';
import type { DataMartContextType } from '../../model/context/types';
import { DataMartDefinitionSettings } from './DataMartDefinitionSettings';

const testState = vi.hoisted(() => ({
  outletContext: null as unknown,
  updateDataMartDefinition: vi.fn(),
  runSchemaActualization: vi.fn(),
  getInputSourceChangeImpact: vi.fn(),
}));

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useOutletContext: () => testState.outletContext,
  };
});

vi.mock('../../../shared/utils/useDataMartPreset.ts', () => ({
  useDataMartPreset: () => undefined,
}));

vi.mock('../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared')>();
  return {
    ...actual,
    // Only the impact read is exercised here; the rest of the flow goes through the outlet
    // context. Replacing the whole service keeps us from spreading a class instance.
    dataMartService: {
      getInputSourceChangeImpact: (...args: unknown[]) =>
        testState.getInputSourceChangeImpact(...args),
    },
  };
});

// Radix Select renders its options in a portal driven by pointer events. Swap in a native select
// so the available options are directly assertable.
vi.mock('@owox/ui/components/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      aria-label='Definition Type'
      value={value}
      onChange={e => {
        onValueChange?.(e.target.value);
      }}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectGroup: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

// The SQL validator dry-runs the query against the backend, which is out of scope here.
vi.mock('../SqlValidator/SqlValidator.tsx', () => ({
  default: () => null,
}));

// The real definition fields pull the storage resource tree, which the type-change flow under
// test does not depend on. We register a plain SQL input on the same form path instead, so the
// form still becomes valid and dirty exactly as it would in the app.
vi.mock('./form/DataMartDefinitionForm.tsx', async () => {
  const { useFormContext } = await import('react-hook-form');
  return {
    DataMartDefinitionForm: ({ definitionType }: { definitionType: DataMartDefinitionType }) => {
      const { register } = useFormContext();
      return (
        <div data-testid='definition-form'>
          <span>{definitionType}</span>
          <input aria-label='SQL query' {...register('definition.sqlQuery')} />
          <input aria-label='Table name' {...register('definition.fullyQualifiedName')} />
        </div>
      );
    },
  };
});

const buildDataMart = (
  definitionType: DataMartDefinitionType | null,
  storageType: DataStorageType = DataStorageType.GOOGLE_BIGQUERY
) => ({
  id: 'dm-1',
  title: 'Orders',
  definitionType,
  definition:
    definitionType === DataMartDefinitionType.SQL
      ? { sqlQuery: 'select saved' }
      : definitionType
        ? { fullyQualifiedName: 'project.dataset.orders' }
        : null,
  storage: {
    id: 'storage-1',
    type: storageType,
    config: null,
  },
});

const renderSettings = (
  definitionType: DataMartDefinitionType | null,
  initialDefinitionType: DataMartDefinitionType | null,
  setDefinitionType = vi.fn(),
  storageType: DataStorageType = DataStorageType.GOOGLE_BIGQUERY
) => {
  testState.outletContext = {
    dataMart: buildDataMart(initialDefinitionType, storageType),
    updateDataMartDefinition: testState.updateDataMartDefinition,
    runSchemaActualization: testState.runSchemaActualization,
  } as unknown as DataMartContextType;

  const { rerender } = render(
    <DataMartDefinitionSettings
      definitionType={definitionType}
      initialDefinitionType={initialDefinitionType}
      setDefinitionType={setDefinitionType}
    />
  );

  /**
   * Re-renders the way the page does after any Data Mart refresh — schema actualization, a
   * relationship change, a publish — which hands down a freshly built `dataMart` object.
   */
  const refreshDataMart = (nextDefinitionType = definitionType) => {
    testState.outletContext = {
      ...(testState.outletContext as object),
      dataMart: buildDataMart(initialDefinitionType, storageType),
    } as unknown as DataMartContextType;

    rerender(
      <DataMartDefinitionSettings
        definitionType={nextDefinitionType}
        initialDefinitionType={initialDefinitionType}
        setDefinitionType={setDefinitionType}
      />
    );
  };

  return { setDefinitionType, refreshDataMart };
};

/** Validation runs on change, so the Save button only enables once it settles. */
const clickSaveWhenEnabled = async () => {
  const save = screen.getByRole('button', { name: 'Save' });
  await waitFor(() => {
    expect(save).toBeEnabled();
  });
  fireEvent.click(save);
};

const optionLabels = () =>
  Array.from(screen.getByLabelText('Definition Type').querySelectorAll('option')).map(
    option => option.textContent
  );

describe('DataMartDefinitionSettings — changing the input source type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.getInputSourceChangeImpact.mockResolvedValue({
      outboundRelationshipsCount: 0,
      inboundRelationshipsCount: 0,
      reportsCount: 0,
    });
    testState.updateDataMartDefinition.mockResolvedValue(undefined);
  });

  it('shows the type selector for an existing Data Mart so its source can be repointed', () => {
    renderSettings(DataMartDefinitionType.VIEW, DataMartDefinitionType.VIEW);

    expect(screen.getByLabelText('Definition Type')).toBeInTheDocument();
  });

  it('hides the type selector for a connector Data Mart', () => {
    renderSettings(DataMartDefinitionType.CONNECTOR, DataMartDefinitionType.CONNECTOR);

    expect(screen.queryByLabelText('Definition Type')).not.toBeInTheDocument();
  });

  it('hides the type selector on a legacy BigQuery storage, which only accepts SQL', () => {
    renderSettings(
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.SQL,
      vi.fn(),
      DataStorageType.LEGACY_GOOGLE_BIGQUERY
    );

    expect(screen.queryByLabelText('Definition Type')).not.toBeInTheDocument();
  });

  it('does not offer connector as a switch target for an existing Data Mart', () => {
    renderSettings(DataMartDefinitionType.TABLE, DataMartDefinitionType.TABLE);

    const labels = optionLabels();
    expect(labels.some(label => label.includes('View'))).toBe(true);
    expect(labels.some(label => label.includes('Connector'))).toBe(false);
  });

  it('marks the saved type in the list', () => {
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.TABLE);

    const current = optionLabels().find(label => label.includes('(current)'));
    expect(current).toContain('Table');
  });

  it('offers connector while the Data Mart is still being set up', () => {
    renderSettings(null, null);

    expect(optionLabels().some(label => label.includes('Connector'))).toBe(true);
  });

  it('warns that the change is staged once another type is picked', () => {
    renderSettings(DataMartDefinitionType.TABLE, DataMartDefinitionType.VIEW);

    expect(screen.getByRole('status')).toHaveTextContent(/Pick a new source and save/);
  });

  it('shows no staged warning while the picked type still matches the saved one', () => {
    renderSettings(DataMartDefinitionType.VIEW, DataMartDefinitionType.VIEW);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('returns to the saved type when a staged change is discarded', () => {
    const { setDefinitionType } = renderSettings(
      DataMartDefinitionType.TABLE,
      DataMartDefinitionType.VIEW
    );

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(setDefinitionType).toHaveBeenCalledWith(DataMartDefinitionType.VIEW);
    expect(testState.updateDataMartDefinition).not.toHaveBeenCalled();
  });

  it('confirms before saving a type change, and reports what depends on the Data Mart', async () => {
    testState.getInputSourceChangeImpact.mockResolvedValue({
      outboundRelationshipsCount: 1,
      inboundRelationshipsCount: 1,
      reportsCount: 2,
    });
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.VIEW);

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 1' } });
    await clickSaveWhenEnabled();

    expect(await screen.findByText('Change input source from View to SQL?')).toBeInTheDocument();
    // Nothing is written until the user confirms.
    expect(testState.updateDataMartDefinition).not.toHaveBeenCalled();

    // One outbound plus one inbound relationship, and two reports.
    expect(
      await screen.findByText('2 relationships and 2 reports depend on this Data Mart.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change input source' }));

    await waitFor(() => {
      expect(testState.updateDataMartDefinition).toHaveBeenCalledWith(
        'dm-1',
        DataMartDefinitionType.SQL,
        expect.objectContaining({ sqlQuery: 'select 1' })
      );
    });
  });

  it('saves a same-type edit without a confirmation dialog', async () => {
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.SQL);

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 2' } });
    await clickSaveWhenEnabled();

    await waitFor(() => {
      expect(testState.updateDataMartDefinition).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Change input source from/)).not.toBeInTheDocument();
  });

  it('keeps the entered definition and skips schema actualization when the backend rejects the change', async () => {
    testState.updateDataMartDefinition.mockRejectedValue(new Error('Syntax error near FROM'));
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.VIEW);

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select from' } });
    await clickSaveWhenEnabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Change input source' }));

    await waitFor(() => {
      expect(testState.updateDataMartDefinition).toHaveBeenCalled();
    });

    // The rejected save must not wipe what the user typed, and must not refresh the schema of a
    // Data Mart whose definition never changed.
    expect(screen.getByLabelText('SQL query')).toHaveValue('select from');
    expect(testState.runSchemaActualization).not.toHaveBeenCalled();
  });

  it('keeps keystrokes typed while a save request is in flight', async () => {
    let resolveSave!: () => void;
    testState.updateDataMartDefinition.mockReturnValue(
      new Promise<void>(resolve => {
        resolveSave = resolve;
      })
    );
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.SQL);

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 1' } });
    await clickSaveWhenEnabled();
    // The user keeps editing while the request is on the wire.
    fireEvent.change(screen.getByLabelText('SQL query'), {
      target: { value: 'select 1 where x' },
    });

    resolveSave();

    // Settling the save re-baselines dirtiness on the submitted snapshot but must not snap the
    // editor back to it — the newer text stays, and Save re-enables for it.
    await waitFor(() => {
      expect(testState.runSchemaActualization).toHaveBeenCalled();
    });
    expect(screen.getByLabelText('SQL query')).toHaveValue('select 1 where x');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
  });

  it('keeps an unsaved query when the Data Mart is refreshed underneath the editor', async () => {
    const { refreshDataMart } = renderSettings(
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.SQL
    );

    fireEvent.change(screen.getByLabelText('SQL query'), {
      target: { value: 'select saved where x = 1' },
    });
    refreshDataMart();

    // The refresh carries the *saved* query; re-applying it here would silently swallow
    // everything typed since the last save.
    expect(screen.getByLabelText('SQL query')).toHaveValue('select saved where x = 1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
  });

  it('keeps a staged query when the Data Mart is refreshed underneath the editor', async () => {
    const { refreshDataMart } = renderSettings(
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.TABLE
    );

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 1' } });
    refreshDataMart();

    // A staged type change resets to an *empty* definition, so a refresh mid-edit would leave the
    // editor showing a query the form no longer holds — and Save disabled with text on screen.
    expect(screen.getByLabelText('SQL query')).toHaveValue('select 1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
  });

  it('re-shapes the form when another type is picked, even with unsaved edits', () => {
    const { refreshDataMart } = renderSettings(
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.TABLE
    );

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 1' } });
    // Going back to the saved type has to load the saved definition; unsaved edits to the type
    // being abandoned must not hold that off.
    refreshDataMart(DataMartDefinitionType.TABLE);

    expect(screen.getByLabelText('Table name')).toHaveValue('project.dataset.orders');
  });

  it('reports an unknown impact as unknown, never as zero dependencies', async () => {
    testState.getInputSourceChangeImpact.mockRejectedValue(new Error('Network error'));
    renderSettings(DataMartDefinitionType.SQL, DataMartDefinitionType.VIEW);

    fireEvent.change(screen.getByLabelText('SQL query'), { target: { value: 'select 1' } });
    await clickSaveWhenEnabled();

    expect(
      await screen.findByText(/Couldn’t check what depends on this Data Mart/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing else depends on this Data Mart/)).not.toBeInTheDocument();

    // Retry turns a later successful read into real counts.
    testState.getInputSourceChangeImpact.mockResolvedValue({
      outboundRelationshipsCount: 0,
      inboundRelationshipsCount: 2,
      reportsCount: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));

    expect(
      await screen.findByText('2 relationships depend on this Data Mart.')
    ).toBeInTheDocument();
  });
});
