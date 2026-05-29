import { jest } from '@jest/globals';
import { OWOXConfigError } from '@owox/api-client';

import { setupEnvironmentFromFlags } from './base-command.js';

describe('base command environment setup', () => {
  it('passes env-file through the shared environment manager contract', () => {
    const setupEnvironment = jest.fn(() => ({ messages: [], success: true }));

    setupEnvironmentFromFlags({ 'env-file': '.env.test' }, setupEnvironment);

    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '.env.test' });
  });

  it('fails when an explicit env-file cannot be loaded', () => {
    const setupEnvironment = jest.fn(() => ({ messages: [], success: false }));

    expect(() =>
      setupEnvironmentFromFlags({ 'env-file': 'missing.env' }, setupEnvironment)
    ).toThrow(OWOXConfigError);
    expect(() =>
      setupEnvironmentFromFlags({ 'env-file': 'missing.env' }, setupEnvironment)
    ).toThrow('Failed to load environment file: missing.env');
  });

  it('allows a missing implicit default env file', () => {
    const setupEnvironment = jest.fn(() => ({ messages: [], success: false }));

    expect(() => setupEnvironmentFromFlags({}, setupEnvironment)).not.toThrow();
    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '' });
  });
});
