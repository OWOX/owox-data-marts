import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Props as SortableContextProps } from '@dnd-kit/sortable/dist/components/SortableContext';
import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Columns3 } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../../shared/components/CollapsibleCard';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  DataMartSchemaFieldStatus,
  type BigQuerySchemaField,
} from '../../../shared/types/data-mart-schema.types';
import { SchemaTable } from './tables/SchemaTable';
import { useRecordExpansion } from './hooks/useRecordExpansion';
import { findSchemaFieldReference } from './schema-field-reference';
import { SchemaFieldReferenceProvider } from './SchemaFieldReferenceProvider';
import type { SchemaToolbar } from './types/schema-toolbar';

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useOutletContext: () => ({ isSchemaActualizationLoading: false, dataMart: { id: 'mart' } }),
}));

const field = (name: string, extra: Partial<BigQuerySchemaField> = {}): BigQuerySchemaField => ({
  name,
  alias: name,
  type: BigQueryFieldType.NUMERIC,
  mode: BigQueryFieldMode.NULLABLE,
  status: DataMartSchemaFieldStatus.CONNECTED,
  isPrimaryKey: false,
  ...extra,
});
const fields = [
  field('gross_revenue'),
  field('net_revenue', { alias: 'Net revenue', calculated: { formula: '1' } }),
  field('customer', {
    type: BigQueryFieldType.RECORD,
    fields: [
      field('street', { type: BigQueryFieldType.STRING }),
      field('address', {
        type: BigQueryFieldType.STRUCT,
        fields: [field('street', { type: BigQueryFieldType.STRING })],
      }),
    ],
  }),
];
const toolbar: SchemaToolbar = {
  showAiHelper: false,
  refresh: { disabled: false, onClick: vi.fn() },
  ai: {
    disabled: true,
    loading: { metadata: false, aliases: false, descriptions: false },
    onGenerateMetadata: vi.fn(),
    onGenerateDescriptions: vi.fn(),
    onGenerateAliases: vi.fn(),
  },
};

function NestedTable({
  schemaFields,
  flat = false,
}: {
  schemaFields: BigQuerySchemaField[];
  flat?: boolean;
}) {
  const { flattenedFields, toggleRecordExpansion } = useRecordExpansion(schemaFields);
  return (
    <>
      <button
        onClick={() => {
          toggleRecordExpansion('2');
        }}
      >
        Toggle customer
      </button>
      <SchemaTable
        fields={flat ? schemaFields : flattenedFields}
        columns={[
          { id: 'name', accessorKey: 'name', header: 'Name', cell: ({ row }) => row.original.name },
          { id: 'alias', header: 'Alias', cell: ({ row }) => row.original.alias },
        ]}
        onAddRow={() => undefined}
        dragContext={({ children }: SortableContextProps) => <>{children}</>}
        dragContextProps={{ items: [], strategy: verticalListSortingStrategy }}
        schemaToolbar={toolbar}
      />
    </>
  );
}

function Navigation({
  name,
  navigationKey = 'first',
  schemaFields = fields,
  flat = false,
}: {
  name?: string;
  navigationKey?: string;
  schemaFields?: BigQuerySchemaField[];
  flat?: boolean;
}) {
  return (
    <CollapsibleCard collapsible name='output-schema'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={Columns3}>Output Schema</CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <SchemaFieldReferenceProvider
          fieldName={name}
          navigationKey={navigationKey}
          fields={schemaFields}
        >
          <NestedTable schemaFields={schemaFields} flat={flat} />
        </SchemaFieldReferenceProvider>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}

const scroll = vi.fn();
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
  });
  scroll.mockClear();
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scroll);
});

