jest.mock('../../idp/guards/idp.guard', () => ({
  AUTH_CONTEXT: 'AUTH_CONTEXT',
}));

import { AI_ASSISTANT_LOG_CONTEXT } from './context-keys';
import { CustomLoggerService } from './logger.service';

describe('CustomLoggerService', () => {
  const setup = () => {
    const service = new CustomLoggerService('TestLogger');

    const info = jest.fn();
    const error = jest.fn();
    const warn = jest.fn();
    const debug = jest.fn();
    const trace = jest.fn();

    (service as unknown as { logger: unknown }).logger = {
      info,
      error,
      warn,
      debug,
      trace,
    };

    return { service, info };
  };

  it('injects ai assistant context metadata from CLS into logs', () => {
    const { service, info } = setup();
    (service as unknown as { cls: unknown }).cls = {
      get: (key: string) =>
        key === AI_ASSISTANT_LOG_CONTEXT
          ? {
              projectId: 'project-1',
              dataMartId: 'dm-1',
              userMessageId: 'msg-1',
            }
          : undefined,
    };

    service.log('AiAssistantRun');

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe('AiAssistantRun');
    expect(info.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          aiAssistantContext: {
            projectId: 'project-1',
            dataMartId: 'dm-1',
            userMessageId: 'msg-1',
          },
        }),
      })
    );
  });

  it('keeps explicit metadata and stores ai assistant context in dedicated field', () => {
    const { service, info } = setup();
    (service as unknown as { cls: unknown }).cls = {
      get: (key: string) =>
        key === AI_ASSISTANT_LOG_CONTEXT
          ? {
              dataMartId: 'dm-from-context',
              projectId: 'project-from-context',
            }
          : undefined,
    };

    service.log('AiAssistantRun', {
      dataMartId: 'dm-manual',
      projectId: 'project-manual',
    });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          dataMartId: 'dm-manual',
          projectId: 'project-manual',
          aiAssistantContext: {
            dataMartId: 'dm-from-context',
            projectId: 'project-from-context',
          },
        }),
      })
    );
  });
});
