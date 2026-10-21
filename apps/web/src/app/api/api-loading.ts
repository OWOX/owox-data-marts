import type { AxiosInstance } from 'axios';
import type { AxiosRequestConfig } from './apiClient';

let pendingRequests = 0;
const listeners = new Set<() => void>();

export function subscribeToApiLoading(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const isApiLoading = () => pendingRequests > 0;

function updatePendingRequests(change: number) {
  pendingRequests += change;
  listeners.forEach(listener => {
    listener();
  });
}

export function withLoadingIndicator(client: AxiosInstance): AxiosInstance {
  async function track(args: unknown[], configIndex: number, request: () => Promise<unknown>) {
    const index = configIndex === 0 && typeof args[0] === 'string' ? 1 : configIndex;
    const config = args[index] as AxiosRequestConfig | undefined;
    const skipLoadingIndicator =
      config?.skipLoadingIndicator ??
      (client.defaults as AxiosRequestConfig | undefined)?.skipLoadingIndicator;

    if (skipLoadingIndicator) return request();

    // A request's own promise retains its loading participation even when an error has no config.
    updatePendingRequests(1);
    try {
      return await request();
    } finally {
      updatePendingRequests(-1);
    }
  }

  // Axios binds aliases to its internal instance, so wrapping request alone misses them.
  const configPositions = {
    request: 0,
    get: 1,
    delete: 1,
    head: 1,
    options: 1,
    post: 2,
    put: 2,
    patch: 2,
    query: 2,
    postForm: 2,
    putForm: 2,
    patchForm: 2,
  } as const;

  for (const [method, index] of Object.entries(configPositions)) {
    const request = client[method as keyof typeof configPositions];
    Object.assign(client, {
      [method]: (...args: unknown[]) =>
        track(args, index, () => Reflect.apply(request, client, args) as Promise<unknown>),
    });
  }

  return new Proxy(client, {
    apply(target, thisArg, args: unknown[]) {
      return track(args, 0, () => Reflect.apply(target, thisArg, args) as Promise<unknown>);
    },
  });
}
