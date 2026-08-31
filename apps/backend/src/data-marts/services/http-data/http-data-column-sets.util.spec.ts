import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
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
