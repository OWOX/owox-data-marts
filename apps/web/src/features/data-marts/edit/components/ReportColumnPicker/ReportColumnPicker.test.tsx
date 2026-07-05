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
import type { OutputConfig } from '../../../shared/types/output-config';

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
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: false,
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
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: false,
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
      aggregationConfig: [],
      dateTruncConfig: [],
      uniqueCountConfig: false,
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
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: false,
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
          aggregationConfig: [],
          dateTruncConfig: [],
          uniqueCountConfig: false,
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
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
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
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
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

describe('ReportColumnPicker aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const aggSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'native_one', type: 'STRING' },
        { name: 'revenue', type: 'INTEGER' },
        { name: 'ordered_at', type: 'TIMESTAMP' },
      ] as unknown[],
    });

  it('AGG button badge counts aggregation + date-trunc only (Row Count excluded — automatic)', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue', 'ordered_at'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [{ column: 'native_one', operator: 'eq', value: 'x' }] as never,
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [
          { column: 'revenue', function: 'SUM' },
          { column: 'revenue', function: 'AVG' },
        ],
        dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    // AGG badge = 2 aggregations + 1 date-trunc = 3 (Row Count is automatic, not counted).
    expect(screen.getByLabelText('Aggregations count')).toHaveTextContent('3');
    // Output controls badge counts only the filter (1), NOT aggregation.
    expect(screen.getByLabelText('Output controls count')).toHaveTextContent('1');
  });

  it('opens the AGG panel (with aggregation controls) on click; neither panel has a row-count toggle', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    // Output controls panel: no row-count toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Output controls' }));
    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();

    // AGG panel: no row-count toggle (Row Count is automatic).
    fireEvent.click(screen.getByRole('button', { name: 'Aggregations' }));
    expect(screen.queryByLabelText('Add a Row Count metric')).not.toBeInTheDocument();
  });

  it('shows a per-row AGG icon on a selected aggregatable field, hidden on an unselected one', () => {
    renderPicker(aggSchema(), ['revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    const selectedRow = screen.getByText('revenue').closest('label') as HTMLElement;
    expect(
      within(selectedRow).getByRole('button', { name: 'Add aggregation' })
    ).toBeInTheDocument();

    // ordered_at is NOT selected → no AGG icon on its row.
    const unselectedRow = screen.getByText('ordered_at').closest('label') as HTMLElement;
    expect(
      within(unselectedRow).queryByRole('button', { name: /aggregation/i })
    ).not.toBeInTheDocument();
  });

  it('materializes columnConfig to the explicit selection when an aggregation is applied while columns are implicit (null = all)', async () => {
    const { onChange } = renderPicker(aggSchema(), null, {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    // Apply SUM on the numeric `revenue` field via its per-row Σ.
    const revenueRow = screen.getByText('revenue').closest('label') as HTMLElement;
    fireEvent.click(within(revenueRow).getByRole('button', { name: 'Add aggregation' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'SUM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    // Backend rejects a null columnConfig with aggregations → the picker materializes the
    // implicit "all selected" to the explicit native column list so the report stays saveable.
    expect(onChange).toHaveBeenCalledWith(['native_one', 'revenue', 'ordered_at']);
  });

  it('emits columnConfig in the picker DISPLAY order, not the order fields were toggled on', () => {
    // Schema/display order is native_one, revenue, ordered_at. Start with an out-of-order
    // selection and toggle one more on — the emitted config must be re-sorted to display order.
    const { onChange } = renderPicker(aggSchema(), ['revenue', 'native_one'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
    });

    const row = screen.getByText('ordered_at').closest('label') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onChange).toHaveBeenLastCalledWith(['native_one', 'revenue', 'ordered_at']);
  });

  it('hides the per-row AGG icon when the field has an empty allowed-aggregation set', () => {
    const schema = buildSchema({
      nativeFields: [{ name: 'locked', type: 'INTEGER', allowedAggregations: [] }] as unknown[],
    });

    renderPicker(schema, ['locked'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    const row = screen.getByText('locked').closest('label') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /aggregation/i })).not.toBeInTheDocument();
  });

  it('renders AGG button before Output Controls button in DOM order', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    const aggBtn = screen.getByRole('button', { name: 'Aggregations' });
    const outputBtn = screen.getByRole('button', { name: 'Output controls' });
    expect(
      aggBtn.compareDocumentPosition(outputBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('applies blue class to Sigma icon when aggregations are present; no AGG text label', () => {
    renderPicker(aggSchema(), ['native_one', 'revenue'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: {
        filterConfig: [],
        sortConfig: [],
        limitConfig: null,
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dateTruncConfig: [],
        uniqueCountConfig: false,
      },
      onOutputConfigChange: () => {},
    });

    const aggBtn = screen.getByRole('button', { name: 'Aggregations' });
    // Sigma svg has text-blue-500 when active.
    const sigmaIcon = aggBtn.querySelector('svg');
    expect(sigmaIcon).not.toBeNull();
    expect(sigmaIcon!.getAttribute('class')).toMatch(/text-blue-500/);
    // The "AGG" text label is gone.
    expect(
      Array.from(aggBtn.querySelectorAll('span')).find(el => el.textContent === 'AGG')
    ).toBeUndefined();
    // Badge count is visible.
    expect(screen.getByLabelText('Aggregations count')).toBeInTheDocument();
  });
});

describe('ReportColumnPicker Unique count virtual row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pkSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ] as unknown[],
    });

  const noPkSchema = () =>
    buildSchema({
      nativeFields: [
        { name: 'col_a', type: 'STRING' },
        { name: 'col_b', type: 'INTEGER' },
      ] as unknown[],
    });

  const baseOutputConfig: OutputConfig = {
    filterConfig: [],
    sortConfig: [],
    limitConfig: null,
    aggregationConfig: [],
    dateTruncConfig: [],
    uniqueCountConfig: false,
  };

  it('renders the Unique count row when the schema has a PK field and outputControlsAvailable', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.getByText('Unique count')).toBeInTheDocument();
  });

  it('does NOT render the Unique count row when the schema has no PK field', () => {
    renderPicker(noPkSchema(), ['col_a', 'col_b'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    expect(screen.queryByText('Unique count')).not.toBeInTheDocument();
  });

  it('does NOT render the Unique count row when outputControlsAvailable is false (no onOutputConfigChange)', () => {
    renderPicker(pkSchema(), ['id', 'name']);

    expect(screen.queryByText('Unique count')).not.toBeInTheDocument();
  });

  it('toggling the Unique count checkbox calls onOutputConfigChange with uniqueCountConfig: true', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const row = screen.getByText('Unique count').closest('label')!;
    const checkbox = within(row).getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: true })
    );
  });

  it('toggling the Unique count checkbox back calls onOutputConfigChange with uniqueCountConfig: false', () => {
    const onOutputConfigChange = vi.fn();
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: true },
      onOutputConfigChange,
    });

    const row = screen.getByText('Unique count').closest('label')!;
    const checkbox = within(row).getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
    expect(onOutputConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: false })
    );
  });

  it('shows the Σ indicator (and no COUNT_DISTINCT text) when uniqueCountConfig is true', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: true },
      onOutputConfigChange: vi.fn(),
    });

    const row = screen.getByText('Unique count').closest('label')!;
    // The metric Σ icon is shown (matching the other aggregated columns): a blue indicator
    // box (text-blue-500 like the native RowAggregationIcon) containing the Sigma svg…
    const indicator = row.querySelector('.text-blue-500');
    expect(indicator).not.toBeNull();
    expect(indicator!.querySelector('svg')).not.toBeNull();
    // …but the raw COUNT_DISTINCT function token is not surfaced.
    expect(screen.queryByText('COUNT_DISTINCT')).not.toBeInTheDocument();
  });

  it('does not show the Σ indicator when uniqueCountConfig is false', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: false },
      onOutputConfigChange: vi.fn(),
    });

    const row = screen.getByText('Unique count').closest('label')!;
    expect(row.querySelector('.text-blue-500')).toBeNull();
  });

  it('renders the Unique count row at the bottom of the data mart fields (after the native fields)', () => {
    renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange: vi.fn(),
    });

    const uniqueRow = screen.getByText('Unique count');
    const lastNativeField = screen.getByText('name');
    // Unique count follows the native fields in DOM order (it sits at the bottom of the mart).
    expect(
      lastNativeField.compareDocumentPosition(uniqueRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('toggling Unique count does NOT call onChange (column selection must not change)', () => {
    const onOutputConfigChange = vi.fn();
    const { onChange } = renderPicker(pkSchema(), ['id', 'name'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const row = screen.getByText('Unique count').closest('label')!;
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onChange).not.toHaveBeenCalled();
    expect(onOutputConfigChange).toHaveBeenCalledTimes(1);
  });

  it('Unique count row does not affect the native column count (selectedNativeCount / onCountChange)', () => {
    const onCountChange = vi.fn();
    renderPicker(pkSchema(), ['id'], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig, uniqueCountConfig: true },
      onOutputConfigChange: vi.fn(),
      onCountChange,
    });

    // selectedNativeCount is 1 (only 'id' is selected), totalFieldsCount is 2 (id + name).
    // uniqueCountConfig:true must not inflate these counts.
    expect(onCountChange).toHaveBeenLastCalledWith({ selected: 1, total: 2 });
  });

  it('Unique count row is NOT included in Select all', () => {
    const onOutputConfigChange = vi.fn();
    const { onChange } = renderPicker(pkSchema(), [], {
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      outputConfig: { ...baseOutputConfig },
      onOutputConfigChange,
    });

    const masterCheckbox = screen.getByRole('checkbox', { name: 'Select all fields' });
    fireEvent.click(masterCheckbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const selected = onChange.mock.calls[0][0] as string[];
    // Only real native field names, no virtual row
    expect(selected).not.toContain('Unique count');
    expect(selected).toContain('id');
    expect(selected).toContain('name');
    // uniqueCountConfig must remain unchanged
    expect(onOutputConfigChange).not.toHaveBeenCalled();
  });
});

