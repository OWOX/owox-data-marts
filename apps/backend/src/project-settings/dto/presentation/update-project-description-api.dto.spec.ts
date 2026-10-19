import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectDescriptionApiDto } from './update-project-description-api.dto';

describe('UpdateProjectDescriptionApiDto revision precondition', () => {
  it.each([
    [undefined, true],
    [0, true],
    [5, true],
    [null, false],
    [-1, false],
    [1.5, false],
    ['0', false],
  ])('validates optional revision %j', async (expectedRevision, valid) => {
    const request = plainToInstance(UpdateProjectDescriptionApiDto, {
      description: null,
      expectedRevision,
    });
    const errors = await validate(request);
    expect(errors.length === 0).toBe(valid);
  });
});
