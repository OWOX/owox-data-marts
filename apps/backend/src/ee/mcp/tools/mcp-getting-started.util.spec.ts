import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import {
  buildGettingStarted,
  gettingStartedSchema,
  hasPublishedDataMarts,
  resolveGettingStarted,
} from './mcp-getting-started.util';

describe('MCP getting-started guidance', () => {
  const baseContext: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project 1',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };
  const publicOrigin = 'https://app.owox.com/';

  function facadeWith(byStatus: Partial<Record<'published' | 'draft', unknown[]>>) {
    return {
      listDataMarts: jest.fn(async ({ status }: { status: 'published' | 'draft' }) => ({
        dataMarts: byStatus[status] ?? [],
      })),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
  }

  it('links a creator role to the create page, the guides, and the creation steps', async () => {
    const dataMarts = facadeWith({});

    const guidance = await buildGettingStarted({ dataMarts, publicOrigin }, baseContext);

    expect(guidance).toEqual({
      reason: 'no_published_data_marts',
      can_create_data_marts: true,
      create_data_mart_url: 'https://app.owox.com/ui/project%201/data-marts/create',
      data_marts_url: 'https://app.owox.com/ui/project%201/data-marts',
      guides: {
        core_concepts: 'https://docs.owox.com/docs/getting-started/core-concepts/',
        connector_data_mart:
          'https://docs.owox.com/docs/getting-started/setup-guide/connector-data-mart/',
        sql_data_mart: 'https://docs.owox.com/docs/getting-started/setup-guide/sql-data-mart/',
      },
      draft_data_marts: [],
      instructions: expect.stringContaining('open create_data_mart_url'),
    });
    expect(guidance.instructions).toContain('publish');
    expect(guidance.instructions).toContain('Do not retry discovery tools');
    expect(guidance.instructions).not.toContain('draft_data_marts');
    expect(() => gettingStartedSchema.parse(guidance)).not.toThrow();
    expect(dataMarts.listDataMarts).toHaveBeenCalledWith({
      projectId: 'project 1',
      userId: 'user-1',
      roles: ['editor'],
      status: 'draft',
    });
  });

  it('tells a business user to ask a creator role instead of sending them to the create page', async () => {
    const guidance = await buildGettingStarted(
      { dataMarts: facadeWith({}), publicOrigin },
      { ...baseContext, roles: ['viewer'] }
    );

    expect(guidance.can_create_data_marts).toBe(false);
    expect(guidance.instructions).toContain('cannot create Data Marts');
    expect(guidance.instructions).toContain('Project Admin or a Technical User');
    expect(guidance.instructions).not.toContain('open create_data_mart_url');
  });

  // The flag mirrors the STORAGE/USE gate of CreateDataMartService; these are the outcomes the
  // access matrix yields today, so a matrix change that alters them shows up here.
  it('derives creator roles from the access matrix', async () => {
    const dataMarts = facadeWith({});
    const canCreate = async (roles: string[]) =>
      (await buildGettingStarted({ dataMarts, publicOrigin }, { ...baseContext, roles }))
        .can_create_data_marts;

    await expect(canCreate(['admin'])).resolves.toBe(true);
    await expect(canCreate(['editor'])).resolves.toBe(true);
    await expect(canCreate(['viewer'])).resolves.toBe(false);
    await expect(canCreate(['viewer', 'editor'])).resolves.toBe(true);
    await expect(canCreate([])).resolves.toBe(false);
  });

  it('treats an admin as a creator', async () => {
    const guidance = await buildGettingStarted(
      { dataMarts: facadeWith({}), publicOrigin },
      { ...baseContext, roles: ['admin'] }
    );

    expect(guidance.can_create_data_marts).toBe(true);
  });

  it('lists visible drafts with their pages and asks to publish them', async () => {
    const dataMarts = facadeWith({
      draft: [
        {
          id: 'dm_draft',
          title: 'Draft Orders',
          description: null,
          status: 'DRAFT',
          updatedAt: '',
        },
      ],
    });

    const guidance = await buildGettingStarted({ dataMarts, publicOrigin }, baseContext);

    expect(guidance.draft_data_marts).toEqual([
      {
        id: 'dm_draft',
        title: 'Draft Orders',
        url: 'https://app.owox.com/ui/project%201/data-marts/dm_draft/data-setup',
      },
    ]);
    expect(guidance.instructions).toContain('1 draft Data Mart(s) listed in draft_data_marts');
    expect(guidance.instructions).toContain('finished, and published');
  });

  it('asks a business user to have drafts published by someone else', async () => {
    const dataMarts = facadeWith({
      draft: [
        { id: 'dm_draft', title: 'Draft', description: null, status: 'DRAFT', updatedAt: '' },
      ],
    });

    const guidance = await buildGettingStarted(
      { dataMarts, publicOrigin },
      { ...baseContext, roles: ['viewer'] }
    );

    expect(guidance.instructions).toContain('published by a Project Admin or a Technical User');
  });

  it('keeps the links and steps when the draft lookup fails', async () => {
    const dataMarts = {
      listDataMarts: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as jest.Mocked<McpDataMartsFacade>;

    const guidance = await buildGettingStarted({ dataMarts, publicOrigin }, baseContext);

    expect(guidance.draft_data_marts).toEqual([]);
    expect(guidance.create_data_mart_url).toBe(
      'https://app.owox.com/ui/project%201/data-marts/create'
    );
  });

  it('resolves to nothing when the user sees a published data mart', async () => {
    const dataMarts = facadeWith({
      published: [
        { id: 'dm_1', title: 'Orders', description: null, status: 'PUBLISHED', updatedAt: '' },
      ],
    });

    await expect(hasPublishedDataMarts(dataMarts, baseContext)).resolves.toBe(true);
    await expect(
      resolveGettingStarted({ dataMarts, publicOrigin }, baseContext)
    ).resolves.toBeUndefined();
    expect(dataMarts.listDataMarts).toHaveBeenCalledTimes(2);
  });

  it('resolves to guidance when the user sees no published data mart', async () => {
    const dataMarts = facadeWith({});

    await expect(hasPublishedDataMarts(dataMarts, baseContext)).resolves.toBe(false);
    await expect(
      resolveGettingStarted({ dataMarts, publicOrigin }, baseContext)
    ).resolves.toMatchObject({ reason: 'no_published_data_marts' });
  });
});
