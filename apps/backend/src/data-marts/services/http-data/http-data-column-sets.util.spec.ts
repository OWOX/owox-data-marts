import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
  columnsAmbiguousWithShownFields,
  hiddenFieldsNamedBy,
  implicitAllBlendedColumnNames,
  implicitAllNativeColumnNames,
  nativeColumnNames,
  visibleBlendedColumnNames,
} from './http-data-column-sets.util';

function schemaOf(partial: Partial<BlendableSchemaDto>): BlendableSchemaDto {
  return {
    nativeFields: [],
    blendedFields: [],
    availableSources: [],
    ...partial,
  } as BlendableSchemaDto;
}

describe('nativeColumnNames', () => {
  it('returns flat native field names', () => {
    const schema = schemaOf({ nativeFields: [{ name: 'date' }, { name: 'revenue' }] as never });
    expect(nativeColumnNames(schema)).toEqual(['date', 'revenue']);
  });

  it('flattens nested fields into parent and dotted leaf paths', () => {
    const schema = schemaOf({
      nativeFields: [{ name: 'user', fields: [{ name: 'id' }, { name: 'name' }] }] as never,
    });
    expect(nativeColumnNames(schema)).toEqual(['user', 'user.id', 'user.name']);
  });

  it('excludes fields hidden from reporting at any nesting level', () => {
    const schema = schemaOf({
      nativeFields: [
        { name: 'date' },
        { name: 'secret', isHiddenForReporting: true },
        { name: 'user', fields: [{ name: 'id' }, { name: 'ssn', isHiddenForReporting: true }] },
      ] as never,
    });
    expect(nativeColumnNames(schema)).toEqual(['date', 'user', 'user.id']);
  });

  it('excludes fields with DISCONNECTED status', () => {
    const schema = schemaOf({
      nativeFields: [
        { name: 'date', status: DataMartSchemaFieldStatus.CONNECTED },
        { name: 'gone', status: DataMartSchemaFieldStatus.DISCONNECTED },
      ] as never,
    });
    expect(nativeColumnNames(schema)).toEqual(['date']);
  });

  it('includes a calculated field — it is a real, selectable field', () => {
    const schema = schemaOf({
      nativeFields: [
        { name: 'clicks' },
        { name: 'ctr', calculated: { formula: '{{ref field="clicks"}}', level: 'metric' } },
      ] as never,
    });
    expect(nativeColumnNames(schema)).toEqual(['clicks', 'ctr']);
  });
});

describe('implicitAllNativeColumnNames', () => {
  it('excludes a calculated field — composed only when asked for by name', () => {
    const schema = schemaOf({
      nativeFields: [
        { name: 'clicks' },
        { name: 'country' },
        { name: 'ctr', calculated: { formula: '{{ref field="clicks"}}', level: 'metric' } },
      ] as never,
    });
    expect(implicitAllNativeColumnNames(schema)).toEqual(['clicks', 'country']);
    // The full set still carries it, for existence-checking an EXPLICIT selection against.
    expect(nativeColumnNames(schema)).toEqual(['clicks', 'country', 'ctr']);
  });

  it('otherwise matches nativeColumnNames (nested paths, hidden, disconnected fields alike)', () => {
    const schema = schemaOf({
      nativeFields: [
        { name: 'date' },
        { name: 'secret', isHiddenForReporting: true },
        { name: 'gone', status: DataMartSchemaFieldStatus.DISCONNECTED },
        { name: 'user', fields: [{ name: 'id' }] },
      ] as never,
    });
    expect(implicitAllNativeColumnNames(schema)).toEqual(nativeColumnNames(schema));
    expect(implicitAllNativeColumnNames(schema)).toEqual(['date', 'user', 'user.id']);
  });
});

describe('visibleBlendedColumnNames', () => {
  const schema = schemaOf({
    availableSources: [
      { aliasPath: 'orders', isIncluded: true, isAccessibleForReporting: true },
      { aliasPath: 'archive', isIncluded: false, isAccessibleForReporting: true },
    ] as never,
    blendedFields: [
      { name: 'orders__cost', aliasPath: 'orders', isHidden: false } as never,
      { name: 'orders__secret', aliasPath: 'orders', isHidden: true } as never,
      { name: 'archive__old', aliasPath: 'archive', isHidden: false } as never,
    ],
  });

  it('keeps only non-hidden fields from included sources', () => {
    expect(visibleBlendedColumnNames(schema)).toEqual(['orders__cost']);
  });

  it('excludes fields from sources inaccessible for reporting', () => {
    const schema = schemaOf({
      availableSources: [
        { aliasPath: 'orders', isIncluded: true, isAccessibleForReporting: true },
        { aliasPath: 'secret', isIncluded: true, isAccessibleForReporting: false },
      ] as never,
      blendedFields: [
        { name: 'orders__cost', aliasPath: 'orders', isHidden: false } as never,
        { name: 'secret__margin', aliasPath: 'secret', isHidden: false } as never,
      ],
    });

    expect(visibleBlendedColumnNames(schema)).toEqual(['orders__cost']);
  });
});

