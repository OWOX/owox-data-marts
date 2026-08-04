import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

/**
 * The safety net for plugin authority, read off the source rather than the DI container.
 *
 * The guard admits a plugin runtime token anywhere that does not refuse it. That
 * default-allow is deliberate and temporary -- per-action plugin permissions are the next
 * step and will retire both decorators -- but until then nothing except this rule stands
 * between a third-party page and an endpoint that mints or returns a credential. A plugin
 * proxies its request through the host bridge and keeps whatever comes back, long after
 * its runtime token expires or the member uninstalls it.
 *
 * Checked as text on purpose: importing the controllers drags in the whole module graph,
 * and the invariant is about what is written next to the handler, which is exactly what a
 * reviewer reads.
 */
function controllerFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter(entry => entry.endsWith('.controller.ts'))
    .map(entry => join(SRC, entry));
}

const decoratorLines = (source: string, decorator: string): number[] =>
  source
    .split('\n')
    .map((line, index) => (line.trim() === `@${decorator}()` ? index : -1))
    .filter(index => index !== -1);

describe('plugin runtime token coverage', () => {
  const files = controllerFiles();

  it('finds the controllers to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * An endpoint closed to an API key returns or mints something a credential must not
   * reach. A plugin runtime token is a credential held by a third party, so the two belong
   * together -- and a new @RejectApiKeyAuth() arriving alone is the exact way this gap
   * reopens.
   */
  it.each(
    files
      .map(file => [file.slice(SRC.length + 1), readFileSync(file, 'utf8')] as const)
      .filter(([, source]) => source.includes('@RejectApiKeyAuth()'))
  )('%s pairs every @RejectApiKeyAuth() with @RejectPluginAuth()', (_name, source) => {
    const apiKey = decoratorLines(source, 'RejectApiKeyAuth');
    const plugin = decoratorLines(source, 'RejectPluginAuth');

    // Adjacency, not just count: two unrelated decorators in one file would otherwise
    // satisfy a tally while leaving a handler open.
    for (const line of apiKey) {
      expect(plugin).toContain(line + 1);
    }
  });

  // Installing, uninstalling, updating and minting a runtime token are the member's
  // decisions about a plugin, never the plugin's own.
  it('refuses a plugin runtime token across the installation lifecycle', () => {
    const source = readFileSync(
      join(SRC, 'plugin-host', 'controllers', 'plugin-installations.controller.ts'),
      'utf8'
    );

    for (const handler of [
      'install',
      'uninstall',
      'update',
      'updateByRepository',
      'runtimeToken',
    ]) {
      const handlerLine = source.split('\n').findIndex(line => line.includes(`async ${handler}(`));

      expect(handlerLine).toBeGreaterThan(-1);
      // The decorator block sits directly above the handler signature.
      expect(
        source
          .split('\n')
          .slice(Math.max(0, handlerLine - 12), handlerLine)
          .join('\n')
      ).toContain('@RejectPluginAuth()');
    }
  });
});
