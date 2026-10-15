import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PluginActionExecutionQueryApiDto } from './plugin-action-api.dto';

describe('PluginActionExecutionQueryApiDto', () => {
  const parse = async (query: Record<string, unknown>) => {
    const dto = plainToInstance(PluginActionExecutionQueryApiDto, query);
    return { waitSeconds: dto.waitSeconds, errors: await validate(dto) };
  };

  it.each([
    [{}, undefined],
    [{ waitSeconds: '0' }, 0],
    [{ waitSeconds: '20' }, 20],
    // Clamped, not refused: the cap can change without breaking published SDKs.
    [{ waitSeconds: '21' }, 20],
    [{ waitSeconds: '999' }, 20],
  ])('reads %j as %s', async (query, waitSeconds) => {
    await expect(parse(query)).resolves.toEqual({ waitSeconds, errors: [] });
  });

  it.each(['-1', 'abc', '1.5', '', ['1', '2']])('refuses waitSeconds=%j', async waitSeconds => {
    const { errors } = await parse({ waitSeconds });

    expect(errors.map(error => error.property)).toEqual(['waitSeconds']);
  });
});
