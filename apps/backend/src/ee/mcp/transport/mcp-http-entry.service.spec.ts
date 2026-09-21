import { UnsupportedProtocolVersionError } from '@modelcontextprotocol/server';
import type { HttpAdapterHost } from '@nestjs/core';
import type { ClsContextService } from '../../../common/logger/cls-context.service';
import { DEFAULT_QUERY_DEADLINE_MS } from '../../../data-marts/use-cases/query-data-mart.service';
import type { McpAuthMiddleware } from '../auth/mcp-auth.middleware';
import type { McpInstructionsService } from '../instructions/mcp-instructions.service';
import type { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';
import { MCP_REQUEST_SOCKET_TIMEOUT_MS, McpHttpEntryService } from './mcp-http-entry.service';

const mcpContext = {
  clientId: 'mcp-client-1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['admin'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read'],
  authFlow: 'mcp',
};

describe('McpHttpEntryService', () => {
  const createService = () => {
    const adapterHost = { httpAdapter: { getInstance: jest.fn() } } as unknown as HttpAdapterHost;
    const authMiddleware = { handle: jest.fn() } as unknown as McpAuthMiddleware;
    const serverFactory = { create: jest.fn() } as unknown as McpSdkServerFactory;
    const instructionsService = {
      getInstructions: jest.fn().mockReturnValue('instructions'),
    } as unknown as McpInstructionsService;
    const cls = {
      runWithContext: jest.fn((_key: unknown, _context: unknown, callback: () => unknown) =>
        callback()
      ),
      update: jest.fn(),
      set: jest.fn(),
    } as unknown as ClsContextService;

    return {
      service: new McpHttpEntryService(
        adapterHost,
        authMiddleware,
        serverFactory,
        instructionsService,
        cls
      ),
      adapterHost,
      authMiddleware,
      cls,
    };
  };

  // handleRequest is private (mounted internally from onModuleInit) — reached the same way the
  // codebase already reaches other private members under test: a type-erasing cast.
  const callHandleRequest = (
    service: McpHttpEntryService,
    request: unknown,
    response: unknown,
    nodeHandler: jest.Mock
  ) =>
    (
      service as unknown as {
        handleRequest: (req: unknown, res: unknown, nh: jest.Mock) => Promise<void>;
      }
    ).handleRequest(request, response, nodeHandler);

  it('delegates authenticated HTTP requests to the node handler with the parsed body', async () => {
    const { service } = createService();
    const request = { auth: { extra: { mcpContext } }, body: { method: 'tools/list' } };
    const response = {};
    const nodeHandler = jest.fn().mockResolvedValue(undefined);

    await callHandleRequest(service, request, response, nodeHandler);

    expect(nodeHandler).toHaveBeenCalledWith(request, response, request.body);
  });

  it('raises the per-request socket timeout so a computing MCP call is not idle-reset', async () => {
    const { service } = createService();
    const setTimeout = jest.fn();
    const request = { auth: { extra: { mcpContext } }, setTimeout };

    await callHandleRequest(service, request, {}, jest.fn().mockResolvedValue(undefined));

    expect(setTimeout).toHaveBeenCalledWith(MCP_REQUEST_SOCKET_TIMEOUT_MS);
  });

  it('does not throw when the request has no setTimeout (guard)', async () => {
    const { service } = createService();
    const request = { auth: { extra: { mcpContext } } };

    await expect(
      callHandleRequest(service, request, {}, jest.fn().mockResolvedValue(undefined))
    ).resolves.toBeUndefined();
  });

  it('keeps the socket timeout above the query deadline so the app timeout wins', () => {
    expect(MCP_REQUEST_SOCKET_TIMEOUT_MS).toBeGreaterThan(DEFAULT_QUERY_DEADLINE_MS);
  });

  it('binds McpLogContext into CLS before handling', async () => {
    const { service, cls } = createService();
    const request = {
      method: 'POST',
      headers: {},
      auth: { extra: { mcpContext: { projectId: 'p1', userId: 'u1', clientId: 'c1' } } },
      setTimeout: jest.fn(),
    };

    await callHandleRequest(service, request, {}, jest.fn().mockResolvedValue(undefined));

    expect(cls.runWithContext).toHaveBeenCalledWith(
      'McpLogContext',
      expect.objectContaining({ projectId: 'p1', userId: 'u1', clientId: 'c1' }),
      expect.any(Function)
    );
  });

  it('correlates the response-finished log with requestId and userId', async () => {
    const { service } = createService();
    const debugSpy = jest
      .spyOn((service as unknown as { logger: { debug: () => void } }).logger, 'debug')
      .mockImplementation(() => undefined);

    let finishCallback: (() => void) | undefined;
    const request = { auth: { extra: { mcpContext } }, setTimeout: jest.fn(), headers: {} };
    const response = {
      once: jest.fn((event: string, cb: () => void) => {
        if (event === 'finish') finishCallback = cb;
      }),
      statusCode: 200,
      getHeader: jest.fn(),
    };

    await callHandleRequest(service, request, response, jest.fn().mockResolvedValue(undefined));

    expect(finishCallback).toBeDefined();
    finishCallback!();

    expect(debugSpy).toHaveBeenCalledWith(
      'MCP response finished',
      expect.objectContaining({
        statusCode: 200,
        requestId: expect.any(String),
        userId: 'user-1',
        projectId: 'project-1',
        clientId: 'mcp-client-1',
      })
    );
  });

  it('warns on an error status, except the expected legacy GET 405 (standalone SSE not supported)', async () => {
    const { service } = createService();
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const request = {
      auth: { extra: { mcpContext } },
      method: 'GET',
      setTimeout: jest.fn(),
      headers: {},
    };
    let finishCallback: (() => void) | undefined;
    const response = {
      once: jest.fn((event: string, cb: () => void) => {
        if (event === 'finish') finishCallback = cb;
      }),
      statusCode: 405,
      getHeader: jest.fn(),
    };

    await callHandleRequest(service, request, response, jest.fn().mockResolvedValue(undefined));
    finishCallback!();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('mounts the auth middleware in front of the node handler on module init', () => {
    const { service, adapterHost, authMiddleware } = createService();
    const routes: Array<{ path: string; handlers: unknown[] }> = [];
    const express = {
      all: jest.fn((path: string, ...handlers: unknown[]) => routes.push({ path, handlers })),
    };
    (adapterHost.httpAdapter.getInstance as jest.Mock).mockReturnValue(express);

    service.onModuleInit();

    expect(express.all).toHaveBeenCalledTimes(1);
    expect(routes[0].path).toBe('/mcp');
    expect(routes[0].handlers[0]).toBe(authMiddleware.handle);
  });

  it('closes the handler on module destroy', async () => {
    const { service, adapterHost } = createService();
    (adapterHost.httpAdapter.getInstance as jest.Mock).mockReturnValue({ all: jest.fn() });
    service.onModuleInit();

    await service.onModuleDestroy();

    // No throw is the contract here; onModuleInit's real createMcpHandler() provides a real
    // close() — asserting it resolves is the meaningful check without mocking the SDK's factory.
  });
});

describe('McpHttpEntryService onTransportError', () => {
  const createService = () => {
    const adapterHost = { httpAdapter: { getInstance: jest.fn() } } as unknown as HttpAdapterHost;
    return new McpHttpEntryService(
      adapterHost,
      {} as McpAuthMiddleware,
      {} as McpSdkServerFactory,
      {} as McpInstructionsService,
      {} as ClsContextService
    );
  };

  const callOnTransportError = (service: McpHttpEntryService, error: Error) =>
    (service as unknown as { onTransportError: (e: Error) => void }).onTransportError(error);

  it('logs ERROR for a protocol version ODM is expected to support', () => {
    const service = createService();
    const errorSpy = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const error = new UnsupportedProtocolVersionError({
      requested: '2026-07-28',
      supported: ['2025-11-25'],
    });

    callOnTransportError(service, error);

    expect(errorSpy).toHaveBeenCalledWith(
      'MCP rejected a protocol version it is expected to support',
      expect.objectContaining({ requestedProtocolVersion: '2026-07-28' })
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs WARN for a genuinely unsupported (future/garbage) protocol version', () => {
    const service = createService();
    const errorSpy = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const error = new UnsupportedProtocolVersionError({
      requested: '2099-01-01',
      supported: ['2025-11-25', '2026-07-28'],
    });

    callOnTransportError(service, error);

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs WARN for a non-version transport error', () => {
    const service = createService();
    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    callOnTransportError(service, new Error('connection reset'));

    expect(warnSpy).toHaveBeenCalledWith(
      'MCP SDK transport error',
      expect.objectContaining({ message: 'connection reset' })
    );
  });
});
