import { validate } from 'class-validator';
import { RunDataMartRequestApiDto } from './run-data-mart-request-api.dto';

describe('RunDataMartRequestApiDto', () => {
  it('rejects a primitive payload that cannot satisfy the documented object contract', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), { payload: 'not-an-object' });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ isObject: expect.any(String) }),
        }),
      ])
    );
  });

  it('rejects a payload larger than the documented one-megabyte limit', async () => {
    const dto = Object.assign(new RunDataMartRequestApiDto(), {
      payload: { value: 'x'.repeat(1024 * 1024) },
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'payload',
          constraints: expect.objectContaining({ maxJsonSize: expect.any(String) }),
        }),
      ])
    );
  });
});