describe('implicitAllBlendedColumnNames', () => {
  // The blended half of named-selection-only. Without it, an unchanged `columns=**` integration starts
  // failing the day an analyst adds a formula to a JOINED Data Mart: the field lands in the
  // wildcard expansion, and the blended path then refuses the projection by name — a 400 on a
  // request nobody touched.
  it('excludes a calculated field of a joined Data Mart', () => {
    const schema = schemaOf({
      availableSources: [
        { aliasPath: 'orders', isIncluded: true, isAccessibleForReporting: true },
      ] as never,
      blendedFields: [
        { name: 'orders__cost', aliasPath: 'orders', isHidden: false } as never,
        {
          name: 'orders__margin',
          aliasPath: 'orders',
          isHidden: false,
          isCalculated: true,
        } as never,
      ],
    });

    expect(implicitAllBlendedColumnNames(schema)).toEqual(['orders__cost']);
    // The full visible set still carries it, so an EXPLICIT request for it gets the named
    // "calculated field of a joined Data Mart" refusal rather than a bare "Unknown column".
    expect(visibleBlendedColumnNames(schema)).toEqual(['orders__cost', 'orders__margin']);
  });

  it('otherwise matches visibleBlendedColumnNames (hidden, excluded and inaccessible sources alike)', () => {
    const schema = schemaOf({
      availableSources: [
        { aliasPath: 'orders', isIncluded: true, isAccessibleForReporting: true },
        { aliasPath: 'archive', isIncluded: false, isAccessibleForReporting: true },
        { aliasPath: 'secret', isIncluded: true, isAccessibleForReporting: false },
      ] as never,
      blendedFields: [
        { name: 'orders__cost', aliasPath: 'orders', isHidden: false } as never,
        { name: 'orders__secret', aliasPath: 'orders', isHidden: true } as never,
        { name: 'archive__old', aliasPath: 'archive', isHidden: false } as never,
        { name: 'secret__margin', aliasPath: 'secret', isHidden: false } as never,
      ],
    });

    expect(implicitAllBlendedColumnNames(schema)).toEqual(visibleBlendedColumnNames(schema));
    expect(implicitAllBlendedColumnNames(schema)).toEqual(['orders__cost']);
  });
});

describe('hiddenFieldsNamedBy', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;
  const fields = [
    { name: 'obligation_id', status: connected, isHiddenForReporting: true },
    { name: 'note', status: connected, isHiddenForReporting: true },
    { name: 'date', status: connected },
    {
      name: 'profile',
      type: 'RECORD',
      status: connected,
      isHiddenForReporting: true,
      fields: [{ name: 'email', status: connected }],
    },
    {
      name: 'billing',
      type: 'RECORD',
      status: connected,
      fields: [{ name: 'user_id', status: connected, isHiddenForReporting: true }],
    },
  ] as never;

  it('returns the hidden columns the selection or any clause names, once each', () => {
    expect(
      hiddenFieldsNamedBy(fields, {
        columnSelector: { mode: 'explicit', explicit: ['obligation_id', 'date'] },
        filter: [{ column: 'obligation_id', operator: 'eq', value: 42 }] as never,
        sort: [{ column: 'note', direction: 'asc' }] as never,
      })
    ).toEqual(['obligation_id', 'note']);
  });

  it.each([
    ['a filter', { filter: [{ column: 'note', operator: 'eq', value: 'x' }] }],
    ['a sort', { sort: [{ column: 'note', direction: 'asc' }] }],
    ['an aggregation', { aggregation: [{ column: 'note', function: 'COUNT' }] }],
    ['a date bucket', { dateTrunc: [{ column: 'note', unit: 'month' }] }],
    ['a havingGroupBy column', { havingGroupBy: { column: ['note'] } }],
    [
      'a havingGroupBy date bucket',
      { havingGroupBy: { column: [], dateTrunc: [{ column: 'note', unit: 'month' }] } },
    ],
  ])('is named by %s alone, with no column selecting it', (_clause, clause) => {
    expect(
      hiddenFieldsNamedBy(fields, {
        columnSelector: { mode: 'allNative', explicit: [] },
        ...(clause as object),
      } as never)
    ).toEqual(['note']);
  });

  it('counts the explicit names beside a native wildcard', () => {
    expect(
      hiddenFieldsNamedBy(fields, {
        columnSelector: { mode: 'allNative', explicit: ['note'] },
      })
    ).toEqual(['note']);
  });

  it('returns nothing for a wildcard that names no column', () => {
    expect(hiddenFieldsNamedBy(fields, { columnSelector: { mode: 'allBlendable' } })).toEqual([]);
    expect(
      hiddenFieldsNamedBy(fields, { columnSelector: { mode: 'allNative', explicit: [] } })
    ).toEqual([]);
  });

  it('is not named by a pre-join filter, which slices a joined Data Mart column of that name', () => {
    expect(
      hiddenFieldsNamedBy(fields, {
        columnSelector: { mode: 'explicit', explicit: ['date'] },
        filter: [
          { column: 'note', operator: 'eq', value: 'x', placement: 'pre-join' },
          { column: 'obligation_id', operator: 'eq', value: 42, placement: 'post-join' },
        ] as never,
      })
    ).toEqual(['obligation_id']);
  });

  it('shows a hidden RECORD named as a whole, and no nested path', () => {
    expect(
      hiddenFieldsNamedBy(fields, {
        columnSelector: {
          mode: 'explicit',
          explicit: ['profile', 'profile.email', 'billing.user_id'],
        },
        filter: [{ column: 'billing.user_id', operator: 'eq', value: 'u' }] as never,
      })
    ).toEqual(['profile']);
  });
});

