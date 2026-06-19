import { buildBlendedFieldIndex } from './blended-field-index';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

function schema(
  blendedFields: Array<{
    name: string;
    aliasPath: string;
    originalFieldName: string;
    type: string;
    isHidden?: boolean;
  }>,
  availableSources: Array<{ aliasPath: string; isIncluded?: boolean }> = []
) {
  return { blendedFields, availableSources } as never;
}

describe('buildBlendedFieldIndex', () => {
  it('keys by unified name and preserves nested-struct dots in originalFieldName', () => {
    const index = buildBlendedFieldIndex(
      schema(
        [
          {
            name: 'category_details__item_event_count',
            aliasPath: 'category.details',
            originalFieldName: 'item.event_count',
            type: 'INTEGER',
          },
        ],
        [{ aliasPath: 'category.details', isIncluded: true }]
      )
    );
    expect(index.get('category_details__item_event_count')).toEqual({
      aliasPath: 'category.details',
      cteName: 'category_details',
      originalFieldName: 'item.event_count',
      type: 'INTEGER',
      isIncluded: true,
    });
  });

  it('marks fields of excluded sources as isIncluded=false but still indexes them', () => {
    const index = buildBlendedFieldIndex(
      schema(
        [{ name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' }],
        [{ aliasPath: 'users', isIncluded: false }]
      )
    );
    expect(index.get('users__role')?.isIncluded).toBe(false);
  });

  it('omits hidden fields', () => {
    const index = buildBlendedFieldIndex(
      schema([
        {
          name: 'users__secret',
          aliasPath: 'users',
          originalFieldName: 'secret',
          type: 'STRING',
          isHidden: true,
        },
      ])
    );
    expect(index.has('users__secret')).toBe(false);
  });

  it('throws when two distinct (aliasPath, field) pairs fold to the same unified name', () => {
    // Both fold to 'users__archived__role' because the `__` separator can appear
    // inside an alias segment or a field name — last-write-wins would silently
    // resolve a slice to the wrong column/CTE.
    expect(() =>
      buildBlendedFieldIndex(
        schema(
          [
            {
              name: 'users__archived__role',
              aliasPath: 'users__archived',
              originalFieldName: 'role',
              type: 'STRING',
            },
            {
              name: 'users__archived__role',
              aliasPath: 'users',
              originalFieldName: 'archived__role',
              type: 'STRING',
            },
          ],
          [
            { aliasPath: 'users__archived', isIncluded: true },
            { aliasPath: 'users', isIncluded: true },
          ]
        )
      )
    ).toThrow(BusinessViolationException);
  });
});
