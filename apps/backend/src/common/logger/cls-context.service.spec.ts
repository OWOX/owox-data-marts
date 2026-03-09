import { ClsService } from 'nestjs-cls';
import { ClsContextService, ClsKey, createClsKey } from './cls-context.service';

describe('ClsContextService', () => {
  type TestContext = Record<string, unknown>;

  const createService = (isActive = true) => {
    let active = isActive;
    const store = new Map<string, unknown>();

    const cls = {
      isActive: jest.fn(() => active),
      get: jest.fn((key: string) => store.get(key)),
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
      }),
      run: jest.fn((callback: () => Promise<unknown> | unknown) => {
        const previous = active;
        active = true;
        try {
          return callback();
        } finally {
          active = previous;
        }
      }),
    } as unknown as ClsService;

    return {
      service: new ClsContextService(cls),
      cls,
      getContext: (key: ClsKey<TestContext>) =>
        (cls as unknown as { get: (input: string) => unknown }).get(key) as
          | Record<string, unknown>
          | undefined,
      setContext: (key: ClsKey<TestContext>, context: Record<string, unknown>) =>
        (cls as unknown as { set: (input: string, value: unknown) => void }).set(key, context),
    };
  };

  it('updates context by merging with existing value', () => {
    const { service, getContext, setContext } = createService();
    const key = createClsKey<TestContext>('my-context');
    setContext(key, { projectId: 'project-1' });

    service.update(key, { dataMartId: 'dm-1' });

    expect(getContext(key)).toEqual({ projectId: 'project-1', dataMartId: 'dm-1' });
  });

  it('restores previous context for sync callback when CLS is active', async () => {
    const { service, setContext, getContext } = createService(true);
    const key = createClsKey<TestContext>('my-context');
    setContext(key, { projectId: 'project-1' });

    const result = await service.runWithContext(key, { dataMartId: 'dm-1' }, () => {
      expect(getContext(key)).toEqual({ projectId: 'project-1', dataMartId: 'dm-1' });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(getContext(key)).toEqual({ projectId: 'project-1' });
  });

  it('restores previous context for async callback when CLS is active', async () => {
    const { service, setContext, getContext } = createService(true);
    const key = createClsKey<TestContext>('my-context');
    setContext(key, { projectId: 'project-2' });

    const result = await service.runWithContext(key, { sessionId: 'session-1' }, async () => {
      expect(getContext(key)).toEqual({ projectId: 'project-2', sessionId: 'session-1' });
      return 'done';
    });

    expect(result).toBe('done');
    expect(getContext(key)).toEqual({ projectId: 'project-2' });
  });

  it('starts CLS context when not active', async () => {
    const { service, cls, getContext } = createService(false);
    const key = createClsKey<TestContext>('my-context');

    const result = await service.runWithContext(
      key,
      { dataMartId: 'dm-3', userMessageId: 'msg-1' },
      async () => getContext(key)
    );

    expect((cls as unknown as { run: jest.Mock }).run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ dataMartId: 'dm-3', userMessageId: 'msg-1' });
  });
});
