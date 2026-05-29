import { jest } from '@jest/globals';

import { setupEnvironmentFromFlags } from './base-command.js';

describe('base command environment setup', () => {
  it('passes env-file through the shared environment manager contract', () => {
    const setupEnvironment = jest.fn(() => ({ messages: [], success: true }));

    setupEnvironmentFromFlags({ 'env-file': '.env.test' }, setupEnvironment);

    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '.env.test' });
  });
});
