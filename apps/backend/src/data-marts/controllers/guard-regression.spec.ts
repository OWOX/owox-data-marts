import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression tests: verify guard levels on controllers by parsing source.
 * This avoids complex module imports/mocks while still catching guard changes.
 */

const controllersDir = path.join(__dirname);

function readController(filename: string): string {
  return fs.readFileSync(path.join(controllersDir, filename), 'utf-8');
}

function extractAuthDecorators(source: string): Array<{ method: string; role: string }> {
  const results: Array<{ method: string; role: string }> = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const authMatch = lines[i].match(/@Auth\(Role\.(viewer|editor|admin)/);
    if (authMatch) {
      // Find the next async method name
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const methodMatch = lines[j].match(/async\s+(\w+)\s*\(/);
        if (methodMatch) {
          results.push({ method: methodMatch[1], role: authMatch[1] });
          break;
        }
      }
    }
  }
  return results;
}

function extractViewOnlySafeMethods(source: string): string[] {
  const results: string[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('@ViewOnlySafe()')) {
      continue;
    }

    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const methodMatch = lines[j].match(/async\s+(\w+)\s*\(/);
      if (methodMatch) {
        results.push(methodMatch[1]);
        break;
      }
    }
  }

  return results;
}

describe('DataMart controller — editor guards unchanged', () => {
  const source = readController('data-mart.controller.ts');
  const decorators = extractAuthDecorators(source);

  const mustBeEditor = [
    'create',
    'updateDefinition',
    'updateTitle',
    'updateDescription',
    'updateOwners',
    'publish',
    'delete',
    'manualRun',
    'cancelRun',
    'validate',
    'updateSchema',
  ];

  it.each(mustBeEditor)('%s should require editor role', methodName => {
    const entry = decorators.find(d => d.method === methodName);
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('editor');
  });
});

describe('DataStorage controller — editor guards unchanged', () => {
  const source = readController('data-storage.controller.ts');
  const decorators = extractAuthDecorators(source);

  const mustBeEditor = ['create', 'update', 'delete'];

  it.each(mustBeEditor)('%s should require editor role', methodName => {
    const entry = decorators.find(d => d.method === methodName);
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('editor');
  });
});

describe('ScheduledTrigger controller — viewer guards (type-based access in use-case)', () => {
  const source = readController('scheduled-trigger.controller.ts');
  const decorators = extractAuthDecorators(source);

  const mustBeViewer = ['create', 'update', 'delete'];

  it.each(mustBeViewer)(
    '%s should allow viewer role (access checked in use-case by trigger type)',
    methodName => {
      const entry = decorators.find(d => d.method === methodName);
      expect(entry).toBeDefined();
      expect(entry!.role).toBe('viewer');
    }
  );
});

describe('DataDestination controller — viewer guards (project-wide)', () => {
  const source = readController('data-destination.controller.ts');
  const decorators = extractAuthDecorators(source);

  const mustBeViewer = ['create', 'update', 'delete', 'rotateSecretKey'];

  it.each(mustBeViewer)('%s should allow viewer role', methodName => {
    const entry = decorators.find(d => d.method === methodName);
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('viewer');
  });
});

describe('Insight triggers — editor guards (BU cannot run Insights)', () => {
  const insightRunSource = readController('insight-run-trigger.controller.ts');
  const insightRunDecorators = extractAuthDecorators(insightRunSource);

  it('InsightRunTrigger createTrigger should require editor role', () => {
    const entry = insightRunDecorators.find(d => d.method === 'createTrigger');
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('editor');
  });

  const insightTemplateRunSource = readController('insight-template-run-trigger.controller.ts');
  const insightTemplateRunDecorators = extractAuthDecorators(insightTemplateRunSource);

  it('InsightTemplateRunTrigger createTrigger should require editor role', () => {
    const entry = insightTemplateRunDecorators.find(d => d.method === 'createTrigger');
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('editor');
  });
});

