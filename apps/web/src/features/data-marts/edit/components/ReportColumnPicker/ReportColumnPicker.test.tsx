import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';
import { ReportColumnPicker } from './ReportColumnPicker';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  AvailableSource,
  BlendableSchema,
  BlendedField,
} from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getBlendableSchema: vi.fn(),
  },
}));

const DATA_MART_ID = 'dm-root';

function buildAvailableSource(overrides: Partial<AvailableSource> = {}): AvailableSource {
  return {
    aliasPath: 'b',
    title: 'Joined DM',
    description: undefined,
    defaultAlias: 'Joined DM',
    depth: 1,
    fieldCount: 1,
    isIncluded: true,
    relationshipId: 'rel-1',
    dataMartId: 'dm-1',
    isAccessibleForReporting: true,
    ...overrides,
  };
}

function buildBlendedField(overrides: Partial<BlendedField> = {}): BlendedField {
  return {
    name: 'b__some_field',
    sourceRelationshipId: 'rel-1',
    sourceDataMartId: 'dm-1',
    sourceDataMartTitle: 'Joined DM',
    targetAlias: 'b',
    originalFieldName: 'some_field',
    type: 'STRING',
    alias: '',
    description: '',
    isHidden: false,
    aggregateFunction: 'STRING_AGG',
    transitiveDepth: 1,
    aliasPath: 'b',
    outputPrefix: 'Joined DM',
    ...overrides,
  };
}

function buildSchema(overrides: Partial<BlendableSchema> = {}): BlendableSchema {
  return {
    nativeFields: [{ name: 'native_one', type: 'STRING' }] as unknown[],
    nativeDescription: undefined,
    blendedFields: [],
    availableSources: [],
    ...overrides,
  };
}

function renderPicker(
  schema: BlendableSchema,
  value: string[] | null,
  props: Partial<ComponentProps<typeof ReportColumnPicker>> = {}
) {
  vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const onChange = vi.fn();
  const utils = render(
    <ReportColumnPicker dataMartId={DATA_MART_ID} value={value} onChange={onChange} {...props} />,
    { wrapper }
  );
  return { ...utils, onChange, client };
}

describe('ReportColumnPicker access flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an accessible blended source normally with all of its fields visible', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({ name: 'b__field_a', originalFieldName: 'field_a' }),
        buildBlendedField({ name: 'b__field_b', originalFieldName: 'field_b' }),
      ],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: true })],
    });

    renderPicker(schema, ['b__field_a']);

    expect(screen.getByRole('button', { name: /Collapse Joined DM/ })).toBeInTheDocument();
    expect(screen.getByText('field_a')).toBeInTheDocument();
    expect(screen.getByText('field_b')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('You do not have access to this data mart')
    ).not.toBeInTheDocument();
  });

  it('hides an inaccessible source entirely when nothing is selected from it', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__field_a', originalFieldName: 'field_a' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, []);

    expect(screen.queryByText('Joined DM')).not.toBeInTheDocument();
    expect(screen.queryByText('field_a')).not.toBeInTheDocument();
  });

  it('renders an inaccessible source with destructive styling, an alert icon, and only its selected fields', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({ name: 'b__keep', originalFieldName: 'keep' }),
        buildBlendedField({ name: 'b__hide_me', originalFieldName: 'hide_me' }),
      ],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, ['b__keep']);

    expect(screen.getByLabelText('You do not have access to this data mart')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Collapse Joined DM/ });
    const block = trigger.parentElement;
    expect(block).not.toBeNull();
    expect(block!.className).toMatch(/border-destructive/);
    expect(block!.className).toMatch(/bg-destructive\/10/);

    const title = within(block!).getByText('Joined DM');
    expect(title.className).toMatch(/text-destructive/);

    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(screen.queryByText('hide_me')).not.toBeInTheDocument();
  });

  it('Select all toggles only accessible fields and preserves already-selected inaccessible ones', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__yes',
          originalFieldName: 'yes',
          aliasPath: 'b',
          outputPrefix: 'b',
          targetAlias: 'b',
          sourceRelationshipId: 'rel-b',
          sourceDataMartId: 'dm-b',
        }),
        buildBlendedField({
          name: 'c__no_new',
          originalFieldName: 'no_new',
          aliasPath: 'c',
          outputPrefix: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
        buildBlendedField({
          name: 'c__keep',
          originalFieldName: 'keep',
          aliasPath: 'c',
          outputPrefix: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
      ],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'b',
          relationshipId: 'rel-b',
          dataMartId: 'dm-b',
          isAccessibleForReporting: true,
        }),
        buildAvailableSource({
          aliasPath: 'c',
          title: 'Locked DM',
          relationshipId: 'rel-c',
          dataMartId: 'dm-c',
          isAccessibleForReporting: false,
        }),
      ],
    });

    const { onChange } = renderPicker(schema, ['c__keep']);

    const masterCheckbox = screen.getByRole('checkbox', { name: 'Select all fields' });
    fireEvent.click(masterCheckbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as string[];
    expect(next).toEqual(expect.arrayContaining(['native_one', 'b__yes', 'c__keep']));
    expect(next).not.toContain('c__no_new');
  });

  it('removes the inaccessible block from the DOM after the last selected field is unchecked', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__only', originalFieldName: 'only' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    const { rerender, onChange } = renderPicker(schema, ['b__only']);

    const fieldLabel = screen.getByText('only').closest('label');
    expect(fieldLabel).not.toBeNull();
    const fieldCheckbox = within(fieldLabel!).getByRole('checkbox');

    fireEvent.click(fieldCheckbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(next).not.toContain('b__only');

    rerender(<ReportColumnPicker dataMartId={DATA_MART_ID} value={next} onChange={() => {}} />);

    expect(screen.queryByText('Joined DM')).not.toBeInTheDocument();
    expect(screen.queryByText('only')).not.toBeInTheDocument();
  });
});

