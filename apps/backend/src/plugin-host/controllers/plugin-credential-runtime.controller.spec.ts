import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
}));

import type { AuthorizationContext } from '../../idp';
import { PluginCredentialRuntimeController } from './plugin-credential-runtime.controller';

const context = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: [],
  pluginId: 'plugin-1',
  installationId: 'installation-1',
} as unknown as AuthorizationContext;

function setup(requirements: unknown[]) {
  return new PluginCredentialRuntimeController(
    { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
    { findById: jest.fn().mockResolvedValue({ credentialRequirements: requirements }) } as never,
    {} as never,
    {} as never,
    { resolveBinding: jest.fn() } as never,
    { findById: jest.fn().mockResolvedValue({ owoxAi: false }) } as never,
    {} as never
  );
}

describe('PluginCredentialRuntimeController capability boundaries', () => {
  it('does not expose asFetch for a logical AI requirement', async () => {
    const controller = setup([{ id: 'ai', optional: false, models: ['fast'] }]);

    await expect(controller.fetch('ai', {} as never, context, {} as never)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('does not expose AI SDK operations for an exact requirement', async () => {
    const controller = setup(['github']);

    await expect(
      controller.generate(
        'github',
        { version: 1, model: 'fast', options: {} },
        context,
        {} as never
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PluginCredentialRuntimeController in a backend action', () => {
  const backend = { ...context, executionId: 'execution-1' } as AuthorizationContext;
  const AI = [{ id: 'ai', optional: false, models: ['fast', 'embedding'] }];

  it.each([
    ['generate', 'fast'],
    ['embed', 'embedding'],
  ] as const)(
    'lets the execution token %s through a declared AI Credential',
    async (route, model) => {
      const binding = { credentialId: 'credential-1', requirement: { key: 'ai' } };
      const bindings = {
        resolveBinding: jest.fn().mockResolvedValue(binding),
        markUsed: jest.fn().mockResolvedValue(undefined),
      };
      const aiService = { [route]: jest.fn().mockResolvedValue({ ok: true }) };
      const controller = new PluginCredentialRuntimeController(
        { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
        { findById: jest.fn().mockResolvedValue({ credentialRequirements: AI }) } as never,
        {} as never,
        aiService as never,
        bindings as never,
        { findById: jest.fn().mockResolvedValue({ owoxAi: false }) } as never,
        {} as never
      );
      const request = Object.assign(new EventEmitter(), { res: new EventEmitter() });

      await expect(
        controller[route]('ai', { version: 1, model, options: {} }, backend, request as never)
      ).resolves.toEqual({ ok: true });
      expect(aiService[route]).toHaveBeenCalledWith(binding, model, {}, expect.any(AbortSignal));
      expect(bindings.markUsed).toHaveBeenCalled();
    }
  );

  it('lets the execution token stream through a declared AI Credential', async () => {
    const binding = { credentialId: 'credential-1', requirement: { key: 'ai' } };
    const bindings = {
      resolveBinding: jest.fn().mockResolvedValue(binding),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };
    const aiService = {
      stream: jest.fn().mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-delta', textDelta: 'hello' });
            controller.close();
          },
        })
      ),
    };
    const controller = new PluginCredentialRuntimeController(
      { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
      { findById: jest.fn().mockResolvedValue({ credentialRequirements: AI }) } as never,
      {} as never,
      aiService as never,
      bindings as never,
      { findById: jest.fn().mockResolvedValue({ owoxAi: false }) } as never,
      {} as never
    );
    const response = Object.assign(new EventEmitter(), {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      writableEnded: false,
      destroyed: false,
    });
    const request = Object.assign(new EventEmitter(), { res: response });

    await expect(
      controller.stream(
        'ai',
        { version: 1, model: 'fast', options: {} },
        backend,
        request as never,
        response as never
      )
    ).resolves.toBeUndefined();
    expect(aiService.stream).toHaveBeenCalledWith(binding, 'fast', {}, expect.any(AbortSignal));
    expect(bindings.markUsed).toHaveBeenCalled();
    expect(response.write).toHaveBeenCalledWith('{"type":"text-delta","textDelta":"hello"}\n');
    expect(response.end).toHaveBeenCalled();
  });

  it('still lets the execution token fetch through an exact Credential', async () => {
    const binding = { credentialId: 'credential-1', requirement: { key: 'github' } };
    const bindings = {
      resolveBinding: jest.fn().mockResolvedValue(binding),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };
    const fetchService = { run: jest.fn().mockResolvedValue({ status: 200 }) };
    const controller = new PluginCredentialRuntimeController(
      { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
      { findById: jest.fn().mockResolvedValue({ credentialRequirements: ['github'] }) } as never,
      fetchService as never,
      {} as never,
      bindings as never,
      { findById: jest.fn().mockResolvedValue({ owoxAi: false }) } as never,
      {} as never
    );
    const request = Object.assign(new EventEmitter(), { res: new EventEmitter() });

    await expect(
      controller.fetch('github', {} as never, backend, request as never)
    ).resolves.toEqual({ status: 200 });
  });
});

describe('PluginCredentialRuntimeController disconnect handling', () => {
  function runtime() {
    const binding = {
      credentialId: 'credential-1',
      requirement: { key: 'ai' },
    };
    const aiService = {
      generate: jest.fn(),
      stream: jest.fn(),
    };
    const bindings = {
      resolveBinding: jest.fn().mockResolvedValue(binding),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PluginCredentialRuntimeController(
      { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
      {
        findById: jest.fn().mockResolvedValue({
          credentialRequirements: [{ id: 'ai', optional: false, models: ['fast'] }],
        }),
      } as never,
      {} as never,
      aiService as never,
      bindings as never,
      { findById: jest.fn().mockResolvedValue({ owoxAi: false }) } as never,
      {} as never
    );
    return { controller, aiService };
  }

  function requestAndResponse() {
    const request = new EventEmitter() as EventEmitter & { res?: EventEmitter };
    const response = new EventEmitter();
    request.res = response;
    return { request, response };
  }

  it('aborts provider work when the HTTP response closes before completion', async () => {
    const state = runtime();
    const { request, response } = requestAndResponse();
    let signal: AbortSignal | undefined;
    let resolveStarted!: () => void;
    const started = new Promise<void>(resolve => {
      resolveStarted = resolve;
    });
    state.aiService.generate.mockImplementation(
      (_binding: unknown, _model: unknown, _options: unknown, currentSignal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = currentSignal;
          resolveStarted();
          currentSignal.addEventListener('abort', () => reject(currentSignal.reason));
        })
    );

    const pending = state.controller.generate(
      'ai',
      { version: 1, model: 'fast', options: {} },
      context,
      request as never
    );
    await started;
    response.emit('close');

    await expect(pending).rejects.toBeDefined();
    expect(signal?.aborted).toBe(true);
  });

  it('does not wait forever for drain after a streamed response closes', async () => {
    const state = runtime();
    const { request, response } = requestAndResponse();
    state.aiService.stream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', textDelta: 'hello' });
        },
      })
    );
    Object.assign(response, {
      status: jest.fn().mockReturnValue(response),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn().mockReturnValue(false),
      end: jest.fn(),
      writableEnded: false,
      destroyed: false,
    });

    const pending = state.controller.stream(
      'ai',
      { version: 1, model: 'fast', options: {} },
      context,
      request as never,
      response as never
    );
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect((response as unknown as { write: jest.Mock }).write).toHaveBeenCalled();
    response.emit('close');

    await expect(pending).resolves.toBeUndefined();
  });
});

describe('PluginCredentialRuntimeController with OWOX AI', () => {
  const AI = [{ id: 'ai', optional: false, models: ['fast', 'embedding'] }];
  const pluginTitle = 'Plugin title';

  function owoxRuntime(
    owoxAi = true,
    requirements: unknown[] = AI,
    provided: string[] = ['fast', 'reasoning', 'embedding'],
    uninstalledAt: Date | null = null
  ) {
    const bindings = { resolveBinding: jest.fn(), markUsed: jest.fn() };
    const aiService = { generate: jest.fn(), stream: jest.fn(), embed: jest.fn() };
    const facade = {
      provides: jest.fn((models: string[]) => models.every(model => provided.includes(model))),
      generate: jest.fn(),
      stream: jest.fn(),
      embed: jest.fn(),
    };
    const controller = new PluginCredentialRuntimeController(
      { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
      {
        findById: jest
          .fn()
          .mockResolvedValue({ credentialRequirements: requirements, displayName: pluginTitle }),
      } as never,
      { run: jest.fn() } as never,
      aiService as never,
      bindings as never,
      { findById: jest.fn().mockResolvedValue({ owoxAi, uninstalledAt }) } as never,
      facade as never
    );
    return { controller, bindings, aiService, facade };
  }
  const request = () => Object.assign(new EventEmitter(), { res: new EventEmitter() });
  const consumption = { projectId: 'project-1', pluginId: 'plugin-1', pluginTitle };

  function streamResponse() {
    return Object.assign(new EventEmitter(), {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      writableEnded: false,
      destroyed: false,
    });
  }

  it('routes generate to OWOX AI when the installation uses it', async () => {
    const { controller, bindings, aiService, facade } = owoxRuntime();
    facade.generate.mockResolvedValue({ ok: true });

    await expect(
      controller.generate(
        'ai',
        { version: 1, model: 'fast', options: { a: 1 } as never },
        context,
        request() as never
      )
    ).resolves.toEqual({ ok: true });
    expect(facade.generate).toHaveBeenCalledWith(
      consumption,
      'fast',
      { a: 1 },
      expect.any(AbortSignal)
    );
    expect(aiService.generate).not.toHaveBeenCalled();
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
    expect(bindings.markUsed).not.toHaveBeenCalled();
  });

  it('routes embed to OWOX AI when the installation uses it', async () => {
    const { controller, bindings, aiService, facade } = owoxRuntime();
    facade.embed.mockResolvedValue({ ok: true });

    await expect(
      controller.embed(
        'ai',
        { version: 1, model: 'embedding', options: {} },
        context,
        request() as never
      )
    ).resolves.toEqual({ ok: true });
    expect(facade.embed).toHaveBeenCalledWith(consumption, {}, expect.any(AbortSignal));
    expect(aiService.embed).not.toHaveBeenCalled();
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
    expect(bindings.markUsed).not.toHaveBeenCalled();
  });

  it('routes stream to OWOX AI as NDJSON when the installation uses it', async () => {
    const { controller, bindings, aiService, facade } = owoxRuntime();
    facade.stream.mockResolvedValue(
      new ReadableStream({
        start(c) {
          c.enqueue({ type: 'text-delta', textDelta: 'hi' });
          c.close();
        },
      })
    );
    const response = streamResponse();

    await controller.stream(
      'ai',
      { version: 1, model: 'fast', options: {} },
      context,
      request() as never,
      response as never
    );
    expect(facade.stream).toHaveBeenCalledWith(consumption, 'fast', {}, expect.any(AbortSignal));
    expect(response.write).toHaveBeenCalledWith('{"type":"text-delta","textDelta":"hi"}\n');
    expect(aiService.stream).not.toHaveBeenCalled();
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
    expect(bindings.markUsed).not.toHaveBeenCalled();
  });

  it('keeps the Credential path when owoxAi is false', async () => {
    const { controller, bindings, aiService, facade } = owoxRuntime(false);
    bindings.resolveBinding.mockResolvedValue({
      credentialId: 'credential-1',
      requirement: { key: 'ai' },
    });
    aiService.generate.mockResolvedValue({ ok: 'credential' });

    await expect(
      controller.generate(
        'ai',
        { version: 1, model: 'fast', options: {} },
        context,
        request() as never
      )
    ).resolves.toEqual({ ok: 'credential' });
    expect(facade.generate).not.toHaveBeenCalled();
    expect(bindings.markUsed).toHaveBeenCalled();
  });

  it('does not use OWOX AI for an uninstalled installation', async () => {
    const { controller, bindings, facade } = owoxRuntime(true, AI, undefined, new Date());
    bindings.resolveBinding.mockRejectedValue(
      new NotFoundException('Credential ai is not configured')
    );

    await expect(
      controller.generate(
        'ai',
        { version: 1, model: 'fast', options: {} },
        context,
        request() as never
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(facade.generate).not.toHaveBeenCalled();
    expect(bindings.resolveBinding).toHaveBeenCalled();
  });

  it('answers 404 for an undeclared model even with OWOX AI', async () => {
    const { controller, facade } = owoxRuntime(true, [
      { id: 'ai', optional: false, models: ['fast'] },
    ]);

    await expect(
      controller.embed(
        'ai',
        { version: 1, model: 'embedding', options: {} },
        context,
        request() as never
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(facade.embed).not.toHaveBeenCalled();
  });

  // The Credential path also requires every declared model, not only the requested one.
  it('answers the missing-grant 404 when OWOX AI lacks a declared model', async () => {
    const { controller, bindings, facade } = owoxRuntime(true, AI, ['fast', 'reasoning']);

    await expect(
      controller.generate(
        'ai',
        { version: 1, model: 'fast', options: {} },
        context,
        request() as never
      )
    ).rejects.toThrow(new NotFoundException('Credential ai is not configured'));
    expect(facade.provides).toHaveBeenCalledWith(['embedding', 'fast']);
    expect(facade.generate).not.toHaveBeenCalled();
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
  });

  it('rejects generate and stream with the decision model', async () => {
    const { controller, bindings, aiService, facade } = owoxRuntime();
    const body = { version: 1, model: 'decision', options: {} } as never;
    const error = new BadRequestException('A language model mapping is required');

    await expect(controller.generate('ai', body, context, request() as never)).rejects.toThrow(
      error
    );
    await expect(
      controller.stream('ai', body, context, request() as never, streamResponse() as never)
    ).rejects.toThrow(error);
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
    expect(aiService.generate).not.toHaveBeenCalled();
    expect(facade.generate).not.toHaveBeenCalled();
    expect(facade.stream).not.toHaveBeenCalled();
  });

  it('lets a facade HttpException reach the client unchanged', async () => {
    const { controller, facade } = owoxRuntime();
    const error = new NotFoundException('OWOX AI is off');
    facade.generate.mockRejectedValue(error);

    await expect(
      controller.generate(
        'ai',
        { version: 1, model: 'fast', options: {} },
        context,
        request() as never
      )
    ).rejects.toBe(error);
  });

  it('answers a facade refusal on stream before it sends headers', async () => {
    const { controller, facade } = owoxRuntime();
    const error = new ForbiddenException('blocked');
    facade.stream.mockRejectedValue(error);
    const response = streamResponse();

    await expect(
      controller.stream(
        'ai',
        { version: 1, model: 'fast', options: {} },
        context,
        request() as never,
        response as never
      )
    ).rejects.toBe(error);
    expect(response.flushHeaders).not.toHaveBeenCalled();
  });

  it('keeps fetch on the Credential path for an owoxAi installation', async () => {
    const { controller, bindings, facade } = owoxRuntime(true, ['github']);
    bindings.resolveBinding.mockResolvedValue({
      credentialId: 'credential-1',
      requirement: { key: 'github' },
    });

    await controller.fetch('github', {} as never, context, request() as never);
    expect(bindings.resolveBinding).toHaveBeenCalled();
    expect(facade.generate).not.toHaveBeenCalled();
  });
});
