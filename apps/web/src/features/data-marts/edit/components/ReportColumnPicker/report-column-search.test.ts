import { describe, expect, it } from 'vitest';
import { buildColumnSearchResult, matchesColumnSearch } from './report-column-search';
import type {
  BlendedField,
  BlendedGroup,
  NativeField,
} from '../../../shared/types/relationship.types';

function nativeField(name: string, alias?: string): NativeField {
  return {
    name,
    type: 'STRING',
    alias,
  };
}

function blendedField(originalFieldName: string, alias = ''): BlendedField {
  return {
    name: `b__${originalFieldName}`,
    originalFieldName,
    alias,
    type: 'STRING',
    description: '',
    isHidden: false,
    aggregateFunction: 'STRING_AGG',
    sourceRelationshipId: 'rel-1',
    sourceDataMartId: 'dm-1',
    sourceDataMartTitle: 'Joined DM',
    targetAlias: 'b',
    transitiveDepth: 1,
    aliasPath: 'b',
    outputPrefix: 'Joined DM',
  };
}

function blendedGroup(title: string, fields: BlendedField[], alias = title): BlendedGroup {
  return {
    aliasPath: 'b',
    title,
    alias,
    description: undefined,
    isAccessibleForReporting: true,
    visibleFields: fields,
    selectedCount: 0,
  };
}

describe('buildColumnSearchResult', () => {
  it('returns the original collections for an empty query', () => {
    const nativeFields = [nativeField('country'), nativeField('city')];

    const blendedGroups = [blendedGroup('Joined DM', [blendedField('revenue')])];

    const result = buildColumnSearchResult(nativeFields, blendedGroups, '');

    expect(result.visibleNativeFields).toBe(nativeFields);
    expect(result.visibleBlendedGroups).toBe(blendedGroups);
  });

  it('filters native fields', () => {
    const result = buildColumnSearchResult(
      [nativeField('country'), nativeField('city'), nativeField('campaign')],
      [],
      'city'
    );

    expect(result.visibleNativeFields.map(f => f.name)).toEqual(['city']);
  });

  it('keeps all fields when a group title matches', () => {
    const group = blendedGroup('Google Ads', [
      blendedField('campaign'),
      blendedField('cost'),
      blendedField('clicks'),
    ]);

    const result = buildColumnSearchResult([], [group], 'google');

    expect(result.visibleBlendedGroups).toHaveLength(1);
    expect(result.visibleBlendedGroups[0].visibleFields).toHaveLength(3);
  });

  it('keeps only matching fields when a field matches', () => {
    const result = buildColumnSearchResult(
      [],
      [
        blendedGroup('Google Ads', [
          blendedField('campaign'),
          blendedField('cost'),
          blendedField('clicks'),
        ]),
      ],
      'cost'
    );

    expect(result.visibleBlendedGroups).toHaveLength(1);
    expect(result.visibleBlendedGroups[0].visibleFields.map(f => f.originalFieldName)).toEqual([
      'cost',
    ]);
  });

  it('drops groups without matches', () => {
    const result = buildColumnSearchResult(
      [],
      [
        blendedGroup('Google Ads', [blendedField('campaign')]),
        blendedGroup('Facebook Ads', [blendedField('revenue')]),
      ],
      'city'
    );

    expect(result.visibleBlendedGroups).toEqual([]);
  });

  it('matches aliases case-insensitively', () => {
    const result = buildColumnSearchResult(
      [],
      [blendedGroup('Joined DM', [blendedField('ga_revenue', 'Revenue')])],
      '  rEvEnUe  '
    );

    expect(result.visibleBlendedGroups).toHaveLength(1);
    expect(result.visibleBlendedGroups[0].visibleFields[0].originalFieldName).toBe('ga_revenue');
  });
});

describe('matchesColumnSearch', () => {
  it('returns true for an empty query', () => {
    expect(matchesColumnSearch('country', '')).toBe(true);
  });

  it('matches values case-insensitively', () => {
    expect(matchesColumnSearch('Total Revenue', '  revenue  ')).toBe(true);
  });

  it('returns false when there is no match', () => {
    expect(matchesColumnSearch('country', 'sessions')).toBe(false);
  });
});
