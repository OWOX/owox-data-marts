import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  DataMartSchemaFieldStatus,
  type BigQueryDataMartSchema,
  type DataMartSchema,
} from '../../../shared/types/data-mart-schema.types';
import { DataMartDefinitionType } from '../../../shared';
import type { DataMartContextType } from '../../model/context/types';
import { DataMartSchemaSettings } from './DataMartSchemaSettings';
import type { SchemaToolbar } from './types/schema-toolbar';
import { useJoinedFormulaFields } from './calculated/joined-fields-context';
import { useCalculatedFieldIssues } from './calculated/calculated-field-issues-context';
import { useFormulaDataMartId } from './calculated/formula-data-mart-context';
import { useDraftCalculatedFields } from './calculated/draft-calculated-fields';

/** A calculated field row for the mocked SchemaContent's buttons to add or rewrite. */
function buildMetricField(formula: string): BigQueryDataMartSchema['fields'][number] {
  return {
    name: 'ctr',
    type: BigQueryFieldType.FLOAT,
    mode: BigQueryFieldMode.NULLABLE,
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    calculated: { formula, level: 'metric' },
  };
}

const testState = vi.hoisted(() => ({
  outletContext: null as unknown,
  blendableSchema: undefined as unknown,
  blendableSchemaIsError: false,
  useBlendableSchema: vi.fn(),
  invalidateBlendableSchema: vi.fn(),
  toast: vi.fn(),
  generateAllFieldDescriptions: vi.fn(),
  generateAllFieldAliases: vi.fn(),
  generateAllFieldMetadata: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: testState.toast,
}));

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useOutletContext: () => testState.outletContext,
  };
});

// The joined-field autocomplete source. Mocked rather than provided: these tests render the
// component bare, and the real hook is a React Query call that needs a QueryClientProvider.
vi.mock('../../../shared/hooks/useBlendableSchema', () => ({
  useBlendableSchema: (dataMartId: string) => {
    testState.useBlendableSchema(dataMartId);
    return { data: testState.blendableSchema, isError: testState.blendableSchemaIsError };
  },
}));

// Real hook needs a QueryClientProvider; these tests render the component bare, same reason as
// useBlendableSchema above.
vi.mock('../../../shared/hooks/useInvalidateBlendableSchema', () => ({
  useInvalidateBlendableSchema: () => testState.invalidateBlendableSchema,
}));

vi.mock('../../model/hooks', () => ({
  useAiHelperAvailability: () => ({ enabled: true }),
  useAiHelper: () => ({
    pendingScope: null,
    generateFieldAlias: vi.fn(),
    generateFieldDescription: vi.fn(),
    generateAllFieldDescriptions: testState.generateAllFieldDescriptions,
    generateAllFieldAliases: testState.generateAllFieldAliases,
    generateAllFieldMetadata: testState.generateAllFieldMetadata,
  }),
}));

vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type='button' disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./SchemaContent', () => ({
  SchemaContent: ({
    schema,
    onFieldsChange,
    schemaToolbar,
  }: {
    schema: DataMartSchema | null | undefined;
    onFieldsChange: (fields: BigQueryDataMartSchema['fields']) => void;
    schemaToolbar: SchemaToolbar;
  }) => {
    const field = schema?.fields[0];
    const joinedFields = useJoinedFormulaFields();
    const calculatedIssues = useCalculatedFieldIssues();
    const formulaDataMartId = useFormulaDataMartId();
    const draftCalculatedFields = useDraftCalculatedFields();
    return (
      <>
        <div data-testid='joined-formula-fields'>
          {joinedFields.fields.map(f => `${f.aliasPath}.${f.originalFieldName}`).join(',')}
        </div>
        <div data-testid='joined-formula-status'>{joinedFields.status}</div>
        <div data-testid='formula-data-mart-id'>{formulaDataMartId}</div>
        <div data-testid='draft-calculated-fields'>
          {draftCalculatedFields.map(f => `${f.name}=${f.formula}`).join(',')}
        </div>
        <div data-testid='calculated-field-issues'>
          {[...calculatedIssues].map(([name, missing]) => `${name}:${missing.join('|')}`).join(',')}
        </div>
        {schema && (
          <>
            <button
              type='button'
              onClick={() => {
                onFieldsChange([
                  ...schema.fields,
                  buildMetricField('SUM(clicks)'),
                ] as BigQueryDataMartSchema['fields']);
              }}
            >
              Add metric ctr
            </button>

            <button
              type='button'
              onClick={() => {
                onFieldsChange(
                  schema.fields.map(f =>
                    f.name === 'ctr' ? buildMetricField('SUM(taps)') : f
                  ) as BigQueryDataMartSchema['fields']
                );
              }}
            >
              Edit ctr formula
            </button>
          </>
        )}
        <div data-testid='schema-field'>
          {field
            ? `${field.isHiddenForReporting ? 'hidden' : 'visible'}:${field.alias ?? ''}:${field.description ?? ''}`
            : ''}
        </div>
        {/* Expose AI toolbar actions for DataMartSchemaSettings tests. */}
        {schemaToolbar.showAiHelper && (
          <>
            <button type='button' onClick={schemaToolbar.ai.onGenerateDescriptions}>
              Generate field descriptions
            </button>

            <button type='button' onClick={schemaToolbar.ai.onGenerateAliases}>
              Generate field aliases
            </button>

            <button type='button' onClick={schemaToolbar.ai.onGenerateMetadata}>
              Generate field aliases & descriptions
            </button>
          </>
        )}
        {schema && field && (
          <button
            type='button'
            onClick={() => {
              onFieldsChange([
                { ...field, alias: '' } as BigQueryDataMartSchema['fields'][number],
                ...schema.fields.slice(1),
              ] as BigQueryDataMartSchema['fields']);
            }}
          >
            Set alias empty
          </button>
        )}
      </>
    );
  },
}));

function createSchema(
  isHiddenForReporting: boolean,
  alias?: string,
  description?: string
): BigQueryDataMartSchema {
  return {
    type: 'bigquery-data-mart-schema',
    fields: [
      {
        name: 'id',
        type: BigQueryFieldType.INTEGER,
        mode: BigQueryFieldMode.NULLABLE,
        isPrimaryKey: false,
        isHiddenForReporting,
        status: DataMartSchemaFieldStatus.CONNECTED,
        alias,
        description,
      },
    ],
  };
}