describe('ReportColumnPicker search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects only the visible search results when Select all is clicked', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
        buildBlendedField({
          name: 'b__sessions',
          originalFieldName: 'sessions',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    const { onChange } = renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'city' },
    });

    expect(screen.getByText('city')).toBeInTheDocument();
    expect(screen.queryByText('country')).not.toBeInTheDocument();
    expect(screen.queryByText('revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('sessions')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all fields' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['city']);
  });

  it('shows a message when no columns match the search', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'does-not-exist' },
    });

    expect(screen.getByText('No matching columns found.')).toBeInTheDocument();

    expect(screen.queryByText('country')).not.toBeInTheDocument();
    expect(screen.queryByText('city')).not.toBeInTheDocument();
    expect(screen.queryByText('revenue')).not.toBeInTheDocument();
  });

  it('restores all columns after clearing the search', () => {
    const schema = buildSchema({
      nativeFields: [
        { name: 'country', type: 'STRING' },
        { name: 'city', type: 'STRING' },
      ] as unknown[],
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    const input = screen.getByRole('textbox', { name: 'Search columns' });

    fireEvent.change(input, {
      target: { value: 'city' },
    });

    expect(screen.queryByText('country')).not.toBeInTheDocument();

    fireEvent.change(input, {
      target: { value: '' },
    });

    expect(screen.getByText('country')).toBeInTheDocument();
    expect(screen.getByText('city')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Joined DM' })).toBeInTheDocument();
  });

  it('filters blended fields by the search query', () => {
    const schema = buildSchema({
      blendedFields: [
        buildBlendedField({
          name: 'b__revenue',
          originalFieldName: 'revenue',
        }),
        buildBlendedField({
          name: 'b__sessions',
          originalFieldName: 'sessions',
        }),
      ],
      availableSources: [buildAvailableSource()],
    });

    renderPicker(schema, []);

    expect(screen.getByRole('button', { name: 'Expand Joined DM' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search columns' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Search columns' }), {
      target: { value: 'revenue' },
    });

    expect(screen.getByRole('button', { name: 'Collapse Joined DM' })).toBeInTheDocument();

    expect(screen.getByText('revenue')).toBeInTheDocument();
    expect(screen.queryByText('sessions')).not.toBeInTheDocument();
  });
});
