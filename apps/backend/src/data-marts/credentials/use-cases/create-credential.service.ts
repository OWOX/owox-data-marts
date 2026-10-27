import { BadRequestException, Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import type { AuthorizationContext } from '../../../idp';
import type {
  CreateCredentialApiDto,
  ResolvedCredentialDefinition,
} from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { parseGoogleServiceAccountKey } from '../services/google-service-account-key';
import { CredentialViewService } from '../services/credential-view.service';
import { CredentialValidationProbeService } from '../services/credential-validation-probe.service';
import { parseFieldsForCreate } from '../services/credential-fields';
import {
  isCredentialAiModelInCatalog,
  type CredentialAiModelMappingSources,
  type CredentialAiModelMappingModes,
  type CredentialAiModelMappings,
  type CredentialDefinitionContract,
  type CredentialPublicMetadata,
  type CredentialSecret,
  type CredentialValidationResult,
} from '../credential.types';

@Injectable()
export class CreateCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly view: CredentialViewService,
    private readonly validationProbe: CredentialValidationProbeService
  ) {}

  async run(context: AuthorizationContext, input: CreateCredentialApiDto): Promise<CredentialDto> {
    const definition = await this.definitions.get(input.definitionId);
    const { auth } = definition.contract;
    if (auth.type === 'oauth') {
      throw new BadRequestException('Connect a Google account to create this Credential.');
    }
    assertCredentialInputKind(auth, input);
    const aiConfiguration = normalizeAiConfiguration(
      input.aiModelMappings,
      input.aiModelMappingModes,
      definition.contract.ai
    );
    if (auth.type === 'fields') {
      // A field set has no provider check, so it starts as unknown.
      const { secret, publicMetadata } = parseFieldsForCreate(
        auth,
        input.fields,
        definition.definitionId
      );
      return this.persist(context, input, definition, aiConfiguration, secret, publicMetadata);
    }
    if (input.secret == null) {
      throw new BadRequestException('This Credential definition requires a secret value');
    }
    const secret = { value: input.secret.value };
    const publicMetadata =
      auth.type === 'google-service-account'
        ? parseGoogleServiceAccountKey(secret.value).metadata
        : null;
    // Outside the transaction: the provider check can take seconds and must not hold a connection.
    const validation = await this.validationProbe.run(definition, secret);
    if (validation.state === 'rejected') {
      throw new BadRequestException(validation.message);
    }
    return this.persist(
      context,
      input,
      definition,
      aiConfiguration,
      secret,
      publicMetadata,
      validation
    );
  }

  @Transactional()
  private async persist(
    context: AuthorizationContext,
    input: CreateCredentialApiDto,
    definition: ResolvedCredentialDefinition,
    aiConfiguration: ReturnType<typeof normalizeAiConfiguration>,
    secret: CredentialSecret,
    publicMetadata: CredentialPublicMetadata | null,
    validation?: CredentialValidationResult
  ): Promise<CredentialDto> {
    const credential = await this.credentials.createWithAccess(
      {
        projectId: context.projectId,
        title: input.title.trim(),
        definitionSource: definition.source,
        definitionId: input.definitionId,
        acceptedCompatibilityLine: definition.compatibilityLine,
        secret,
        aiModelMappings: aiConfiguration.mappings,
        aiModelMappingModes: aiConfiguration.modes,
        aiModelMappingSources: aiConfiguration.sources,
        enabled: true,
        availableForUse: input.availableForUse ?? true,
        availableForMaintenance: input.availableForMaintenance ?? false,
        validationState: validation?.state ?? 'unknown',
        validationMessage: validation?.message ?? null,
        validatedAt: validation?.validatedAt ?? null,
        publicMetadata,
      },
      { createdBy: context, ownerIds: input.ownerIds ?? [], contextIds: input.contextIds ?? [] }
    );

    return this.view.build(
      await this.credentials.getByIdAndProjectId(credential.id, context.projectId),
      context,
      validation
    );
  }
}

/** A field set takes `fields`, OAuth takes neither, and the other kinds take `secret`. */
export function assertCredentialInputKind(
  auth: CredentialDefinitionContract['auth'],
  input: { readonly secret?: unknown; readonly fields?: unknown }
): void {
  if (input.fields != null && auth.type !== 'fields') {
    throw new BadRequestException('This Credential definition does not take fields');
  }
  if (input.secret != null && (auth.type === 'fields' || auth.type === 'oauth')) {
    throw new BadRequestException('This Credential definition does not take a secret value');
  }
}