function createContext(id: string, schema: BigQueryDataMartSchema): DataMartContextType {
  const context = {
    dataMart: {
      id,
      schema,
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    },
    isLoading: false,
    error: null,
    isSchemaActualizationLoading: false,
    updateDataMartSchema: vi.fn().mockResolvedValue(undefined),
    registerSchemaGuard: vi.fn(),
    runGuarded: vi.fn((action: (resolved: DataMartSchema) => void) => {
      action(schema);
    }),
  };
  return context as unknown as DataMartContextType;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('DataMartSchemaSettings bulk AI generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      buttonName: 'Generate field descriptions',
      generate: testState.generateAllFieldDescriptions,
      response: [{ name: 'id', description: 'Description generated for A' }],
    },
    {
      buttonName: 'Generate field aliases',
      generate: testState.generateAllFieldAliases,
      response: [{ name: 'id', alias: 'Alias generated for A' }],
    },
    {
      buttonName: 'Generate field aliases & descriptions',
      generate: testState.generateAllFieldMetadata,
      response: [
        {
          name: 'id',
          alias: 'Alias generated for A',
          description: 'Description generated for A',
        },
      ],
    },
  ])('ignores $buttonName results after the active data mart changes', async testCase => {
    const generation = deferred<{ name: string; alias?: string; description?: string }[]>();
    testCase.generate.mockReturnValueOnce(generation.promise);

    testState.outletContext = createContext('data-mart-a', createSchema(false));
    const { rerender } = render(
      <DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />
    );

    fireEvent.click(screen.getByRole('button', { name: testCase.buttonName }));
    expect(testCase.generate).toHaveBeenCalledWith('data-mart-a');

    testState.outletContext = createContext('data-mart-b', createSchema(true));
    rerender(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    await waitFor(() => {
      expect(screen.getByTestId('schema-field')).toHaveTextContent('hidden::');
    });

    await act(async () => {
      generation.resolve(testCase.response);
      await generation.promise;
    });

    expect(screen.getByTestId('schema-field')).toHaveTextContent('hidden::');
    expect(screen.getByTestId('schema-field')).not.toHaveTextContent(/generated for A/i);
  });

  it('applies a generated alias when an empty value changes from undefined to an empty string', async () => {
    const generation = deferred<{ name: string; alias: string }[]>();
    testState.generateAllFieldAliases.mockReturnValueOnce(generation.promise);
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate field aliases' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));

    await act(async () => {
      generation.resolve([{ name: 'id', alias: 'Generated alias' }]);
      await generation.promise;
    });

    expect(screen.getByTestId('schema-field')).toHaveTextContent('visible:Generated alias:');
  });

  it('does not overwrite an existing alias cleared while generation is pending', async () => {
    const generation = deferred<{ name: string; alias: string }[]>();
    testState.generateAllFieldAliases.mockReturnValueOnce(generation.promise);
    testState.outletContext = createContext('data-mart-a', createSchema(false, 'Existing alias'));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate field aliases' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));

    await act(async () => {
      generation.resolve([{ name: 'id', alias: 'Generated alias' }]);
      await generation.promise;
    });

    expect(screen.getByTestId('schema-field')).toHaveTextContent('visible::');
    expect(screen.getByTestId('schema-field')).not.toHaveTextContent('Generated alias');
  });

  it.each([
    {
      buttonName: 'Generate field descriptions',
      generate: testState.generateAllFieldDescriptions,
      schema: createSchema(false, undefined, 'Existing description'),
      response: [{ name: 'id', description: 'Generated description' }],
      message:
        'No field descriptions were applied. Values may already be filled or fields may have changed during generation.',
    },
    {
      buttonName: 'Generate field aliases',
      generate: testState.generateAllFieldAliases,
      schema: createSchema(false, 'Existing alias'),
      response: [{ name: 'id', alias: 'Generated alias' }],
      message:
        'No field aliases were applied. Values may already be filled or fields may have changed during generation.',
    },
    {
      buttonName: 'Generate field aliases & descriptions',
      generate: testState.generateAllFieldMetadata,
      schema: createSchema(false, 'Existing alias', 'Existing description'),
      response: [{ name: 'id', alias: 'Generated alias', description: 'Generated description' }],
      message:
        'No field aliases or descriptions were applied. Values may already be filled or fields may have changed during generation.',
    },
  ])('reports when $buttonName produces no applicable changes', async testCase => {
    testCase.generate.mockResolvedValueOnce(testCase.response);
    testState.outletContext = createContext('data-mart-a', testCase.schema);

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    fireEvent.click(screen.getByRole('button', { name: testCase.buttonName }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(testCase.message);
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports when duplicate field names prevent all generated updates', async () => {
    const schema = createSchema(false);
    schema.fields.push({ ...schema.fields[0] });
    testState.generateAllFieldAliases.mockResolvedValueOnce([
      { name: 'id', alias: 'Generated alias' },
    ]);
    testState.outletContext = createContext('data-mart-a', schema);

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate field aliases' }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        'No generated field metadata was applied because duplicate field names cannot be matched reliably.'
      );
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports duplicate field names when other generated updates are applied', async () => {
    const schema = createSchema(false);
    schema.fields.push({ ...schema.fields[0] }, { ...schema.fields[0], name: 'date' });
    testState.generateAllFieldAliases.mockResolvedValueOnce([
      { name: 'id', alias: 'Generated ID alias' },
      { name: 'date', alias: 'Generated date alias' },
    ]);
    testState.outletContext = createContext('data-mart-a', schema);

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate field aliases' }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        'Some fields were skipped because duplicate field names cannot be matched reliably.'
      );
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('DataMartSchemaSettings calculated-field save feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Marks the schema dirty (via the mocked SchemaContent's own field-change button) and clicks
   * Save — the Save button is disabled until something is dirty, same as in the app. */
  function markDirtyAndSave() {
    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  }

  it('shows every violation from a rejected save, grouped by field', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    context.updateDataMartSchema = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Calculated field validation failed',
          errorDetails: {
            errors: [
              {
                code: 'FORMULA_LEVEL_MIXING',
                field: 'ctr',
                message: '`cost` is a row-level column.',
              },
              {
                code: 'FORMULA_UNKNOWN_REFERENCE',
                field: 'roas',
                message: '`spnd` no longer exists.',
              },
            ],
          },
        },
      },
    });
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    markDirtyAndSave();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ctr');
    });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('`cost` is a row-level column.');
    expect(banner).toHaveTextContent('roas');
    expect(banner).toHaveTextContent('`spnd` no longer exists.');
  });

  it('shows a successful save’s warnings as non-blocking, distinct from an error', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    context.updateDataMartSchema = vi.fn().mockResolvedValue({
      warnings: [
        {
          code: 'FORMULA_UNGUARDED_DIVISION',
          field: 'ctr',
          message: 'Guard the denominator.',
        },
      ],
    });
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    markDirtyAndSave();

    await waitFor(() => {
      expect(screen.getByText('Guard the denominator.', { exact: false })).toBeInTheDocument();
    });
    // A warning must never look like a failure: no destructive `role="alert"` banner, and the
    // Save button is not left disabled by anything the warning itself does.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears a previous warning once a later save returns none', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    const updateDataMartSchema = vi
      .fn()
      .mockResolvedValueOnce({
        warnings: [
          { code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard the denominator.' },
        ],
      })
      .mockResolvedValueOnce({ warnings: [] });
    context.updateDataMartSchema = updateDataMartSchema;
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    markDirtyAndSave();
    await waitFor(() => {
      expect(screen.getByText('Guard the denominator.', { exact: false })).toBeInTheDocument();
    });

    markDirtyAndSave();
    await waitFor(() => {
      expect(updateDataMartSchema).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText('Guard the denominator.', { exact: false })).not.toBeInTheDocument();
  });

  it('renders every violation for a field that has two, not just the first', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    context.updateDataMartSchema = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          errorDetails: {
            errors: [
              {
                code: 'FORMULA_UNBALANCED_PARENTHESIS',
                field: 'ctr',
                message: 'Unclosed `SUM(`.',
              },
              {
                code: 'FORMULA_UNGUARDED_DIVISION',
                field: 'ctr',
                message: 'Guard the denominator.',
              },
            ],
          },
        },
      },
    });
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    markDirtyAndSave();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unclosed');
    });
    const banner = screen.getByRole('alert');
    // Both violations must render — collapsing the nested-list branch to `messages[0]` (the exact
    // hazard this test pins) would still contain the first message's text, but not the second.
    expect(banner).toHaveTextContent('Unclosed `SUM(`.');
    expect(banner).toHaveTextContent('Guard the denominator.');
  });

  it('keeps unsaved edits and an enabled Save button after a rejected save', async () => {
    // A real isLoading:true→false transition, and `error` that stays null exactly like the
    // reducer's real UPDATE_DATA_MART_SCHEMA_ERROR case (Critical 1: a schema-save rejection
    // must NOT populate the shared `error` DataMartDetails also reads for its 403 → <NoAccess/>
    // guard). A static context (like `createContext` above) never re-runs
    // useOperationState's effect at all, so it could not have caught the original bug where a
    // failed save was misread as a success and silently reverted the edit.
    const updateDataMartSchemaImpl = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          errorDetails: {
            errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
          },
        },
      },
    });

    function Harness() {
      const [isLoading, setIsLoading] = useState(false);
      // A STABLE reference: useSchemaState resets local schema/isDirty whenever `initialSchema`
      // changes identity, so a fresh object here on every isLoading-driven re-render would revert
      // the edit anyway — for a reason unrelated to the bug this test targets.
      const [schema] = useState(() => createSchema(false, 'Existing alias'));
      testState.outletContext = {
        dataMart: { id: 'data-mart-a', schema, storage: { type: DataStorageType.GOOGLE_BIGQUERY } },
        isLoading,
        error: null,
        isSchemaActualizationLoading: false,
        updateDataMartSchema: async (
          id: string,
          schemaArg: DataMartSchema,
          config?: Record<string, unknown>
        ) => {
          setIsLoading(true);
          try {
            return await updateDataMartSchemaImpl(id, schemaArg, config);
          } finally {
            setIsLoading(false);
          }
        },
        registerSchemaGuard: vi.fn(),
        runGuarded: vi.fn(),
      } as unknown as DataMartContextType;
      return <DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />;
    }

    render(<Harness />);
    expect(screen.getByTestId('schema-field')).toHaveTextContent('visible:Existing alias:');

    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
    expect(screen.getByTestId('schema-field')).toHaveTextContent('visible::');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ctr');
    });
    // The headline bug this task fixed: a failed save must not be misread as a success and
    // silently discard the edit. If it were, the schema would have reverted to 'Existing alias'
    // and Save would be disabled again. `waitFor` (not a synchronous assertion) gives a stray
    // extra render — e.g. a delayed reset-on-success effect — every chance to still show up.
    await waitFor(() => {
      expect(screen.getByTestId('schema-field')).toHaveTextContent('visible::');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    // Give any further pending effects one more tick before declaring this settled.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.getByTestId('schema-field')).toHaveTextContent('visible::');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  /**
   * A save sends a SNAPSHOT and the analyst keeps working: applying a formula while the request is
   * in flight is ordinary, not a race a user would recognise. What comes back describes the
   * snapshot, and everything that reacts to a successful save — the reset-on-success effect, the
   * new `initialSchema` the context publishes, the follow-up actualization — reverts the live
   * schema to it and clears `isDirty`, so the analyst is told the save succeeded, the formula is
   * gone, and the unsaved-changes guard has nothing to warn about.
   *
   * `guardSave` protects itself (it marks its own snapshot saved); the Save button did not.
   */
  describe('an edit applied while the save is in flight', () => {
    /** Renders the page with a save the test resolves by hand, over a real isLoading transition. */
    function renderWithDeferredSave() {
      const inFlight = deferred<{ warnings: never[] }>();
      const runSchemaActualization = vi.fn().mockResolvedValue(undefined);

      function Harness() {
        const [isLoading, setIsLoading] = useState(false);
        // What the context believes is stored. Stable identity until a save publishes a new one —
        // exactly what UPDATE_DATA_MART_SCHEMA_SUCCESS does, and the identity change is what makes
        // useSchemaState reset the live schema to it.
        const [savedSchema, setSavedSchema] = useState<DataMartSchema>(() => createSchema(false));
        testState.outletContext = {
          dataMart: {
            id: 'data-mart-a',
            schema: savedSchema,
            storage: { type: DataStorageType.GOOGLE_BIGQUERY },
          },
          isLoading,
          error: null,
          isSchemaActualizationLoading: false,
          runSchemaActualization,
          updateDataMartSchema: async (_id: string, schemaArg: DataMartSchema) => {
            setIsLoading(true);
            try {
              return await inFlight.promise;
            } finally {
              setSavedSchema(schemaArg);
              setIsLoading(false);
            }
          },
          registerSchemaGuard: vi.fn(),
          runGuarded: vi.fn(),
        } as unknown as DataMartContextType;
        return <DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />;
      }

      render(<Harness />);
      return { inFlight, runSchemaActualization };
    }

    async function settle(inFlight: ReturnType<typeof deferred<{ warnings: never[] }>>) {
      await act(async () => {
        inFlight.resolve({ warnings: [] });
        await inFlight.promise;
      });
      // One more tick, so a reset arriving a render late still shows up here.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    }

    it('keeps the formula on screen and the page dirty', async () => {
      const { inFlight } = renderWithDeferredSave();

      fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add metric ctr' }));
      expect(screen.getByTestId('draft-calculated-fields')).toHaveTextContent('ctr=SUM(clicks)');

      await settle(inFlight);

      expect(screen.getByTestId('draft-calculated-fields')).toHaveTextContent('ctr=SUM(clicks)');
      // Dirty is the guard's only signal: with it cleared, navigating away discards the formula
      // without asking.
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    // Actualization replaces the schema with the warehouse's own, which would take the unsaved
    // formula with it — a second way to lose the same edit, past the reset above.
    it('does not actualize the schema on top of it', async () => {
      const { inFlight, runSchemaActualization } = renderWithDeferredSave();

      fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add metric ctr' }));

      await settle(inFlight);

      expect(runSchemaActualization).not.toHaveBeenCalled();
    });

    // Guard the guard: an untouched save must still settle exactly as before.
    it('still clears dirty and actualizes when nothing was applied meanwhile', async () => {
      const { inFlight, runSchemaActualization } = renderWithDeferredSave();

      fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await settle(inFlight);

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(runSchemaActualization).toHaveBeenCalled();
    });
  });

  it('guardSave (the unsaved-changes guard) surfaces field-grouped errors, like the Save button', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    context.updateDataMartSchema = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          errorDetails: {
            errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
          },
        },
      },
    });
    const registerSchemaGuard = vi.fn();
    context.registerSchemaGuard = registerSchemaGuard;
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    const registration = registerSchemaGuard.mock.calls.at(-1)?.[0] as {
      save: () => Promise<unknown>;
    };
    await act(async () => {
      await registration.save().catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ctr');
    });
  });

  it('guardDiscard (the unsaved-changes guard) clears a previous save error banner, like Discard', async () => {
    const context = createContext('data-mart-a', createSchema(false));
    context.updateDataMartSchema = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          errorDetails: {
            errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
          },
        },
      },
    });
    const registerSchemaGuard = vi.fn();
    context.registerSchemaGuard = registerSchemaGuard;
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    markDirtyAndSave();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const registration = registerSchemaGuard.mock.calls.at(-1)?.[0] as { discard: () => unknown };
    act(() => {
      registration.discard();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DataMartSchemaSettings joined formula fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.blendableSchema = undefined;
    testState.blendableSchemaIsError = false;
  });

  it('publishes the joined Data Marts’ fields to the schema tables below it', () => {
    testState.blendableSchema = {
      blendedFields: [
        { aliasPath: 'orders', originalFieldName: 'amount' },
        { aliasPath: 'orders.items', originalFieldName: 'qty' },
      ],
    };
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('joined-formula-fields')).toHaveTextContent(
      'orders.amount,orders.items.qty'
    );
    expect(screen.getByTestId('joined-formula-status')).toHaveTextContent('ready');
  });

  // Without this the formula editor's live check has no Data Mart to ask about, and silently
  // never runs — the context defaults to '' precisely so a table outside this page asks nothing.
  it('tells the schema tables which Data Mart a formula belongs to', () => {
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('formula-data-mart-id')).toHaveTextContent('data-mart-a');
  });

  it('asks for the Data Mart currently being edited', () => {
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(testState.useBlendableSchema).toHaveBeenCalledWith('data-mart-a');
  });

  it('reports a Data Mart that joins nothing as ready, not as unknown', () => {
    testState.blendableSchema = { blendedFields: [] };
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('joined-formula-fields')).toBeEmptyDOMElement();
    expect(screen.getByTestId('joined-formula-status')).toHaveTextContent('ready');
  });

  it('publishes nothing, as still loading, while the blendable schema has not arrived', () => {
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('joined-formula-fields')).toBeEmptyDOMElement();
    expect(screen.getByTestId('joined-formula-status')).toHaveTextContent('loading');
  });

  it('publishes a failed fetch as unavailable, so no empty list reads as "joins nothing"', () => {
    testState.blendableSchemaIsError = true;
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('joined-formula-status')).toHaveTextContent('unavailable');
  });
});

