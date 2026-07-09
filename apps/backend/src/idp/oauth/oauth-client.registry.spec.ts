import { OAuthClientRegistry } from './oauth-client.registry';
import type { OAuthDynamicClient } from './entities/oauth-dynamic-client.entity';

describe('OAuthClientRegistry', () => {
  type StoredOAuthDynamicClient = OAuthDynamicClient & {
    status?: 'pending' | 'success';
    userId?: string | null;
    lastUsedAt?: Date | null;
  };

  function createRepository(initialClients: StoredOAuthDynamicClient[] = []) {
    const clients = new Map(initialClients.map(client => [client.clientId, client]));
    return {
      findOne: jest.fn(async ({ where }: { where: { clientId: string } }) => {
        return clients.get(where.clientId) ?? null;
      }),
      save: jest.fn(async (client: StoredOAuthDynamicClient) => {
        clients.set(client.clientId, client);
        return client;
      }),
      update: jest.fn(
        async (
          where: { clientId: string; userId?: unknown },
          partial: Partial<StoredOAuthDynamicClient>
        ) => {
          const client = clients.get(where.clientId);
          if (!client) {
            return { affected: 0 };
          }
          if (Object.prototype.hasOwnProperty.call(where, 'userId') && client.userId) {
            return { affected: 0 };
          }
          clients.set(where.clientId, { ...client, ...partial });
          return { affected: 1 };
        }
      ),
    };
  }

  it('reads dynamic clients from persistent storage on demand', async () => {
    const repository = createRepository([
      {
        clientId: 'mcp_dyn_persisted',
        clientName: 'Codex',
        resource: 'https://mcp.owox.com/mcp',
        redirectUris: ['http://127.0.0.1:54248/callback/OxWjtjMxOIr3'],
        scopes: ['mcp:read', 'mcp:write'],
        status: 'success',
        userId: 'user-1',
        lastUsedAt: new Date('2026-06-11T15:00:00.000Z'),
        createdAt: new Date('2026-06-11T14:00:00.000Z'),
      },
    ]);
    const registry = new OAuthClientRegistry(repository as never);

    await expect(registry.get('mcp_dyn_persisted')).resolves.toMatchObject({
      clientId: 'mcp_dyn_persisted',
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['http://127.0.0.1:54248/callback/OxWjtjMxOIr3'],
      scopes: ['mcp:read', 'mcp:write'],
      status: 'success',
      userId: 'user-1',
      lastUsedAt: new Date('2026-06-11T15:00:00.000Z'),
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { clientId: 'mcp_dyn_persisted' },
    });
  });

  it('persists dynamic clients during registration', async () => {
    const repository = createRepository();
    const registry = new OAuthClientRegistry(repository as never);
    const createdAt = new Date('2026-06-11T14:00:00.000Z');

    await registry.register({
      clientId: 'mcp_dyn_new',
      clientName: 'Codex',
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['http://127.0.0.1:54248/callback/OxWjtjMxOIr3'],
      scopes: ['mcp:read'],
      createdAt,
    });

    expect(repository.save).toHaveBeenCalledWith({
      clientId: 'mcp_dyn_new',
      clientName: 'Codex',
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['http://127.0.0.1:54248/callback/OxWjtjMxOIr3'],
      scopes: ['mcp:read'],
      status: 'pending',
      userId: null,
      lastUsedAt: null,
      createdAt,
    });
  });

  it('stores first authorizing user for a dynamic client without replacing it later', async () => {
    const repository = createRepository([
      {
        clientId: 'mcp_dyn_authorized',
        clientName: 'Codex',
        resource: 'https://mcp.owox.com/mcp',
        redirectUris: ['http://127.0.0.1:54248/callback/OxWjtjMxOIr3'],
        scopes: ['mcp:read', 'mcp:write'],
        status: 'pending',
        userId: null,
        lastUsedAt: null,
        createdAt: new Date('2026-06-11T14:00:00.000Z'),
      },
    ]);
    const registry = new OAuthClientRegistry(repository as never);

    await registry.attachUserIfMissing('mcp_dyn_authorized', 'user-1');
    await registry.attachUserIfMissing('mcp_dyn_authorized', 'user-2');

    await expect(registry.get('mcp_dyn_authorized')).resolves.toMatchObject({
      userId: 'user-1',
    });
  });

  it('marks client successful and updates last used timestamp after token exchange', async () => {
    const repository = createRepository([
      {
        clientId: 'mcp_dyn_used',
        clientName: 'Claude',
        resource: 'https://mcp.owox.com/mcp',
        redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
        scopes: ['mcp:read', 'mcp:write'],
        status: 'pending',
        userId: 'user-1',
        lastUsedAt: null,
        createdAt: new Date('2026-06-11T14:00:00.000Z'),
      },
    ]);
    const registry = new OAuthClientRegistry(repository as never);
    const usedAt = new Date('2026-06-11T16:00:00.000Z');

    await registry.markSuccessfulTokenExchange('mcp_dyn_used', usedAt);

    await expect(registry.get('mcp_dyn_used')).resolves.toMatchObject({
      status: 'success',
      lastUsedAt: usedAt,
    });
  });

  it('does not require the same registry instance to read a registered dynamic client', async () => {
    const repository = createRepository();
    const firstRegistry = new OAuthClientRegistry(repository as never);
    const secondRegistry = new OAuthClientRegistry(repository as never);

    await firstRegistry.register({
      clientId: 'mcp_dyn_shared',
      clientName: 'ChatGPT',
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['https://chatgpt.com/connector/oauth/callback'],
      scopes: ['mcp:read', 'mcp:write'],
      createdAt: new Date('2026-06-11T14:00:00.000Z'),
    });

    await expect(secondRegistry.get('mcp_dyn_shared')).resolves.toMatchObject({
      clientId: 'mcp_dyn_shared',
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['https://chatgpt.com/connector/oauth/callback'],
      scopes: ['mcp:read', 'mcp:write'],
    });
  });
});