export function validateAiMappings(
  mappings: CredentialAiModelMappings | null | undefined,
  ai: CredentialDefinitionContract['ai'] | undefined
): void {
  if (mappings == null || Object.keys(mappings).length === 0) {
    if (ai) {
      throw new BadRequestException('AI Credentials require fast and reasoning model mappings');
    }
    return;
  }
  if (!ai) {
    throw new BadRequestException('This Credential definition does not support AI models');
  }
  for (const [key, value] of Object.entries(mappings)) {
    assertAiCapability(key);
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('AI model mappings must contain non-empty string values');
    }
    assertAiModelKind(ai, key, value);
  }
  for (const capability of ['fast', 'reasoning'] as const) {
    if (!mappings[capability]?.trim()) {
      throw new BadRequestException(`AI model mapping ${capability} is required`);
    }
  }
}

export function normalizeAiConfiguration(
  mappings: CredentialAiModelMappings | null | undefined,
  modes: CredentialAiModelMappingModes | null | undefined,
  ai: CredentialDefinitionContract['ai'] | undefined,
  current?: {
    readonly mappings: CredentialAiModelMappings | null;
    readonly modes: CredentialAiModelMappingModes | null;
    readonly sources: CredentialAiModelMappingSources | null;
  }
): {
  readonly mappings: CredentialAiModelMappings | null;
  readonly modes: CredentialAiModelMappingModes | null;
  readonly sources: CredentialAiModelMappingSources | null;
} {
  const hasMappings = mappings != null && Object.keys(mappings).length > 0;
  const hasModes = modes != null && Object.keys(modes).length > 0;
  if (!ai) {
    if (hasMappings || hasModes) {
      throw new BadRequestException('This Credential definition does not support AI models');
    }
    return { mappings: null, modes: null, sources: null };
  }
  if (mappings === null) {
    throw new BadRequestException('AI Credentials require fast and reasoning model mappings');
  }

  const resolvedMappings: CredentialAiModelMappings = current
    ? { ...(current.mappings ?? {}), ...(mappings ?? {}) }
    : { ...(mappings ?? ai?.recommended ?? {}) };
  const resolvedModes: CredentialAiModelMappingModes = current
    ? { ...(current.modes ?? {}), ...(modes ?? {}) }
    : { ...(modes ?? inferAiMappingModes(resolvedMappings, ai?.recommended)) };

  if (current && mappings) {
    for (const key of Object.keys(mappings)) {
      if (!modes || !Object.hasOwn(modes, key)) resolvedModes[key] = 'override';
    }
  }

  for (const [key, mode] of Object.entries(resolvedModes)) {
    assertAiCapability(key);
    if (mode !== 'recommended' && mode !== 'override') {
      throw new BadRequestException('AI mapping mode must be recommended or override');
    }
    if (mode === 'recommended') {
      const recommended = ai?.recommended?.[key as keyof typeof ai.recommended];
      if (!recommended) {
        throw new BadRequestException(`AI model mapping ${key} has no recommended model`);
      }
      resolvedMappings[key] = recommended;
    } else if (!resolvedMappings[key]?.trim()) {
      throw new BadRequestException(`AI model override ${key} is required`);
    }
  }
  for (const key of Object.keys(resolvedMappings)) {
    resolvedModes[key] ??= 'override';
  }
  validateAiMappings(resolvedMappings, ai);

  const resolvedSources: CredentialAiModelMappingSources = { ...(current?.sources ?? {}) };
  for (const [key, modelId] of Object.entries(resolvedMappings)) {
    const mappingChanged = mappings !== undefined && Object.hasOwn(mappings ?? {}, key);
    const modeChanged = modes !== undefined && Object.hasOwn(modes ?? {}, key);
    if (
      resolvedModes[key] === 'recommended' ||
      !current ||
      mappingChanged ||
      modeChanged ||
      !resolvedSources[key]
    ) {
      resolvedSources[key] =
        ai && isCredentialAiModelInCatalog(ai, key, modelId) ? 'catalog' : 'manual';
    }
  }

  return Object.keys(resolvedMappings).length === 0
    ? { mappings: null, modes: null, sources: null }
    : { mappings: resolvedMappings, modes: resolvedModes, sources: resolvedSources };
}

const AI_CAPABILITIES = new Set(['fast', 'reasoning', 'embedding']);

function assertAiCapability(key: string): void {
  if (!AI_CAPABILITIES.has(key)) {
    throw new BadRequestException(`Unsupported AI model mapping ${key}`);
  }
}

function assertAiModelKind(
  ai: NonNullable<CredentialDefinitionContract['ai']>,
  capability: string,
  modelId: string
): void {
  const oppositeCatalog = capability === 'embedding' ? ai.models?.language : ai.models?.embedding;
  if (oppositeCatalog?.some(model => model.id === modelId)) {
    throw new BadRequestException(
      `AI model ${modelId} is not compatible with the ${capability} mapping`
    );
  }
}

function inferAiMappingModes(
  mappings: CredentialAiModelMappings,
  recommended: Partial<CredentialAiModelMappings> | undefined
): CredentialAiModelMappingModes {
  return Object.fromEntries(
    Object.entries(mappings).map(([key, value]) => [
      key,
      recommended?.[key] === value ? 'recommended' : 'override',
    ])
  );
}