describe('DataMartSchemaSettings broken calculated fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.blendableSchema = undefined;
    testState.blendableSchemaIsError = false;
  });

  /** A saved schema whose `ctr` metric is exactly the one the backend judged broken. */
  function createSchemaWithSavedMetric(): BigQueryDataMartSchema {
    const schema = createSchema(false);
    schema.fields.push(buildMetricField('SUM(clicks)'));
    return schema;
  }

  it('publishes the backend’s verdict for a metric whose formula is still the saved one', () => {
    testState.blendableSchema = {
      blendedFields: [],
      calculatedFieldIssues: [{ field: 'ctr', missing: ['clicks'] }],
    };
    testState.outletContext = createContext('data-mart-a', createSchemaWithSavedMetric());

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);

    expect(screen.getByTestId('calculated-field-issues')).toHaveTextContent('ctr:clicks');
  });

  it('does not mark a metric the analyst has only just added — the verdict predates it', () => {
    // The stale entry the caveat is about: the backend judged a `ctr` that the saved schema below
    // does not have, and the analyst adds one with that name.
    testState.blendableSchema = {
      blendedFields: [],
      calculatedFieldIssues: [{ field: 'ctr', missing: ['clicks'] }],
    };
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    expect(screen.getByTestId('calculated-field-issues')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Add metric ctr' }));

    expect(screen.getByTestId('calculated-field-issues')).toBeEmptyDOMElement();
  });

  /**
   * The live formula check resolves references against the schema it is GIVEN, and this page
   * defers its save — so a metric added in this session has to travel with the request or the
   * check answers "`ctr` no longer exists in the Data Mart" about a formula that is right there.
   */
  it('publishes a metric added in this session, before anything is saved', () => {
    testState.outletContext = createContext('data-mart-a', createSchema(false));

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    expect(screen.getByTestId('draft-calculated-fields')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Add metric ctr' }));

    expect(screen.getByTestId('draft-calculated-fields')).toHaveTextContent('ctr=SUM(clicks)');
  });

  it('drops the verdict the moment its formula is edited, and does not re-derive one', () => {
    testState.blendableSchema = {
      blendedFields: [],
      calculatedFieldIssues: [{ field: 'ctr', missing: ['clicks'] }],
    };
    testState.outletContext = createContext('data-mart-a', createSchemaWithSavedMetric());

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    expect(screen.getByTestId('calculated-field-issues')).toHaveTextContent('ctr:clicks');

    fireEvent.click(screen.getByRole('button', { name: 'Edit ctr formula' }));

    expect(screen.getByTestId('calculated-field-issues')).toBeEmptyDOMElement();
  });

  it('refetches the blendable schema after a save, so a fixed metric stops reading as broken', async () => {
    const context = createContext('data-mart-a', createSchemaWithSavedMetric());
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(testState.invalidateBlendableSchema).toHaveBeenCalled();
    });
  });

  it('does not refetch it after a save the backend rejected', async () => {
    const context = createContext('data-mart-a', createSchemaWithSavedMetric());
    context.updateDataMartSchema = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          errorDetails: {
            errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
          },
        },
      },
    });
    testState.outletContext = context;

    render(<DataMartSchemaSettings definitionType={DataMartDefinitionType.SQL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set alias empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(testState.invalidateBlendableSchema).not.toHaveBeenCalled();
  });
});
