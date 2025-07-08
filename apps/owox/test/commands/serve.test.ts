import { expect } from 'chai';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('serve', () => {
  it('shows help for serve command', async () => {
    const { stdout } = await execAsync('./bin/run.js serve --help');
    expect(stdout).to.contain('Start the OWOX Data Marts application');
  });

  it('accepts port flag', async () => {
    const { stdout } = await execAsync('./bin/run.js serve --help');
    expect(stdout).to.contain('--port=<value>');
  });
});
