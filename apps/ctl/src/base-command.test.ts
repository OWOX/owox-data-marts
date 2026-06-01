import { jest } from '@jest/globals';
import { OWOXConfigError } from '@owox/api-client';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { setupEnvironmentFromFlags } from './base-command.js';

describe('base command environment setup', () => {
  it('passes env-file through the shared environment manager contract', () => {
    const setupEnvironment = jest.fn(() => ({
      envFilePath: '.env.test',
      messages: [],
      success: true,
    }));

    const envFile = setupEnvironmentFromFlags({ 'env-file': '.env.test' }, setupEnvironment);

    expect(envFile).toBe('.env.test');
    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '.env.test' });
  });

  it('fails when an explicit env-file cannot be loaded', () => {
    const setupEnvironment = jest.fn(() => ({ envFilePath: null, messages: [], success: false }));

    expect(() =>
      setupEnvironmentFromFlags({ 'env-file': 'missing.env' }, setupEnvironment)
    ).toThrow(OWOXConfigError);
    expect(() =>
      setupEnvironmentFromFlags({ 'env-file': 'missing.env' }, setupEnvironment)
    ).toThrow('Failed to load environment file: missing.env');
  });

  it('allows a missing implicit default env file and returns null', () => {
    const setupEnvironment = jest.fn(() => ({ envFilePath: null, messages: [], success: false }));

    expect(setupEnvironmentFromFlags({}, setupEnvironment)).toBeNull();
    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '' });
  });

  it('reports the env file path returned by the shared environment manager', () => {
    const setupEnvironment = jest.fn(() => ({
      envFilePath: '/work/.env',
      messages: [],
      success: true,
    }));

    expect(setupEnvironmentFromFlags({}, setupEnvironment)).toBe('/work/.env');
    expect(setupEnvironment).toHaveBeenCalledWith({ envFile: '' });
  });

  it('reports explicit env-file paths as absolute paths through the shared environment manager', () => {
    const previousCwd = process.cwd();
    const tempDir = mkdtempSync(path.join(tmpdir(), 'owox-ctl-env-'));
    const commandDir = path.join(tempDir, 'apps', 'ctl');
    const envFile = path.join(tempDir, '.env');
    mkdirSync(commandDir, { recursive: true });
    writeFileSync(envFile, 'OWOX_CTL_ENV_MANAGER_TEST=value\n');

    try {
      process.chdir(commandDir);
      const expectedEnvFile = path.resolve(process.cwd(), '../../.env');

      expect(setupEnvironmentFromFlags({ 'env-file': '../../.env' })).toBe(expectedEnvFile);
    } finally {
      process.chdir(previousCwd);
      delete process.env.OWOX_CTL_ENV_MANAGER_TEST;
    }
  });
});
