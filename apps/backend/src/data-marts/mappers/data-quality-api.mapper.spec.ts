import { BadRequestException } from '@nestjs/common';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualityApiMapper } from './data-quality-api.mapper';

describe('DataQualityApiMapper', () => {
  const mapper = new DataQualityApiMapper();
  const config = {
    timezone: 'UTC',
    rules: [
      {
        key: 'empty_table:data_mart',
        category: DataQualityCategory.EMPTY_TABLE,
        scope: { type: DataQualityScope.DATA_MART },
        severity: DataQualitySeverity.ERROR,
        enabled: true,
        parameters: {},
      },
    ],
  };

  it('Zod-parses a complete unversioned replacement config', () => {
    expect(mapper.toReplacementConfig(config)).toEqual(config);
    expect(mapper.toReplacementConfig(null)).toBeNull();
  });

  it('returns a typed 400 for malformed replacement config', () => {
    expect(() => mapper.toReplacementConfig({ ...config, timezone: 'Mars/Olympus' })).toThrow(
      BadRequestException
    );
  });

  it('distinguishes Run from Save & Run, including a null preset reset', () => {
    expect(mapper.toRunInput({})).toEqual({ hasConfig: false });
    expect(mapper.toRunInput({ config })).toEqual({ hasConfig: true, config });
    expect(mapper.toRunInput({ config: null })).toEqual({ hasConfig: true, config: null });
  });

  it('rejects unknown Run fields instead of silently dropping them', () => {
    expect(() => mapper.toRunInput({ configuration: config })).toThrow(BadRequestException);
  });

  it('deduplicates batch ids in stable request order', () => {
    expect(mapper.toBatchIds({ dataMartIds: ['b', 'a', 'b'] })).toEqual(['b', 'a']);
  });

  it('rejects more than 200 unique batch ids', () => {
    expect(() =>
      mapper.toBatchIds({ dataMartIds: Array.from({ length: 201 }, (_, index) => `dm-${index}`) })
    ).toThrow(BadRequestException);
  });

  it('applies the 200 cap after stable de-duplication', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `dm-${index}`);
    expect(mapper.toBatchIds({ dataMartIds: [...ids, ...ids] })).toHaveLength(200);
  });
});
