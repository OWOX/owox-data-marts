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

  /**
   * The blind spot the pairing rule above could not see.
   *
   * Publishing runs under an API key -- `owox-ctl` drives it -- so those controllers carry
   * no `@RejectApiKeyAuth` for the pairing rule to mirror. Nothing then forced a
   * `@RejectPluginAuth`, and a plugin could publish and unpublish on the member's behalf:
   * a manual probe caught `POST /api/plugins/publications` succeeding from inside a plugin.
   *
   * The invariant that does hold: every state-changing route a plugin can reach must refuse
   * a plugin runtime token, class-level or per-handler. Reads (the Gallery, a plugin page,
   * a member's own installation list) are the authority `ctx.owox` legitimately carries and
   * stay open by omission.
   */
  const PLUGIN_HOST_CONTROLLERS = controllerFiles().filter(file =>
    file.includes(join('plugin-host'))
  );

  const WRITE_DECORATOR = /^\s*@(Post|Put|Patch|Delete)\(/;

  it.each(PLUGIN_HOST_CONTROLLERS.map(f => [f.slice(SRC.length + 1), readFileSync(f, 'utf8')]))(
    '%s refuses a plugin runtime token on every write route',
    (_name, source) => {
      const lines = source.split('\n');
      const classRejectsPlugin = lines.some(
        (line, i) =>
          line.trim() === '@RejectPluginAuth()' &&
          lines.slice(i + 1, i + 6).some(l => l.startsWith('export class'))
      );
      const classRequiresPlugin = lines.some(
        (line, i) =>
          line.trim() === '@RequirePluginAuth()' &&
          lines.slice(i + 1, i + 6).some(l => l.startsWith('export class'))
      );
      if (classRejectsPlugin || classRequiresPlugin) {
        return;
      }

      lines.forEach((line, index) => {
        if (!WRITE_DECORATOR.test(line)) {
          return;
        }
        // The decorator block sits above the route decorator; a guarded route has
        // @RejectPluginAuth within it.
        const block = lines.slice(Math.max(0, index - 12), index + 1).join('\n');
        expect(block).toContain('@RejectPluginAuth()');
      });
    }
  );
});
