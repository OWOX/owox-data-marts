import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CredentialAiRequestApiDto } from './credential-ai-api.dto';

async function invalidProperties(payload: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CredentialAiRequestApiDto, payload));
  return errors.map(error => error.property);
}

describe('CredentialAiRequestApiDto', () => {
  it.each(['fast', 'reasoning', 'embedding', 'decision'])('accepts the %s model', async model => {
    expect(await invalidProperties({ version: 1, model, options: {} })).toEqual([]);
  });

  it.each(['box', 'chat', ''])('rejects the %j model', async model => {
    expect(await invalidProperties({ version: 1, model, options: {} })).toEqual(['model']);
  });
});
