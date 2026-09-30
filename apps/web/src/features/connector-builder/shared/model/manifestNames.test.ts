import { describe, it, expect } from 'vitest';
import {
  isValidManifestName,
  nodeNameProblem,
  parameterNameProblem,
  suggestManifestName,
} from './manifestNames';

describe('isValidManifestName', () => {
  it('accepts what the engine accepts: a letter, then letters, digits and underscores', () => {
    expect(isValidManifestName('balance_history')).toBe(true);
    expect(isValidManifestName('Orders2')).toBe(true);
  });

  it('refuses a path, a space, a leading digit or underscore, and an empty name', () => {
    expect(isValidManifestName('v1/balance/history')).toBe(false);
    expect(isValidManifestName('Daily stats')).toBe(false);
    expect(isValidManifestName('1st')).toBe(false);
    expect(isValidManifestName('_id')).toBe(false);
    expect(isValidManifestName('')).toBe(false);
  });
});

describe('suggestManifestName', () => {
  it('turns an API path into a name the engine accepts', () => {
    expect(suggestManifestName('v1/balance/history')).toBe('v1_balance_history');
    expect(suggestManifestName('/v1/balance/history')).toBe('v1_balance_history');
    expect(suggestManifestName('Daily stats')).toBe('Daily_stats');
    expect(suggestManifestName('campaigns-by-day/')).toBe('campaigns_by_day');
  });

  it('has nothing to suggest when no letter is left to start with', () => {
    expect(suggestManifestName('2024')).toBeNull();
    expect(suggestManifestName('///')).toBeNull();
  });
});

describe('nodeNameProblem', () => {
  it('is null for a valid, unused name', () => {
    expect(nodeNameProblem('balance_history', ['orders'])).toBeNull();
  });

  it('explains the rule with a fixed name, and says where the API path goes', () => {
    const problem = nodeNameProblem('v1/balance/history', []);

    expect(problem).toContain('letters, digits and underscores, starting with a letter');
    expect(problem).toContain('v1_balance_history');
    expect(problem).toContain('Request');
  });

  it('names a node that already exists', () => {
    expect(nodeNameProblem('orders', ['orders'])).toBe('A node named "orders" already exists');
  });
});

describe('parameterNameProblem', () => {
  it('is null for a valid name', () => {
    expect(parameterNameProblem('ApiKey')).toBeNull();
  });

  it('explains the rule with a fixed name', () => {
    const problem = parameterNameProblem('Api Key');

    expect(problem).toContain('letters, digits and underscores, starting with a letter');
    expect(problem).toContain('Api_Key');
  });
});
