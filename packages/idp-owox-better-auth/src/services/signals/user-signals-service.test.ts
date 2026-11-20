import { describe, expect, it, jest } from '@jest/globals';
import type { Payload } from '@owox/idp-protocol';
import type { Request, Response } from 'express';
import type { DatabaseStore } from '../../store/database-store.js';
import type { UserSignal } from '../../types/index.js';
import { UserSignalsService, type ProductIntentConfig } from './user-signals-service.js';

const config: ProductIntentConfig = { cookiePrefix: 'app_', cookieDomain: 'example.com' };
const payload = { userId: 'u1' } as Payload;

function req(cookies: Record<string, string> = {}) {
  return { cookies, headers: {} } as unknown as Request;
}

function setup() {
  const res = { clearCookie: jest.fn() };
  const store = {
    recordUserSignal: jest.fn<DatabaseStore['recordUserSignal']>().mockResolvedValue(undefined),
    getUserSignals: jest.fn<DatabaseStore['getUserSignals']>().mockResolvedValue([]),
  };
  const service = new UserSignalsService(config, store as unknown as DatabaseStore);
  return { res: res as unknown as Response, clear: res.clearCookie, store, service };
}

describe('UserSignalsService.collect', () => {
  it('records the intent from all three cookies with sorted keys', async () => {
    const { service, store, res } = setup();
    await service.collect(
      req({
        app_source: 'alpha-source',
        app_storage: 'beta-storage',
        app_destination: 'gamma-destination',
      }),
      res,
      payload
    );
    expect(store.recordUserSignal).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'product_intent',
      origin: 'explicit_click',
      value: '{"destination":"gamma-destination","source":"alpha-source","storage":"beta-storage"}',
    });
  });

  it('records an intent with a single part', async () => {
    const { service, store, res } = setup();
    await service.collect(req({ app_source: 'delta-source' }), res, payload);
    expect(store.recordUserSignal).toHaveBeenCalledWith(
      expect.objectContaining({ value: '{"source":"delta-source"}' })
    );
  });

  it('clears only the present cookies on the configured domain after recording', async () => {
    const { service, clear, res } = setup();
    await service.collect(req({ app_source: 'delta-source' }), res, payload);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('app_source', { domain: 'example.com', path: '/' });
  });

  it.each(['Facebook', 'a b', '', '-a', 'a--b', 'a'.repeat(65)])(
    'drops the intent and clears the cookies when a part is %p',
    async bad => {
      const { service, store, clear, res } = setup();
      await service.collect(req({ app_source: bad, app_storage: 'beta-storage' }), res, payload);
      expect(store.recordUserSignal).not.toHaveBeenCalled();
      expect(clear).toHaveBeenCalledWith('app_source', { domain: 'example.com', path: '/' });
      expect(clear).toHaveBeenCalledWith('app_storage', { domain: 'example.com', path: '/' });
    }
  );

  it('accepts a part of 64 characters', async () => {
    const { service, store, res } = setup();
    await service.collect(req({ app_source: 'a'.repeat(64) }), res, payload);
    expect(store.recordUserSignal).toHaveBeenCalledTimes(1);
  });

  it('does nothing without intent cookies', async () => {
    const { service, store, clear, res } = setup();
    await service.collect(req({ other: 'x' }), res, payload);
    expect(store.recordUserSignal).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('does nothing when the feature is off', async () => {
    const { store, clear, res } = setup();
    const service = new UserSignalsService(undefined, store as unknown as DatabaseStore);
    await service.collect(req({ app_source: 'delta-source' }), res, payload);
    expect(store.recordUserSignal).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('does nothing in a view-only session', async () => {
    const { service, store, clear, res } = setup();
    await service.collect(req({ app_source: 'delta-source' }), res, {
      userId: 'u1',
      viewOnly: true,
    } as unknown as Payload);
    expect(store.recordUserSignal).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('does nothing without a user id', async () => {
    const { service, store, clear, res } = setup();
    await service.collect(req({ app_source: 'delta-source' }), res, undefined);
    expect(store.recordUserSignal).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('keeps the cookies and does not throw when the store fails', async () => {
    const { service, store, clear, res } = setup();
    store.recordUserSignal.mockRejectedValue(new Error('db down'));
    await expect(
      service.collect(req({ app_source: 'delta-source' }), res, payload)
    ).resolves.toBeUndefined();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('UserSignalsService.list', () => {
  const row = (value: string): UserSignal => ({
    userId: 'u1',
    name: 'product_intent',
    value,
    origin: 'explicit_click',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
    seenCount: 2,
  });

  it('lists signals with the value parsed, skipping unparsable rows', async () => {
    const { service, store } = setup();
    store.getUserSignals.mockResolvedValue([
      row('{"source":"delta-source"}'),
      row('nope'),
      row('[1]'),
    ]);
    expect(await service.list('u1')).toEqual([
      {
        name: 'product_intent',
        value: { source: 'delta-source' },
        origin: 'explicit_click',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-02T00:00:00.000Z',
        seenCount: 2,
      },
    ]);
  });

  it('lists nothing when the feature is off', async () => {
    const { store } = setup();
    const service = new UserSignalsService(undefined, store as unknown as DatabaseStore);
    expect(await service.list('u1')).toBeUndefined();
    expect(store.getUserSignals).not.toHaveBeenCalled();
  });

  it('lists nothing when the store fails', async () => {
    const { service, store } = setup();
    store.getUserSignals.mockRejectedValue(new Error('db down'));
    expect(await service.list('u1')).toBeUndefined();
  });
});

describe('UserSignalsService.hasPending', () => {
  it('is false when the feature is off', () => {
    const service = new UserSignalsService(undefined, {} as DatabaseStore);
    expect(service.hasPending(req({ app_source: 'alpha-source' }))).toBe(false);
  });

  it('is false without intent cookies', () => {
    const { service } = setup();
    expect(service.hasPending(req({ other: 'x' }))).toBe(false);
  });

  it('is true with one intent cookie', () => {
    const { service } = setup();
    expect(service.hasPending(req({ app_storage: 'beta-storage' }))).toBe(true);
  });
});
