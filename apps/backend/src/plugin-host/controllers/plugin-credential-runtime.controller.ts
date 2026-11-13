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
  UseFilters,
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
  type ResolvedCredentialBinding,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { normalizeCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { CredentialFetchService } from '../../data-marts/credentials/services/credential-fetch.service';
import { CredentialAiService } from '../../data-marts/credentials/services/credential-ai.service';
import {
  CredentialAiRequestApiDto,
  type CredentialAiModelKey,
} from '../../data-marts/credentials/dto/credential-ai-api.dto';
import type { StoredCredentialRequirement } from '../../data-marts/credentials/credential.types';
import {
  OWOX_AI_FACADE,
  type OwoxAiFacade,
} from '../../data-marts/credentials/facades/owox-ai.facade';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginService } from '../services/plugin.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { requestAbortSignal } from '../utils/request-abort-signal.util';

@ApiTags('Plugin Credentials')
@Controller('plugins/runtime/credentials')
@Auth(Role.viewer(Strategy.PARSE))
@RequirePluginAuth()
@UseFilters(PluginHostExceptionFilter)
export class PluginCredentialRuntimeController {
  constructor(
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly fetchService: CredentialFetchService,
    private readonly aiService: CredentialAiService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly bindings: CredentialConsumerBindingFacade,
    private readonly installations: PluginInstallationService,
    @Inject(OWOX_AI_FACADE) private readonly owoxAi: OwoxAiFacade
  ) {}

  @Post(':handle/fetch')
  @ApiOkResponse({ type: CredentialFetchResponseApiDto })
  async fetch(
    @Param('handle') handle: string,
    @Body() input: CredentialFetchRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<CredentialFetchResponseApiDto> {
    const binding = await this.resolveCredential(handle, context);
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
    if (input.model !== 'fast' && input.model !== 'reasoning') {
      throw new BadRequestException('A language model mapping is required');
    }
    const binding = await this.resolveAiRoute(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    try {
      if (binding.kind === 'owox-ai') {
        return await this.owoxAi.generate(
          this.consumption(context, binding),
          input.model,
          input.options,
          disconnected.signal
        );
      }
      const result = await this.aiService.generate(
        binding.binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding.binding, context);
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
    const binding = await this.resolveAiRoute(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    try {
      if (binding.kind === 'owox-ai') {
        return await this.owoxAi.embed(
          this.consumption(context, binding),
          input.options,
          disconnected.signal
        );
      }
      const result = await this.aiService.embed(
        binding.binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding.binding, context);
      return result;
    } finally {
      disconnected.dispose();
    }
  }

  @Post(':handle/ai/decide')
  @ApiOkResponse({ description: 'Portable Vercel AI SDK DecisionModelV4 result.' })
  async decide(
    @Param('handle') handle: string,
    @Body() input: CredentialAiRequestApiDto,
    @AuthContext() context: AuthorizationContext,
    @Req() request: Request
  ): Promise<unknown> {
    if (input.model !== 'decision') {
      throw new BadRequestException('The decision model mapping is required');
    }
    const binding = await this.resolveAiRoute(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    try {
      if (binding.kind === 'owox-ai') {
        return await this.owoxAi.decide(
          this.consumption(context, binding),
          input.options,
          disconnected.signal
        );
      }
      const result = await this.aiService.decide(
        binding.binding,
        input.model,
        input.options,
        disconnected.signal
      );
      await this.markUsed(binding.binding, context);
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
    if (input.model !== 'fast' && input.model !== 'reasoning') {
      throw new BadRequestException('A language model mapping is required');
    }
    const binding = await this.resolveAiRoute(handle, context, input.model);
    const disconnected = requestAbortSignal(request);
    let stream: ReadableStream<unknown>;
    try {
      if (binding.kind === 'owox-ai') {
        stream = await this.owoxAi.stream(
          this.consumption(context, binding),
          input.model,
          input.options,
          disconnected.signal
        );
      } else {
        stream = await this.aiService.stream(
          binding.binding,
          input.model,
          input.options,
          disconnected.signal
        );
        await this.markUsed(binding.binding, context);
      }
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

  /** Fetch is exact-Credential access, so OWOX AI never applies to it. */
  private async resolveCredential(
    handle: string,
    context: AuthorizationContext
  ): Promise<ResolvedCredentialBinding> {
    const { requirement } = await this.findRequirement(handle, context, 'fetch');
    return this.bindCredential(requirement, context);
  }

  private async resolveAiRoute(
    handle: string,
    context: AuthorizationContext,
    model: CredentialAiModelKey
  ): Promise<CredentialRoute | OwoxAiRoute> {
    const { requirement, version } = await this.findRequirement(handle, context, model);
    const installation = await this.installations.findById(context.installationId!);
    // An uninstalled plugin keeps owoxAi, but a backend action can still run until its deadline.
    if (installation?.owoxAi && !installation.uninstalledAt) {
      // As on the Credential path, every declared model must be available, not only this one.
      const { key, models } = normalizeCredentialRequirement(requirement);
      if (!this.owoxAi.provides(models)) {
        throw new NotFoundException(`Credential ${key} is not configured`);
      }
      return { kind: 'owox-ai', pluginTitle: version.displayName };
    }
    return { kind: 'credential', binding: await this.bindCredential(requirement, context) };
  }

  private async findRequirement(
    handle: string,
    context: AuthorizationContext,
    capability: 'fetch' | CredentialAiModelKey
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
    else assertDeclaredAiModel(requirement, capability);
    return { requirement, version };
  }

  private bindCredential(
    requirement: StoredCredentialRequirement,
    context: AuthorizationContext
  ): Promise<ResolvedCredentialBinding> {
    return this.bindings.resolveBinding({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles ?? [],
      consumerType: 'plugin-installation',
      consumerId: context.installationId!,
      requirement,
    });
  }

  private consumption(context: AuthorizationContext, route: OwoxAiRoute) {
    return {
      projectId: context.projectId,
      pluginId: context.pluginId!,
      pluginTitle: route.pluginTitle,
    };
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

type OwoxAiRoute = { kind: 'owox-ai'; pluginTitle: string };
type CredentialRoute = { kind: 'credential'; binding: ResolvedCredentialBinding };

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
