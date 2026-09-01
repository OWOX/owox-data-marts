import { BadRequestException } from '@nestjs/common';
import { normalizeAiConfiguration } from './create-credential.service';

describe('normalizeAiConfiguration', () => {
  it('keeps an omitted AI configuration empty for a non-AI Credential definition', () => {
    expect(normalizeAiConfiguration(undefined, undefined, undefined)).toEqual({
      mappings: null,
      modes: null,
    });
  });

  it('keeps an explicitly empty AI configuration empty for a non-AI Credential definition', () => {
    expect(normalizeAiConfiguration({}, {}, undefined)).toEqual({
      mappings: null,
      modes: null,
    });
  });

  it('rejects model mappings for a non-AI Credential definition', () => {
    expect(() =>
      normalizeAiConfiguration({ fast: 'provider-model' }, { fast: 'override' }, undefined)
    ).toThrow(BadRequestException);
  });
});
