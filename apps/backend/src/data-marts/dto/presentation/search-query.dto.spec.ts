import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto } from './search-query.dto';

async function validateQuery(payload: Record<string, unknown>) {
  const dto = plainToInstance(SearchQueryDto, payload);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('SearchQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('coerces excludeDrafts=%s to %s', async (input, expected) => {
    const { dto, errors } = await validateQuery({ q: 'revenue', excludeDrafts: input });

    expect(errors).toHaveLength(0);
    expect(dto.excludeDrafts).toBe(expected);
  });

  it.each(['1', 'yes', 'True'])('rejects invalid excludeDrafts=%s', async input => {
    const { errors } = await validateQuery({ q: 'revenue', excludeDrafts: input });

    expect(errors.map(error => error.property)).toContain('excludeDrafts');
  });
});
