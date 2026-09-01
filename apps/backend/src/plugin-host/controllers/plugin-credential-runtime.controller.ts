import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RequirePluginAuth, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  CredentialFetchRequestApiDto,
  CredentialFetchResponseApiDto,
} from '../../data-marts/credentials/dto/credential-fetch-api.dto';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { normalizeCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { CredentialFetchService } from '../../data-marts/credentials/services/credential-fetch.service';
import { CredentialAiService } from '../../data-marts/credentials/services/credential-ai.service';
import {
  CredentialAiRequestApiDto,
  type CredentialAiModelKey,
} from '../../data-marts/credentials/dto/credential-ai-api.dto';
import type { StoredCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { PluginService } from '../services/plugin.service';
import { PluginVersionService } from '../services/plugin-version.service';

@ApiTags('Plugin Credentials')
@Controller('plugins/runtime/credentials')
@Auth(Role.viewer(Strategy.PARSE))
@RequirePluginAuth()
export class PluginCredentialRuntimeController {
  constructor(
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly fetchService: CredentialFetchService,
    private readonly aiService: CredentialAiService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly bindings: CredentialConsumerBindingFacade
  ) {}

  @Post(':handle/fetch')
  @ApiOkResponse({ type: CredentialFetchResponseApiDto })
  async fetch(
    @Param('handle') handle: string,
    @Body() input: CredentialFetchRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<CredentialFetchResponseApiDto> {
    const binding = await this.resolveBinding(handle, context, 'fetch');
    const disconnected = requestAbortSignal(request);
    try {
      const response = await this.fetchService.run(binding, input, {
        signal: disconnected.signal,
      });
      await this.markUsed(binding, context);
      return response;
    } finally {
      disconnected.dispose();
    }
  }

  @Post(':handle/ai/generate')
  @ApiOkResponse({ description: 'Portable Vercel AI SDK LanguageModelV4 generate result.' })
  async generate(
    @Param('handle') handle: string,
    @Body() input: CredentialAiRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<unknown> {
    if (input.model === 'embedding') {
      throw new BadRequestException('A language model mapping is required');
    }
    const binding = await this.resolveBinding(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    try {
      const result = await this.aiService.generate(
        binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding, context);
      return result;
    } finally {
      disconnected.dispose();
    }
  }

  @Post(':handle/ai/embed')
  @ApiOkResponse({ description: 'Portable Vercel AI SDK EmbeddingModelV4 result.' })
  async embed(
    @Param('handle') handle: string,
    @Body() input: CredentialAiRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<unknown> {
    if (input.model !== 'embedding') {
      throw new BadRequestException('The embedding model mapping is required');
    }
    const binding = await this.resolveBinding(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    try {
      const result = await this.aiService.embed(
        binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding, context);
      return result;
    } finally {
      disconnected.dispose();
    }
  }

  @Post(':handle/ai/stream')
  @ApiProduces('application/x-ndjson')
  async stream(
    @Param('handle') handle: string,
    @Body() input: CredentialAiRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    if (input.model === 'embedding') {
      throw new BadRequestException('A language model mapping is required');
    }
    const binding = await this.resolveBinding(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    let stream: ReadableStream<unknown>;
    try {
      stream = await this.aiService.stream(
        binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding, context);
    } catch (error) {
      disconnected.dispose();
      throw error;
    }

    response.status(200);
    response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.flushHeaders();

    const reader = stream.getReader();
    try {
      while (!disconnected.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!response.write(`${JSON.stringify(value)}\n`)) {
          await waitForDrain(response, disconnected.signal);
        }
      }
    } catch (error) {
      if (!disconnected.signal.aborted) throw error;
    } finally {
      await reader.cancel().catch(() => undefined);
      disconnected.dispose();
      if (!response.writableEnded && !response.destroyed) response.end();
    }
  }

  private async resolveBinding(
    handle: string,
    context: AuthorizationContext,
    capability?: 'fetch' | CredentialAiModelKey
  ) {
    if (!context.installationId || !context.pluginId) {
      throw new ForbiddenException('A plugin installation is required');
    }

    const plugin = await this.plugins.findById(context.pluginId);
    if (!plugin?.currentVersionId) {
      throw new NotFoundException('The active plugin version was not found');
    }
    const version = await this.versions.findById(plugin.currentVersionId);
    if (!version) {
      throw new NotFoundException('The active plugin version was not found');
    }

    const requirement = (version.credentialRequirements ?? []).find(
      candidate => normalizeCredentialRequirement(candidate).key === handle
    );
    if (!requirement) {
      throw new NotFoundException(`Credential ${handle} is not declared by this plugin`);
    }
    if (capability === 'fetch') assertExactRequirement(requirement);
    else if (capability) assertDeclaredAiModel(requirement, capability);

    return this.bindings.resolveBinding({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles ?? [],
      consumerType: 'plugin-installation',
      consumerId: context.installationId,
      requirement,
    });
  }

  private markUsed(
    binding: { readonly credentialId: string; readonly requirement: { readonly key: string } },
    context: AuthorizationContext
  ): Promise<void> {
    return this.bindings.markUsed({
      credentialId: binding.credentialId,
      consumerType: 'plugin-installation',
      consumerId: context.installationId!,
      requirementKey: binding.requirement.key,
    });
  }
}

function assertExactRequirement(requirement: StoredCredentialRequirement): void {
  if (normalizeCredentialRequirement(requirement).definitionId === null) {
    throw new NotFoundException('Logical AI Credentials do not expose exact fetch access');
  }
}

function assertDeclaredAiModel(
  requirement: StoredCredentialRequirement,
  model: CredentialAiModelKey
): void {
  const normalized = normalizeCredentialRequirement(requirement);
  if (normalized.definitionId !== null || !normalized.models.includes(model)) {
    throw new NotFoundException(`AI model ${model} is not declared by this plugin`);
  }
}

function requestAbortSignal(request: Request): {
  readonly signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  request.res?.once('close', abort);
  request.res?.once('error', abort);
  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort);
      request.res?.off('close', abort);
      request.res?.off('error', abort);
    },
  };
}

function waitForDrain(response: Response, signal: AbortSignal): Promise<void> {
  if (signal.aborted || response.destroyed) {
    return Promise.reject(signal.reason ?? new DOMException('Response closed', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      response.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onDrain = () => finish();
    const onClose = () => finish(new DOMException('Response closed', 'AbortError'));
    const onError = (error: Error) => finish(error);
    const onAbort = () =>
      finish(signal.reason ?? new DOMException('Response closed', 'AbortError'));

    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
