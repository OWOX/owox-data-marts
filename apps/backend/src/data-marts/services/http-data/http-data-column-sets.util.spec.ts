import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import { nativeColumnNames, visibleBlendedColumnNames } from './http-data-column-sets.util';

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