describe('ReportColumnPicker unresolved columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists selected columns missing from the schema in a Disconnected columns block', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'page__pageGroup' })],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'page_hash__pageGroup', 'page_hash__pagePath']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('page_hash__pageGroup')).toBeInTheDocument();
    expect(within(block as HTMLElement).getByText('page_hash__pagePath')).toBeInTheDocument();
  });

  it('removes an unresolved column from the report when its checkbox is unchecked', () => {
    const schema = buildSchema();

    const { onChange } = renderPicker(schema, ['native_one', 'gone__field']);

    const row = screen.getByText('gone__field').closest('label');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(['native_one']);
  });

  it('does not render the block when every selected column resolves against the schema', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__some_field' })],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'b__some_field']);

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('treats hidden-for-reporting nested native fields as disconnected', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        {
          name: 'user',
          type: 'RECORD',
          fields: [
            { name: 'email', type: 'STRING' },
            { name: 'secret_child', type: 'STRING', isHiddenForReporting: true },
          ],
        },
      ] as unknown[],
    });

    renderPicker(schema, ['native_one', 'user.email', 'user.secret_child']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('user.secret_child')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('user.email')).not.toBeInTheDocument();
    expect(screen.getAllByText('user.secret_child')).toHaveLength(1);
  });

  it('treats DISCONNECTED native fields as disconnected columns', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        { name: 'legacy', type: 'STRING', status: 'DISCONNECTED' },
      ] as unknown[],
    });

    renderPicker(schema, ['native_one', 'legacy']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('legacy')).toBeInTheDocument();
    expect(screen.getAllByText('legacy')).toHaveLength(1);
  });

  it('treats blended fields hidden in the joined data marts setup as disconnected', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
        buildBlendedField({ name: 'b__visible_field', originalFieldName: 'visible_field' }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, ['native_one', 'b__hidden_field', 'b__visible_field']);

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('b__hidden_field')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('b__visible_field')).not.toBeInTheDocument();
  });

  it('does not treat excluded-source blended fields as unresolved', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'c__excluded_field',
          originalFieldName: 'excluded_field',
          aliasPath: 'c',
          targetAlias: 'c',
          sourceRelationshipId: 'rel-c',
          sourceDataMartId: 'dm-c',
        }),
      ],
      availableSources: [
        buildAvailableSource({
          aliasPath: 'c',
          relationshipId: 'rel-c',
          dataMartId: 'dm-c',
          isIncluded: false,
        }),
      ],
    });

    renderPicker(schema, ['native_one', 'c__excluded_field']);

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('shows a filter-only reference to a missing column as a disconnected row with its filter', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [{ column: 'ghost__col', operator: 'eq', value: 'x' }] as never,
          sortConfig: [],
          limitConfig: null,
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');
    const row = within(block as HTMLElement)
      .getByText('ghost__col')
      .closest('label');
    expect(row).not.toBeNull();
    const checkbox = within(row as HTMLElement).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Manage filters and slices' })
    ).toBeInTheDocument();
  });

  it('keeps a sort-only reference out of disconnected columns and removable in output settings', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const onOutputConfigChange = vi.fn();

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [],
          sortConfig: [{ column: 'ghost__sort', direction: 'asc' }],
          limitConfig: null,
        }}
        onOutputConfigChange={onOutputConfigChange}
      />,
      { wrapper }
    );

    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));

    expect(screen.getByText('ghost__sort')).toBeInTheDocument();
    expect(screen.getByLabelText('Column not found in schema')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove sort' }));

    expect(onOutputConfigChange).toHaveBeenCalledWith({
      filterConfig: [],
      sortConfig: [],
      limitConfig: null,
    });
  });

  it('flags filters on hidden blended fields as disconnected but not filters on known columns', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
      ],
      availableSources: [buildAvailableSource()],
    });
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [
            { column: 'b__hidden_field', operator: 'eq', value: 'x' },
            { column: 'native_one', operator: 'eq', value: 'y' },
          ] as never,
          sortConfig: [],
          limitConfig: null,
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    expect(within(block as HTMLElement).getByText('b__hidden_field')).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('native_one')).not.toBeInTheDocument();
  });

  it('flags pre-join slices on hidden joined fields as disconnected with the slice removable', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__hidden_field',
          originalFieldName: 'hidden_field',
          isHidden: true,
        }),
        buildBlendedField({ name: 'b__visible_field', originalFieldName: 'visible_field' }),
      ],
      availableSources: [buildAvailableSource()],
    });
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        value={['native_one', 'b__visible_field']}
        onChange={() => {}}
        outputConfig={{
          filterConfig: [
            {
              column: 'b__hidden_field',
              operator: 'eq',
              value: 'x',
              placement: 'pre-join',
            },
            {
              column: 'b__visible_field',
              operator: 'eq',
              value: 'y',
              placement: 'pre-join',
            },
          ],
          sortConfig: [],
          limitConfig: null,
        }}
        onOutputConfigChange={() => {}}
      />,
      { wrapper }
    );

    const block = screen.getByText('Disconnected columns').closest('div[class*="border"]');
    expect(block).not.toBeNull();
    const row = within(block as HTMLElement)
      .getByText('b__hidden_field')
      .closest('label');
    expect(row).not.toBeNull();
    const checkbox = within(row as HTMLElement).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(
      within(row as HTMLElement).getByRole('button', { name: 'Manage filters and slices' })
    ).toBeInTheDocument();
    expect(within(block as HTMLElement).queryByText('b__visible_field')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Disconnected output controls')).toHaveTextContent('2');
  });

  it('shows a neutral output controls count when all controls resolve', () => {
    const schema = buildSchema();

    renderPicker(schema, ['native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [{ column: 'native_one', operator: 'eq', value: 'ok' }] as never,
        sortConfig: [],
        limitConfig: null,
      },
      onOutputConfigChange: () => {},
    });

    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('1');
    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();
  });

  it('does not mark output controls on inaccessible but known blended fields as disconnected', () => {
    const schema = buildSchema({
      blendedFields: [buildBlendedField({ name: 'b__field', originalFieldName: 'field' })],
      availableSources: [buildAvailableSource({ isAccessibleForReporting: false })],
    });

    renderPicker(schema, ['native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [
          { column: 'b__field', operator: 'eq', value: 'x' },
          { column: 'b__field', operator: 'eq', value: 'y', placement: 'pre-join' },
        ],
        sortConfig: [],
        limitConfig: null,
      },
      onOutputConfigChange: () => {},
    });

    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('2');
    expect(screen.queryByLabelText('Disconnected output controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Disconnected columns')).not.toBeInTheDocument();
  });

  it('counts unresolved columns in both selected and total', () => {
    const schema = buildSchema();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(schema);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([BLENDABLE_SCHEMA_QUERY_KEY, DATA_MART_ID], schema);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const onCountChange = vi.fn();
    render(
      <ReportColumnPicker
        dataMartId={DATA_MART_ID}
        value={['native_one', 'gone__field']}
        onChange={() => {}}
        onCountChange={onCountChange}
      />,
      { wrapper }
    );

    expect(onCountChange).toHaveBeenLastCalledWith({ selected: 2, total: 2 });
  });
});
