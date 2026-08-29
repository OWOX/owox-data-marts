jest.mock('@owox/connectors', () => ({
  // An array, not an object: connector-definition.service builds a Set from it.
  AvailableConnectors: [],
  // Read only inside publish()/validateManifest(), which these cases never reach.
  Core: {},
}));

// The guard barrel resolves only under the Nest build; the decorators are no-ops here anyway,
// since these cases call the handler directly rather than routing a request to it.
jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  ViewOnlySafe: () => () => undefined,
}));

import { FindOperator } from 'typeorm';
import { ConnectorDefinitionController } from './connector-definition.controller';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../mappers/connector-definition.mapper';
import { ConnectorDefinitionVersionStatus } from '../entities/connector-definition-version.entity';
import type { AuthorizationContext } from '../../idp';

/**
 * GET /connectors/custom is the builder's index page, and the fallback every Data Mart run
 * page hits to resolve a custom connector by name -- so its cost is paid on ordinary
 * navigation. These cases pin that cost to the two things that made it super-linear:
 *
 *  - the number of version queries, which was one per definition;
 *  - the columns each of those queries read, which was every column -- including the
 *    `manifest` JSON, capped at 120 KiB a row, to recover a single integer.
 *
 * Asserting the RESPONSE SHAPE instead would pass equally before and after: the payload was
 * always correct, only ruinous to produce. So the doubles here count calls and record the
 * options they were handed, and the assertions are about those.
 */
describe('ConnectorDefinitionController list() cost', () => {
  const PROJECT = 'proj-1';

  /**
   * `size` definitions wired through the REAL service -- a mocked service would hide the
   * very queries under test. `active: false` leaves them all unpublished.
   */
  const make = (size: number, { active = true }: { active?: boolean } = {}) => {
    const defs = Array.from({ length: size }, (_, i) => ({
      id: `def-${i + 1}`,
      projectId: PROJECT,
      name: `Custom${i + 1}`,
      title: `Custom ${i + 1}`,
      description: null,
      logo: `data:image/png;base64,${'A'.repeat(32)}`,
      docUrl: null,
      activeVersionId: active ? `ver-${i + 1}` : null,
    }));

    const versions = defs.map((def, i) => ({
      id: `ver-${i + 1}`,
      connectorDefinitionId: def.id,
      version: i + 1,
      status: ConnectorDefinitionVersionStatus.PUBLISHED,
      // The amplifier. A real manifest runs up to MAX_MANIFEST_SIZE_BYTES (120 KiB); a query
      // with no `select` drags it across the wire once per row in the list.
      manifest: { blob: 'x'.repeat(1024) },
    }));

    /** Every option object any version query was handed, in call order. */
    const versionQueries: Record<string, unknown>[] = [];

    const applySelect = (row: Record<string, unknown>, select: unknown) => {
      if (!Array.isArray(select)) return row;
      return Object.fromEntries(
        Object.entries(row).filter(([column]) => (select as string[]).includes(column))
      );
    };

    const idsOf = (id: unknown): string[] => {
      if (id instanceof FindOperator) return id.value as string[];
      return typeof id === 'string' ? [id] : [];
    };

    const definitionRepo = {
      find: jest.fn(async ({ where }) => defs.filter(d => d.projectId === where.projectId)),
    };

    const versionRepo = {
      findOne: jest.fn(async (options: Record<string, any>) => {
        versionQueries.push(options);
        const [id] = idsOf(options.where?.id);
        const row = versions.find(v => v.id === id);
        return row ? applySelect(row, options.select) : null;
      }),
      find: jest.fn(async (options: Record<string, any>) => {
        versionQueries.push(options);
        const wanted = idsOf(options.where?.id);
        return versions.filter(v => wanted.includes(v.id)).map(v => applySelect(v, options.select));
      }),
    };

    const service = new ConnectorDefinitionService(
      definitionRepo as never,
      versionRepo as never,
      { findByProjectIdAndDefinitionType: jest.fn().mockResolvedValue([]) } as never
    );

    // The real mapper, not a double: it is pure, and a double would stop these cases
    // exercising the projection the handler actually returns.
    const controller = new ConnectorDefinitionController(
      service,
      {} as never,
      {} as never,
      new ConnectorDefinitionMapper()
    );

    return { controller, versionQueries };
  };

  const ctx = { projectId: PROJECT } as AuthorizationContext;

  it('resolves every active version number in a single query, whatever the list size', async () => {
    const ten = make(10);
    await ten.controller.list(ctx);

    const fifty = make(50);
    await fifty.controller.list(ctx);

    expect(ten.versionQueries).toHaveLength(1);
    expect(fifty.versionQueries).toHaveLength(1);
  });

  it('reads only the columns the list item needs, never the manifest', async () => {
    const { controller, versionQueries } = make(5);

    await controller.list(ctx);

    expect(versionQueries).not.toHaveLength(0);
    for (const query of versionQueries) {
      expect(query.select).toBeDefined();
      expect(query.select).not.toContain('manifest');
    }
  });

  it('still reports each definition its own active version number', async () => {
    const { controller } = make(3);

    const items = await controller.list(ctx);

    expect(items.map(item => [item.name, item.activeVersion])).toEqual([
      ['Custom1', 1],
      ['Custom2', 2],
      ['Custom3', 3],
    ]);
  });

  it('queries no versions at all when nothing in the project is activated', async () => {
    const { controller, versionQueries } = make(3, { active: false });

    const items = await controller.list(ctx);

    expect(items.map(item => item.activeVersion)).toEqual([null, null, null]);
    expect(versionQueries).toHaveLength(0);
  });

  it('keeps the logo on every list item -- the builder index renders it', async () => {
    const { controller } = make(2);

    const items = await controller.list(ctx);

    expect(items.every(item => typeof item.logo === 'string' && item.logo.length > 0)).toBe(true);
  });
});
