import { expect } from 'chai';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { shutdownApplication } from '../../src/utils/shutdown-application.js';

const execAsync = promisify(exec);
const runCommand = `node ./bin/run.js`;

describe('serve', () => {
  it('shows help for serve command', async () => {
    const { stdout } = await execAsync(`${runCommand} serve --help`);
    expect(stdout).to.contain('Start the OWOX Data Marts application');
  });

  it('accepts port flag', async () => {
    const { stdout } = await execAsync(`${runCommand} serve --help`);
    expect(stdout).to.contain('--port=<value>');
  });

  it('accepts web-enabled flag', async () => {
    const { stdout } = await execAsync(`${runCommand} serve --help`);
    expect(stdout).to.contain('--web-enabled');
    expect(stdout).to.contain('Enable web interface');
  });

  it('drains tracked work before closing MCP streams that keep the HTTP server open', async () => {
    const calls: string[] = [];
    let resolveDrain!: () => void;
    let serverCloseCallback!: (error?: Error) => void;
    const drainPromise = new Promise<void>(resolve => {
      resolveDrain = resolve;
    });
    const httpServer = {
      close(callback: (error?: Error) => void) {
        calls.push('server-close-started');
        serverCloseCallback = callback;
      },
      closeIdleConnections() {
        calls.push('idle-connections-closed');
      },
    };
    const app = {
      async close() {
        calls.push('app-closed');
      },
      getHttpServer() {
        return httpServer;
      },
    } as unknown as Parameters<typeof shutdownApplication>[0];
    const services = {
      gracefulShutdownService: {
        async initiateShutdown() {
          calls.push('drain-started');
          await drainPromise;
          calls.push('drain-finished');
        },
      },
      mcpHttpEntryService: {
        async closeTransport() {
          calls.push('mcp-transport-closed');
          serverCloseCallback();
        },
      },
    } as unknown as Parameters<typeof shutdownApplication>[2];

    const shutdownPromise = shutdownApplication(app, 'SIGTERM', services, () => {});
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(calls).to.deep.equal([
      'idle-connections-closed',
      'server-close-started',
      'drain-started',
    ]);

    resolveDrain();
    await shutdownPromise;

    expect(calls).to.deep.equal([
      'idle-connections-closed',
      'server-close-started',
      'drain-started',
      'drain-finished',
      'mcp-transport-closed',
      'app-closed',
    ]);
  });
});
