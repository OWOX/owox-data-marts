import { NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
}));

import type { AuthorizationContext } from '../../idp';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';
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
    { resolveBinding: jest.fn() } as never
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
    [
      'generate',
      (controller: PluginCredentialRuntimeController) =>
        controller.generate('ai', { version: 1, model: 'fast', options: {} }, backend, {} as never),
    ],
    [
      'embed',
      (controller: PluginCredentialRuntimeController) =>
        controller.embed(
          'ai',
          { version: 1, model: 'embedding', options: {} },
          backend,
          {} as never
        ),
    ],
    [
      'stream',
      (controller: PluginCredentialRuntimeController) =>
        controller.stream(
          'ai',
          { version: 1, model: 'fast', options: {} },
          backend,
          {} as never,
          {} as never
        ),
    ],
  ])('refuses AI %s to the execution token', async (_route, call) => {
    const bindings = { resolveBinding: jest.fn() };
    const controller = new PluginCredentialRuntimeController(
      { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
      { findById: jest.fn().mockResolvedValue({ credentialRequirements: AI }) } as never,
      {} as never,
      {} as never,
      bindings as never
    );

    const refusal = await call(controller).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ExecutionTokenNotAllowedError);
    expect(refusal).toMatchObject({
      httpStatus: 403,
      message: 'AI Credentials are not available in a backend action',
    });
    expect(bindings.resolveBinding).not.toHaveBeenCalled();
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
      bindings as never
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
      bindings as never
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
