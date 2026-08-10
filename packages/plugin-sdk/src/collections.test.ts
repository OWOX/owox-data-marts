import { describe, expect, it, vi } from 'vitest';
import { createPluginCollection } from './collections.js';
import { PluginTransportError } from './iframe-transport.js';

function createRequester() {
  return {
    getJson: vi.fn(),
    putJson: vi.fn(),
    deleteJson: vi.fn(),
  };
}

describe('PluginCollection', () => {
  it('lists a page with optional pagination arguments', async () => {
    const requester = createRequester();
    const page = {
      items: [
        {
          id: 'dashboard-1',
          parentId: 'mart-1',
          document: { title: 'Revenue' },
          createdAt: '2026-08-05T10:00:00.000Z',
          updatedAt: '2026-08-05T10:00:00.000Z',
        },
      ],
      nextCursor: 'next-page',
    };
    requester.getJson.mockResolvedValue(page);

    const result = await createPluginCollection<{ title: string }>(requester, 'dashboards').list({
      limit: 25,
      cursor: 'current-page',
    });

    expect(result).toBe(page);
    expect(requester.getJson).toHaveBeenCalledWith(
      '/api/plugins/runtime/collections/dashboards/documents',
      { limit: '25', cursor: 'current-page' }
    );
  });

  it('gets a document and maps an HTTP 404 to null', async () => {
    const requester = createRequester();
    const collection = createPluginCollection(requester, 'dashboards');
    requester.getJson.mockRejectedValueOnce(
      new PluginTransportError({ code: 'HTTP_ERROR', status: 404, message: 'Not found' })
    );

    await expect(collection.get('missing')).resolves.toBeNull();

    const unavailable = new PluginTransportError({
      code: 'HTTP_ERROR',
      status: 503,
      message: 'Unavailable',
    });
    requester.getJson.mockRejectedValueOnce(unavailable);
    await expect(collection.get('dashboard-1')).rejects.toBe(unavailable);
  });

  it('puts the JSON document and an entity parent through the host', async () => {
    const requester = createRequester();
    const stored = {
      id: 'dashboard/1',
      parentId: 'mart-1',
      document: { title: 'Revenue' },
      createdAt: '2026-08-05T10:00:00.000Z',
      updatedAt: '2026-08-05T10:01:00.000Z',
    };
    requester.putJson.mockResolvedValue(stored);

    const result = await createPluginCollection<{ title: string }>(
      requester,
      'team dashboards'
    ).put('dashboard/1', { title: 'Revenue' }, { parentId: 'mart-1' });

    expect(result).toBe(stored);
    expect(requester.putJson).toHaveBeenCalledWith(
      '/api/plugins/runtime/collections/team%20dashboards/documents/dashboard%2F1',
      { document: { title: 'Revenue' }, parentId: 'mart-1' }
    );
  });

  it('omits parentId for an unbound collection and deletes via DELETE', async () => {
    const requester = createRequester();
    requester.putJson.mockResolvedValue({});
    requester.deleteJson.mockResolvedValue(undefined);
    const collection = createPluginCollection(requester, 'settings');

    await collection.put('shared', { theme: 'dark' });
    await collection.delete('shared');

    expect(requester.putJson).toHaveBeenCalledWith(
      '/api/plugins/runtime/collections/settings/documents/shared',
      { document: { theme: 'dark' } }
    );
    expect(requester.deleteJson).toHaveBeenCalledWith(
      '/api/plugins/runtime/collections/settings/documents/shared'
    );
  });

  it('rejects dot path segments before URL normalization can change the route', async () => {
    const requester = createRequester();

    expect(() => createPluginCollection(requester, '..')).toThrow(
      'collectionName cannot be "." or ".."'
    );
    const collection = createPluginCollection(requester, 'settings');
    await expect(collection.get('.')).rejects.toThrow('document id cannot be "." or ".."');
    expect(requester.getJson).not.toHaveBeenCalled();
  });
});
