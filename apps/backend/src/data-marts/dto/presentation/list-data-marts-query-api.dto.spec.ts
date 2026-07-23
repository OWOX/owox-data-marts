import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OwnerFilter } from '../../enums/owner-filter.enum';
import { ListDataMartsQueryApiDto } from './list-data-marts-query-api.dto';

describe('ListDataMartsQueryApiDto', () => {
  it.each([
    ['a negative offset', { offset: '-1' }, 'offset'],
    ['a fractional offset', { offset: '1.5' }, 'offset'],
    ['a blank offset', { offset: '' }, 'offset'],
    ['a whitespace offset', { offset: '  ' }, 'offset'],
    ['an exponent offset', { offset: '1e2' }, 'offset'],
    ['a hexadecimal offset', { offset: '0x10' }, 'offset'],
    ['an unknown owner filter', { ownerFilter: 'all' }, 'ownerFilter'],
  ])('rejects %s', async (_label, input, expectedProperty) => {
    const query = plainToInstance(ListDataMartsQueryApiDto, input);

    await expect(validate(query)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: expectedProperty })])
    );
  });

  it('transforms a valid offset and accepts the public owner filter values', async () => {
    const query = plainToInstance(ListDataMartsQueryApiDto, {
      offset: '25',
      ownerFilter: OwnerFilter.HAS_OWNERS,
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toEqual({
      offset: 25,
      ownerFilter: OwnerFilter.HAS_OWNERS,
    });
  });
});
