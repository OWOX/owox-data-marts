import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../../services/api-service';
import { createEmptyManifest } from '../model/manifest.types';
import { ConnectorBuilderApiService } from './connector-builder-api.service';

/**
 * The builder reports a failed write itself, in a toast and in its error state, so the API
 * client must not toast it as well: every failed save or publish used to show two toasts.
 */
describe('ConnectorBuilderApiService writes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const configsSentBy = async (write: (api: ConnectorBuilderApiService) => Promise<unknown>) => {
    const configs: unknown[] = [];
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      vi.spyOn(ApiService.prototype, method).mockImplementation((...args: unknown[]) => {
        configs.push(args.at(-1));
        return Promise.resolve({});
      });
    }
    await write(new ConnectorBuilderApiService());
    return configs;
  };

  it.each([
    [
      'create',
      (api: ConnectorBuilderApiService) =>
        api.create({ name: 'A', title: 'A', manifest: createEmptyManifest() }),
    ],
    [
      'saveDraft',
      (api: ConnectorBuilderApiService) => api.saveDraft('def-1', createEmptyManifest()),
    ],
    ['publish', (api: ConnectorBuilderApiService) => api.publish('def-1')],
    ['activateVersion', (api: ConnectorBuilderApiService) => api.activateVersion('def-1', 1)],
    ['softDelete', (api: ConnectorBuilderApiService) => api.softDelete('def-1')],
  ])('%s leaves reporting a failure to the builder', async (_name, write) => {
    expect(await configsSentBy(write)).toEqual([expect.objectContaining({ skipErrorToast: true })]);
  });
});

it('passes revisions and reviewed versions through every existing mutation endpoint', async () => {
  const put = vi.spyOn(ApiService.prototype, 'put').mockResolvedValue({});
  const post = vi.spyOn(ApiService.prototype, 'post').mockResolvedValue({});
  const remove = vi.spyOn(ApiService.prototype, 'delete').mockResolvedValue({});
  const api = new ConnectorBuilderApiService();
  const manifest = createEmptyManifest();
  await api.saveDraft('id', manifest, 4);
  expect(put).toHaveBeenCalledWith(
    '/id/draft',
    { manifest, expectedRevision: 4 },
    expect.anything()
  );
  await api.publish('id', 5, 2);
  expect(post).toHaveBeenCalledWith(
    '/id/publish',
    { expectedRevision: 5, version: 2 },
    expect.anything()
  );
  await api.activateVersion('id', 1, 6);
  expect(post).toHaveBeenCalledWith(
    '/id/versions/1/activate',
    { expectedRevision: 6 },
    expect.anything()
  );
  await api.softDelete('id', 7);
  expect(remove).toHaveBeenCalledWith('/id?expectedRevision=7', expect.anything());
  vi.restoreAllMocks();
});
