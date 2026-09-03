import type { CredentialDefinitionContract } from '../credential.types';

export const BUILTIN_CREDENTIAL_DEFINITIONS: readonly CredentialDefinitionContract[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'OpenAI API key',
    documentationUrl: 'https://platform.openai.com/docs/quickstart',
    auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
    origins: ['https://api.openai.com'],
    validation: { method: 'GET', path: '/v1/models' },
    ai: {
      adapter: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      models: {
        language: [
          { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
          { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
          { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
        ],
        embedding: [{ id: 'text-embedding-3-small', name: 'Text Embedding 3 Small' }],
      },
      recommended: {
        fast: 'gpt-5.6-luna',
        reasoning: 'gpt-5.6-sol',
        embedding: 'text-embedding-3-small',
      },
    },
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Anthropic API key',
    documentationUrl:
      'https://support.anthropic.com/en/articles/8114521-how-can-i-access-the-anthropic-api',
    auth: { type: 'header', label: 'API key', headerName: 'x-api-key' },
    origins: ['https://api.anthropic.com'],
    validation: {
      method: 'GET',
      path: '/v1/models',
      headers: { 'anthropic-version': '2023-06-01' },
    },
    ai: {
      adapter: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      models: {
        language: [
          { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
          { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
          { id: 'claude-opus-5', name: 'Claude Opus 5' },
          { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' },
        ],
        embedding: [],
      },
      recommended: {
        fast: 'claude-haiku-4-5-20251001',
        reasoning: 'claude-fable-5-1',
      },
    },
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    description: 'Google Gemini API key',
    auth: { type: 'header', label: 'API key', headerName: 'x-goog-api-key' },
    origins: ['https://generativelanguage.googleapis.com'],
    validation: { method: 'GET', path: '/v1beta/models' },
    ai: {
      adapter: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: {
        language: [
          { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
          { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        ],
        embedding: [{ id: 'gemini-embedding-001', name: 'Gemini Embedding' }],
      },
      recommended: {
        fast: 'gemini-3.8-flash',
        reasoning: 'gemini-3.1-pro-preview',
        embedding: 'gemini-embedding-001',
      },
    },
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'OpenRouter API key',
    auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
    origins: ['https://openrouter.ai'],
    validation: { method: 'GET', path: '/api/v1/models' },
    ai: {
      adapter: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: {
        language: [
          { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna' },
          { id: 'anthropic/claude-fable-5.1', name: 'Claude Fable 5.1' },
        ],
        embedding: [{ id: 'openai/text-embedding-3-large', name: 'Text Embedding 3 Large' }],
      },
      recommended: {
        fast: 'openai/gpt-5.6-luna',
        reasoning: 'anthropic/claude-fable-5.1',
        embedding: 'openai/text-embedding-3-large',
      },
    },
  },
  {
    id: 'github',
    displayName: 'GitHub',
    description: 'GitHub token',
    documentationUrl:
      'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
    auth: {
      type: 'header',
      label: 'Personal access token',
      headerName: 'authorization',
      prefix: 'Bearer ',
    },
    origins: ['https://api.github.com'],
    validation: {
      method: 'GET',
      path: '/user',
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    },
  },
] as const;

export const BUILTIN_CREDENTIAL_DEFINITION_IDS: ReadonlySet<string> = new Set(
  BUILTIN_CREDENTIAL_DEFINITIONS.map(definition => definition.id)
);