describe('output-schema field links', () => {
  it('navigates a flat schema and treats URL-special characters as an exact field name', async () => {
    const name = 'metric / ? & " + %';
    const { container } = render(<Navigation name={name} flat schemaFields={[field(name)]} />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector('[data-referenced-field]')).toHaveAttribute(
      'data-referenced-field',
      name
    );
  });
  it('temporarily opens the card and reveals the name without overwriting the saved layout', async () => {
    localStorage.setItem('collapsed-card-output-schema', 'true');
    localStorage.setItem(
      'data-mart-schema-column-visibility-mart',
      JSON.stringify({ name: false })
    );
    const { container, rerender } = render(<Navigation name='net_revenue' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(1);
    });
    expect(localStorage.getItem('collapsed-card-output-schema')).toBe('true');
    const cell = container.querySelector('[data-referenced-field="net_revenue"]');
    expect(cell).toHaveTextContent('net_revenue');
    expect(cell?.className).toContain('bg-background');
    expect(cell?.className).toContain('from-primary/10');
    expect(cell?.closest('tr')?.className).not.toContain('[&>td]:bg-primary');
    expect(JSON.parse(localStorage.getItem('data-mart-schema-column-visibility-mart')!)).toEqual({
      name: false,
    });
    expect(scroll.mock.instances[0]).toBe(cell?.closest('tr'));
    rerender(<Navigation />);
    expect(container.querySelector('[data-referenced-field]')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
    expect(localStorage.getItem('collapsed-card-output-schema')).toBe('true');
    // Explicitly opening the card still saves the user's choice.
    fireEvent.click(screen.getByText('Output Schema'));
    expect(localStorage.getItem('collapsed-card-output-schema')).toBe('false');
  });

  it('expands only the parents of the exact nested field with a repeated leaf name', async () => {
    const { container } = render(<Navigation name='customer.address.street' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(1);
    });
    const cells = container.querySelectorAll('[data-referenced-field]');
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveAttribute('data-referenced-field', 'customer.address.street');
    expect(findSchemaFieldReference(fields, 'customer.address.street')?.parentPaths).toEqual([
      '2',
      '2.1',
    ]);
  });

  it.each([undefined, '', 'deleted_metric', 'Net revenue', 'net', 'NET_REVENUE'])(
    'leaves the ordinary page unchanged for missing or non-exact field %s',
    async name => {
      localStorage.setItem('collapsed-card-output-schema', 'true');
      const { container } = render(<Navigation name={name} />);
      expect(container.querySelector('[data-referenced-field]')).toBeNull();
      expect(localStorage.getItem('collapsed-card-output-schema')).toBe('true');
      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(scroll).not.toHaveBeenCalled();
    }
  );

  it('waits for the schema and handles a second link without rescrolling on unrelated renders', async () => {
    const { rerender, container } = render(<Navigation name='net_revenue' schemaFields={[]} />);
    expect(scroll).not.toHaveBeenCalled();
    rerender(<Navigation name='net_revenue' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(1);
    });
    rerender(<Navigation name='net_revenue' schemaFields={[...fields]} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gross' } });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    rerender(<Navigation name='net_revenue' schemaFields={[...fields]} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toHaveValue('gross');
    rerender(<Navigation name='gross_revenue' navigationKey='second' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(2);
    });
    expect(container.querySelector('[data-referenced-field]')).toHaveAttribute(
      'data-referenced-field',
      'gross_revenue'
    );
    rerender(
      <Navigation name='gross_revenue' navigationKey='second' schemaFields={fields.slice(1)} />
    );
    expect(container.querySelector('[data-referenced-field]')).toBeNull();
  });

  it('keeps a manually collapsed record closed during schema edits until another navigation', async () => {
    const { container, rerender } = render(<Navigation name='customer.address.street' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledOnce();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle customer' }));
    expect(container.querySelector('[data-referenced-field]')).toBeNull();
    rerender(<Navigation name='customer.address.street' schemaFields={[...fields]} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(container.querySelector('[data-referenced-field]')).toBeNull();
    expect(scroll).toHaveBeenCalledOnce();
    rerender(<Navigation name='customer.address.street' navigationKey='second' />);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalledTimes(2);
    });
  });

  it('resolves present hidden or disconnected fields without changing their reporting status', () => {
    const hidden = field('hidden', { isHiddenForReporting: true });
    const disconnected = field('disconnected', { status: DataMartSchemaFieldStatus.DISCONNECTED });
    expect(findSchemaFieldReference([hidden, disconnected], 'hidden')?.path).toBe('0');
    expect(findSchemaFieldReference([hidden, disconnected], 'disconnected')?.path).toBe('1');
    expect(hidden.isHiddenForReporting).toBe(true);
    expect(disconnected.status).toBe(DataMartSchemaFieldStatus.DISCONNECTED);
  });
});
