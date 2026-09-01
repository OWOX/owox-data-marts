import { CredentialDefinitionContractSchema } from '../credential.types';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';

describe('built-in Credential definitions', () => {
  it('keeps every built-in compatible with the runtime contract schema', () => {
    for (const definition of BUILTIN_CREDENTIAL_DEFINITIONS) {
      expect(CredentialDefinitionContractSchema.safeParse(definition).success).toBe(true);
    }
  });

  it.each([
    ['openai', 'platform.openai.com'],
    ['anthropic', 'support.anthropic.com'],
    ['github', 'docs.github.com'],
  ])('provides official key documentation for %s', (definitionId, hostname) => {
    const definition = BUILTIN_CREDENTIAL_DEFINITIONS.find(item => item.id === definitionId);

    expect(definition?.documentationUrl).toBeDefined();
    expect(new URL(definition!.documentationUrl!).hostname).toBe(hostname);
  });

  it('uses the GPT-5.6 catalog and agreed OpenAI defaults', () => {
    const definition = BUILTIN_CREDENTIAL_DEFINITIONS.find(item => item.id === 'openai');

    expect(definition?.ai).toMatchObject({
      models: {
        language: [{ id: 'gpt-5.6-luna' }, { id: 'gpt-5.6-terra' }, { id: 'gpt-5.6-sol' }],
      },
      recommended: {
        fast: 'gpt-5.6-luna',
        reasoning: 'gpt-5.6-sol',
      },
    });
  });
});
