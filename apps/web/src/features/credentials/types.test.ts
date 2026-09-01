import { describe, expect, it } from 'vitest';
import {
  isCredentialEligible,
  normalizePluginCredentialRequirement,
  type Credential,
} from './types';

const credential = (overrides: Partial<Credential> = {}): Credential => ({
  id: 'credential-1',
  projectId: 'project-1',
  title: 'GitHub',
  definition: {
    id: 'github',
    source: 'builtin',
    displayName: 'GitHub',
    description: '',
    documentationUrl: null,
    secretLabel: 'Personal access token',
    origins: ['https://api.github.com'],
    supportsAi: false,
    ai: null,
    compatibilityLine: null,
  },
  secretConfigured: true,
  definitionConsentRequired: false,
  enabled: true,
  availableForUse: true,
  availableForMaintenance: false,
  validationState: 'unknown',
  validationMessage: null,
  validatedAt: null,
  lastUsedAt: null,
  aiModelMappings: null,
  aiModelMappingModes: null,
  ownerUsers: [],
  contexts: [],
  usedBy: [],
  createdAt: '2026-08-27T00:00:00.000Z',
  modifiedAt: '2026-08-27T00:00:00.000Z',
  ...overrides,
});

describe('Credential installation eligibility', () => {
  it('matches exact requirements only by definition identity', () => {
    expect(isCredentialEligible(credential(), normalizePluginCredentialRequirement('github'))).toBe(
      true
    );
    expect(isCredentialEligible(credential(), normalizePluginCredentialRequirement('openai'))).toBe(
      false
    );
  });

  it('requires every declared logical AI mapping', () => {
    const aiCredential = credential({
      definition: {
        ...credential().definition,
        id: 'openai',
        supportsAi: true,
        ai: {
          adapter: 'openai',
          baseUrl: 'https://api.openai.com/v1',
        },
      },
      aiModelMappings: { fast: 'gpt-fast' },
    });
    const requirement = normalizePluginCredentialRequirement({
      id: 'ai',
      optional: false,
      models: ['fast', 'reasoning'],
    });

    expect(isCredentialEligible(aiCredential, requirement)).toBe(false);
    expect(
      isCredentialEligible(
        { ...aiCredential, aiModelMappings: { fast: 'gpt-fast', reasoning: 'gpt-reasoning' } },
        requirement
      )
    ).toBe(true);
  });

  it('rejects disabled Credentials and pending external-definition consent', () => {
    const requirement = normalizePluginCredentialRequirement('github');
    expect(isCredentialEligible(credential({ enabled: false }), requirement)).toBe(false);
    expect(isCredentialEligible(credential({ definitionConsentRequired: true }), requirement)).toBe(
      false
    );
  });
});