describe('DataMart utility triggers — viewer guards (lowered)', () => {
  it('InsightArtifactSqlPreviewTrigger should allow viewer', () => {
    const source = readController('insight-artifact-sql-preview-trigger.controller.ts');
    const decorators = extractAuthDecorators(source);
    const entry = decorators.find(d => d.method === 'createTrigger');
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('viewer');
  });

  it('SqlDryRunTrigger should allow viewer', () => {
    const source = readController('sql-dry-run-trigger.controller.ts');
    const decorators = extractAuthDecorators(source);
    const entry = decorators.find(d => d.method === 'createSqlDryRunTrigger');
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('viewer');
  });

  it('SchemaActualizeTrigger should allow viewer', () => {
    const source = readController('schema-actualize-trigger.controller.ts');
    const decorators = extractAuthDecorators(source);
    const entry = decorators.find(d => d.method === 'createTrigger');
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('viewer');
  });
});

describe('View-only safe POST routes', () => {
  it('allows only the read-semantics Data Mart health endpoint', () => {
    expect(extractViewOnlySafeMethods(readController('data-mart.controller.ts'))).toEqual([
      'getBatchHealthStatus',
    ]);
  });

  it('allows only Storage access validation', () => {
    expect(extractViewOnlySafeMethods(readController('data-storage.controller.ts'))).toEqual([
      'validate',
    ]);
  });

  it('allows Markdown rendering', () => {
    expect(extractViewOnlySafeMethods(readController('markdown-parser.controller.ts'))).toEqual([
      'parseToHtml',
    ]);
  });

  it('keeps SQL preview blocked because it can execute SQL and update validation state', () => {
    expect(
      extractViewOnlySafeMethods(
        readController('insight-artifact-sql-preview-trigger.controller.ts')
      )
    ).toEqual([]);
  });
});

describe('Report controller — viewer guards (ownership-based)', () => {
  const source = readController('report.controller.ts');
  const decorators = extractAuthDecorators(source);

  const mustBeViewer = ['create', 'delete', 'runReport', 'update'];

  it.each(mustBeViewer)('%s should allow viewer role', methodName => {
    const entry = decorators.find(d => d.method === methodName);
    expect(entry).toBeDefined();
    expect(entry!.role).toBe('viewer');
  });
});

/**
 * Custom connectors — the ONLY block here that pins the complete surface rather than a
 * list of interesting methods.
 *
 * A manifest saved through this controller is code: publishing one makes it executable
 * server-side in a spawned Node process on the next connector run. A list-based assertion
 * protects the handlers someone remembered to list; a new one arriving with the wrong
 * guard — or with none at all — slips through it silently. Comparing the whole map fails
 * instead, and the fix is to state the new handler's role here deliberately.
 */
describe('ConnectorDefinition controller — the custom connector surface, pinned whole', () => {
  const source = readController('connector-definition.controller.ts');
  const guards = Object.fromEntries(
    extractAuthDecorators(source).map(d => [d.method, d.role])
  ) as Record<string, string>;

  it('guards every handler at exactly the level it is meant to have', () => {
    expect(guards).toEqual({
      // Reads that expose only what a connector IS: name, title, config schema, columns.
      list: 'viewer',
      get: 'viewer',
      specification: 'viewer',
      fields: 'viewer',
      // Every write. `test` included: it runs the submitted manifest against a live API.
      create: 'editor',
      test: 'editor',
      saveDraft: 'editor',
      publish: 'editor',
      activate: 'editor',
      remove: 'editor',
      // The one READ that is editor-only, deliberately: it returns a manifest verbatim, and
      // a manifest is author-written JSON that can carry a credential typed into the
      // builder form. Lowering this to viewer would hand every viewer those secrets.
      getVersion: 'editor',
    });
  });

  /**
   * The plugin guard is default-allow, so this refusal is the whole of what stops an
   * installed third-party page bridging through `ctx.owox` from authoring, publishing and
   * activating a manifest on an editor's behalf. It sits at class level because nothing
   * outside the first-party builder UI calls this API.
   *
   * Deliberately NOT paired with @RejectApiKeyAuth: an API key is the programmatic path a
   * project owner legitimately uses here (`owox-ctl`).
   */
  it('refuses plugin runtime tokens for the whole controller', () => {
    expect(source).toMatch(/@RejectPluginAuth\(\)\s*\nexport class ConnectorDefinitionController/);
  });
});
