import { describe, expect, it } from 'vitest';
import { credentialParameterNames } from './credentialParameters';

describe('credentialParameterNames', () => {
  it('includes parameters marked SECRET', () => {
    expect(
      credentialParameterNames({
        parameters: { ApiKey: { attributes: ['SECRET'] }, Region: {} },
      })
    ).toEqual(new Set(['ApiKey']));
  });

  // The parser marks these SECRET only when the manifest is saved, so the editor's copy of
  // the manifest does not say so yet.
  it('includes parameters the authentication block refers to', () => {
    expect(
      credentialParameterNames({
        parameters: { Token: {}, Region: {} },
        authentication: { type: 'bearer', token: 'Bearer {{ parameters.Token }}' },
      })
    ).toEqual(new Set(['Token']));
  });

  it('finds references inside nested and selective authenticators', () => {
    expect(
      credentialParameterNames({
        parameters: {},
        authentication: {
          type: 'selective',
          authenticators: {
            key: { type: 'apiKey', inject: { format: '{{parameters.Key}}' } },
            basic: {
              type: 'basic',
              username: '{{ parameters.User }}',
              password: '{{ parameters.Pass }}',
            },
          },
        },
      })
    ).toEqual(new Set(['Key', 'User', 'Pass']));
  });
});