describe('columnsAmbiguousWithShownFields', () => {
  const shown = (...names: string[]) => new Set(names);

  it('reports a shown field whose name is the last segment of another selected column', () => {
    expect(columnsAmbiguousWithShownFields(['date', 'id', 'customer.id'], shown('id'))).toEqual([
      'id',
      'customer.id',
    ]);
  });

  it('compares names without regard to letter case, in either direction', () => {
    expect(
      columnsAmbiguousWithShownFields(['user_id', 'billing.USER_ID'], shown('user_id'))
    ).toEqual(['user_id', 'billing.USER_ID']);
    expect(
      columnsAmbiguousWithShownFields(['USER_ID', 'billing.user_id'], shown('USER_ID'))
    ).toEqual(['USER_ID', 'billing.user_id']);
  });

  it('reports a shown field whose name is an inner segment of another selected path', () => {
    // The reader would step into the `web_info` column on its way to `device.web_info.browser`.
    expect(
      columnsAmbiguousWithShownFields(['web_info', 'device.web_info.browser'], shown('web_info'))
    ).toEqual(['web_info', 'device.web_info.browser']);
    expect(
      columnsAmbiguousWithShownFields(['profile', 'metadata.profile.user_id'], shown('profile'))
    ).toEqual(['profile', 'metadata.profile.user_id']);
  });

  it('reports every column the shown field clashes with, as a wildcard brings them in', () => {
    expect(
      columnsAmbiguousWithShownFields(
        ['date', 'customer', 'customer.id', 'customer.name', 'order.id', 'id'],
        shown('id')
      )
    ).toEqual(['customer.id', 'order.id', 'id']);
  });

  it('lets a shown field be read beside RECORDs and paths that do not carry its name', () => {
    expect(
      columnsAmbiguousWithShownFields(
        ['date', 'customer', 'customer.name', 'customer.id_number', 'obligation_id'],
        shown('obligation_id')
      )
    ).toEqual([]);
  });

  it('leaves a projection with no shown field alone, whatever clashes in it', () => {
    expect(columnsAmbiguousWithShownFields(['id', 'customer.id'], shown())).toEqual([]);
    // Shown by a filter only: the field is not in the projection, so the row is what it was.
    expect(
      columnsAmbiguousWithShownFields(['profile.user_id', 'billing.user_id'], shown('user_id'))
    ).toEqual([]);
  });

  it('reports only the pairs a shown field takes part in', () => {
    expect(
      columnsAmbiguousWithShownFields(
        ['obligation_id', 'profile.user_id', 'billing.user_id'],
        shown('obligation_id')
      )
    ).toEqual([]);
  });

  it('reads an aggregated column by its label, not by its path', () => {
    const sumOf = (column: string) => [{ column, function: 'SUM' }] as never;
    // `amount | SUM` and `amount` are two different result names, whichever side is aggregated.
    expect(
      columnsAmbiguousWithShownFields(['x.amount', 'amount'], shown('amount'), sumOf('amount'))
    ).toEqual([]);
    expect(
      columnsAmbiguousWithShownFields(['x.amount', 'amount'], shown('amount'), sumOf('x.amount'))
    ).toEqual([]);
    // Without an aggregation both come back as `amount`.
    expect(columnsAmbiguousWithShownFields(['x.amount', 'amount'], shown('amount'))).toEqual([
      'x.amount',
      'amount',
    ]);
  });

  it('treats a joined column as one name, never as a path', () => {
    expect(columnsAmbiguousWithShownFields(['orders__amount', 'amount'], shown('amount'))).toEqual(
      []
    );
    expect(
      columnsAmbiguousWithShownFields(
        ['x.orders__amount', 'orders__amount'],
        shown('orders__amount')
      )
    ).toEqual(['x.orders__amount', 'orders__amount']);
  });
});
