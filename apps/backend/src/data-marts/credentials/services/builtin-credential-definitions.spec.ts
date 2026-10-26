import { CredentialDefinitionContractSchema } from '../credential.types';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';

describe('built-in Credential definitions', () => {
  it('keeps every built-in compatible with the runtime contract schema', () => {
    for (const definition of BUILTIN_CREDENTIAL_DEFINITIONS) {
      expect(CredentialDefinitionContractSchema.safeParse(definition).success).toBe(true);
    }
  });

  it('groups every built-in definition by its provider', () => {
    expect(
      Object.fromEntries(BUILTIN_CREDENTIAL_DEFINITIONS.map(item => [item.id, item.category]))
    ).toEqual({
      openai: 'ai',
      anthropic: 'ai',
      gemini: 'ai',
      openrouter: 'ai',
      github: 'other',
      'google-service-account': 'google',
      'google-oauth': 'google',
      'aws-access-key': 'aws',
      'snowflake-password': 'snowflake',
      'snowflake-key-pair': 'snowflake',
      'databricks-token': 'databricks',
    });
  });

  it('gives every built-in provider its icon', () => {
    expect(
      Object.fromEntries(BUILTIN_CREDENTIAL_DEFINITIONS.map(item => [item.id, item.icon]))
    ).toEqual({
      openai: 'openai',
      anthropic: 'anthropic',
      gemini: 'gemini',
      openrouter: 'openrouter',
      github: 'github',
      'google-service-account': 'google',
      'google-oauth': 'google',
      'aws-access-key': 'aws',
      'snowflake-password': 'snowflake',
      'snowflake-key-pair': 'snowflake',
      'databricks-token': 'databricks',
    });
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

  it('declares BigQuery Service Account with the googleapis.com wildcard origin and no probe', () => {
    const definition = BUILTIN_CREDENTIAL_DEFINITIONS.find(
      item => item.id === 'google-service-account'
    );

    expect(definition).toMatchObject({
      displayName: 'BigQuery Service Account',
      auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
      origins: ['https://*.googleapis.com'],
    });
    expect(definition?.validation).toBeUndefined();
    expect(new URL(definition!.documentationUrl!).hostname).toBe('docs.cloud.google.com');
  });
});
