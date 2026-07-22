import type { ReactNode } from 'react';
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

const testState = vi.hoisted(() => ({
  outletContext: null as unknown,
  toast: vi.fn(),
  generateAllFieldDescriptions: vi.fn(),
  generateAllFieldAliases: vi.fn(),
  generateAllFieldMetadata: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: testState.toast,
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useOutletContext: () => testState.outletContext,
  };
});

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
    return (
      <>
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
