import { BadRequestException } from '@nestjs/common';
import {
  rethrowTranslatedOutputControlsError,
  translateOutputControlsError,
} from './output-controls-error.mapper';

function validatorError(errors: Array<Record<string, unknown>>): BadRequestException {
  return new BadRequestException({
    message: 'Output controls validation failed',
    details: { errors },
  });
}

describe('translateOutputControlsError', () => {
  it('translates FILTER_COLUMN_UNKNOWN into schema-lookup guidance', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'bad_col' }])
    );
    expect(translated).toMatchObject({ code: 'field_not_found' });
    expect(translated?.message).toContain('get_data_mart_details_by_id');
  });

  it('translates AGGREGATION_REQUIRES_COLUMN_CONFIG into a fields-list fix', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' }])
    );
    expect(translated).toMatchObject({ code: 'fields_required_for_aggregation' });
    expect(translated?.message).toContain("fields ['*']");
  });

  it('translates NOT_SELECTED codes naming the columns, without a schema re-fetch hint', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'AGGREGATION_COLUMN_NOT_SELECTED', column: 'revenue' }])
    );
    expect(translated).toMatchObject({ code: 'field_not_selected' });
    expect(translated?.message).toContain('revenue');
    expect(translated?.message).toContain('do not re-fetch the schema');
  });

  it('returns null for a BadRequestException without recognized validation errors', () => {
    expect(translateOutputControlsError(new BadRequestException('plain message'))).toBeNull();
    expect(translateOutputControlsError(validatorError([{ code: 'SOMETHING_ELSE' }]))).toBeNull();
  });
});

describe('rethrowTranslatedOutputControlsError', () => {
  it('rethrows a recognized validator error with the translated message', () => {
    const err = validatorError([
      { code: 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART', column: 'source' },
    ]);
    expect(() => rethrowTranslatedOutputControlsError(err)).toThrow(BadRequestException);
    expect(() => rethrowTranslatedOutputControlsError(err)).toThrow(
      /no joined\/blended sources.*Move these predicates to "filters"/
    );
  });

  it('rethrows unrecognized errors unchanged', () => {
    const plain = new Error('boom');
    expect(() => rethrowTranslatedOutputControlsError(plain)).toThrow(plain);
    const unrecognized = new BadRequestException('name is required');
    expect(() => rethrowTranslatedOutputControlsError(unrecognized)).toThrow('name is required');
  });
});
