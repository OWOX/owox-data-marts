import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transactional } from 'typeorm-transactional';
import { In, Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import {
  isCredentialAiModelInCatalog,
  normalizeCredentialRequirement,
  resolveCredentialAiModelMappings,
  type NormalizedCredentialRequirement,
} from '../credential.types';
import { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import { Credential } from '../entities/credential.entity';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import type {
  CredentialConsumerBindingFacade,
  MarkCredentialUsedRequest,
  ReconcileCredentialBindingsRequest,
  ReplaceCredentialBindingsRequest,
  ResolveCredentialBindingRequest,
  ResolvedCredentialBinding,
} from './credential-consumer-binding.facade';

@Injectable()
export class CredentialConsumerBindingFacadeImpl implements CredentialConsumerBindingFacade {
  constructor(
    @InjectRepository(CredentialConsumerBinding)
    private readonly bindings: Repository<CredentialConsumerBinding>,
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly credentialService: CredentialService
  ) {}

  @Transactional()
  async replaceBindings(request: ReplaceCredentialBindingsRequest): Promise<void> {
    const requirements = request.requirements.map(normalizeCredentialRequirement);
    assertUniqueRequirementKeys(requirements);
    const declaredKeys = new Set(requirements.map(requirement => requirement.key));
    const undeclared = Object.keys(request.selections).find(key => !declaredKeys.has(key));
    if (undeclared) {
      throw new BadRequestException(`Credential selection ${undeclared} is not declared`);
    }

    const requested: Array<{
      requirement: NormalizedCredentialRequirement;
      credentialId: string;
    }> = [];

    for (const requirement of requirements) {
      if (!Object.hasOwn(request.selections, requirement.key)) {
        throw new BadRequestException(
          `Credential selection decision is required for ${requirement.key}`
        );
      }
      const credentialId = request.selections[requirement.key];
      if (!credentialId) {
        if (requirement.optional) continue;
        throw new BadRequestException(`Credential selection is required for ${requirement.key}`);
      }

      requested.push({ requirement, credentialId });
    }

    const lockedCredentials = new Map<string, Credential>();
    const credentialIds = [...new Set(requested.map(row => row.credentialId))].sort();
    for (const credentialId of credentialIds) {
      const credential = await this.credentialService.lockActiveByIdAndProjectId(
        credentialId,
        request.projectId
      );
      if (!credential || !credential.enabled) {
        throw new BadRequestException(`Credential ${credentialId} is not available`);
      }
      lockedCredentials.set(credentialId, credential);
    }

    const selected: Array<{
      requirement: NormalizedCredentialRequirement;
      credential: Credential;
    }> = [];
    for (const { requirement, credentialId } of requested) {
      const credential = lockedCredentials.get(credentialId)!;
      await this.assertRequirementMatches(credential, requirement);
      const canUse = await this.access.canAccess(
        request.userId,
        [...request.roles],
        EntityType.CREDENTIAL,
        credential.id,
        Action.USE,
        request.projectId
      );
      if (!canUse) {
        throw new ForbiddenException(
          `You do not have permission to use Credential ${credential.id}`
        );
      }
      selected.push({ requirement, credential });
    }

    const existing = await this.bindings.find({
      where: {
        consumerType: request.consumerType,
        consumerId: request.consumerId,
        projectId: request.projectId,
      },
    });
    const byKey = new Map(existing.map(binding => [binding.requirementKey, binding]));
    const selectedKeys = new Set(selected.map(row => row.requirement.key));

    for (const binding of existing) {
      if (!selectedKeys.has(binding.requirementKey)) binding.active = false;
    }
    for (const { requirement, credential } of selected) {
      const binding =
        byKey.get(requirement.key) ??
        this.bindings.create({
          projectId: request.projectId,
          consumerType: request.consumerType,
          consumerId: request.consumerId,
          requirementKey: requirement.key,
        });
      if (binding.credentialId !== credential.id) binding.lastUsedAt = null;
      binding.credentialId = credential.id;
      binding.requirementSnapshot = requirement;
      binding.requirementRevision = requirementRevision(requirement);
      binding.configuredById = request.userId;
      binding.active = true;
      byKey.set(requirement.key, binding);
    }
    await this.bindings.save([...byKey.values()]);
  }

  async deactivateConsumer(
    consumerType: 'plugin-installation',
    consumerId: string,
    projectId: string
  ): Promise<void> {
    await this.bindings.update({ consumerType, consumerId, projectId }, { active: false });
  }

  async resolveBinding(
    request: ResolveCredentialBindingRequest
  ): Promise<ResolvedCredentialBinding> {
    const requirement = normalizeCredentialRequirement(request.requirement);
    const binding = await this.bindings.findOneBy({
      consumerType: request.consumerType,
      consumerId: request.consumerId,
      projectId: request.projectId,
      requirementKey: requirement.key,
      active: true,
    });
    if (!binding || !sameRequirement(binding.requirementSnapshot, requirement)) {
      throw new NotFoundException(`Credential ${requirement.key} is not configured`);
    }

    const credential = await this.credentials.findOneBy({
      id: binding.credentialId,
      projectId: request.projectId,
    });
    if (!credential || !credential.enabled) {
      throw new ForbiddenException('The selected Credential is disabled or unavailable');
    }

    const match = await this.assertRequirementMatches(credential, requirement);
    const canUse = await this.access.canAccess(
      request.userId,
      [...request.roles],
      EntityType.CREDENTIAL,
      credential.id,
      Action.USE,
      request.projectId
    );
    if (!canUse) {
      throw new ForbiddenException('Credential use permission is no longer available');
    }

    return {
      credentialId: credential.id,
      requirement,
      secret: credential.secret,
      definition: match.definition.contract,
      aiModelMappings: match.aiModelMappings,
    };
  }

  async assertConsumerReady(request: {
    readonly projectId: string;
    readonly userId: string;
    readonly roles: readonly string[];
    readonly consumerType: 'plugin-installation';
    readonly consumerId: string;
    readonly requirements: ReplaceCredentialBindingsRequest['requirements'];
  }): Promise<readonly NormalizedCredentialRequirement[]> {
    const requirements = request.requirements.map(normalizeCredentialRequirement);
    assertUniqueRequirementKeys(requirements);
    const ready: NormalizedCredentialRequirement[] = [];
    for (const [index, requirement] of requirements.entries()) {
      const binding = await this.bindings.findOneBy({
        consumerType: request.consumerType,
        consumerId: request.consumerId,
        projectId: request.projectId,
        requirementKey: requirement.key,
        active: true,
      });
      if (!binding && requirement.optional) continue;
      try {
        await this.resolveBinding({
          ...request,
          requirement: request.requirements[index],
        });
      } catch (error) {
        if (requirement.optional && isExpectedUnusableCredentialError(error)) continue;
        throw error;
      }
      ready.push(requirement);
    }
    return ready;
  }

  async reconcileBindings(request: ReconcileCredentialBindingsRequest): Promise<void> {
    if (request.consumerIds.length === 0) return;
    const requirements = request.requirements.map(normalizeCredentialRequirement);
    assertUniqueRequirementKeys(requirements);
    const currentByKey = new Map(requirements.map(requirement => [requirement.key, requirement]));
    const active = await this.bindings.find({
      where: {
        consumerType: request.consumerType,
        consumerId: In([...request.consumerIds]),
        active: true,
      },
    });
    const stale = active.filter(binding => {
      const current = currentByKey.get(binding.requirementKey);
      return !current || !sameRequirement(binding.requirementSnapshot, current);
    });
    if (stale.length === 0) return;
    const byRevision = new Map<string, CredentialConsumerBinding[]>();
    for (const binding of stale) {
      const revision =
        binding.requirementRevision || requirementRevision(binding.requirementSnapshot);
      const rows = byRevision.get(revision) ?? [];
      rows.push(binding);
      byRevision.set(revision, rows);
    }
    await Promise.all(
      [...byRevision.entries()].map(([revision, rows]) =>
        this.bindings.update(
          { id: In(rows.map(binding => binding.id)), active: true, requirementRevision: revision },
          { active: false }
        )
      )
    );
  }

  markUsed(request: MarkCredentialUsedRequest): Promise<void> {
    return this.credentialService.markLastUsed(request);
  }

  private async assertRequirementMatches(
    credential: Credential,
    requirement: NormalizedCredentialRequirement
  ) {
    const definition = await this.definitions.getForCredential(credential);
    if (requirement.definitionId && credential.definitionId !== requirement.definitionId) {
      throw new BadRequestException(
        `Credential ${credential.id} does not satisfy ${requirement.key}`
      );
    }
    if (!requirement.definitionId && !definition.contract.ai) {
      throw new BadRequestException(`Credential ${credential.id} is not an AI Credential`);
    }
    const aiModelMappings = resolveCredentialAiModelMappings(
      credential.aiModelMappings,
      credential.aiModelMappingModes,
      definition.contract.ai?.recommended
    );
    if (
      requirement.models.some(model => {
        const modelId = aiModelMappings?.[model]?.trim();
        return (
          !modelId ||
          !definition.contract.ai ||
          (credential.aiModelMappingSources?.[model] === 'catalog' &&
            !isCredentialAiModelInCatalog(definition.contract.ai, model, modelId))
        );
      })
    ) {
      throw new BadRequestException(
        `Credential ${credential.id} is missing required AI model mappings`
      );
    }
    return { definition, aiModelMappings };
  }
}

function isExpectedUnusableCredentialError(error: unknown): boolean {
  return (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  );
}

function assertUniqueRequirementKeys(requirements: readonly NormalizedCredentialRequirement[]) {
  const keys = new Set<string>();
  for (const requirement of requirements) {
    if (keys.has(requirement.key)) {
      throw new BadRequestException(`Duplicate Credential requirement ${requirement.key}`);
    }
    keys.add(requirement.key);
  }
}

function sameRequirement(
  left: NormalizedCredentialRequirement,
  right: NormalizedCredentialRequirement
): boolean {
  return (
    left.key === right.key &&
    left.definitionId === right.definitionId &&
    left.optional === right.optional &&
    left.models.length === right.models.length &&
    left.models.every((model, index) => model === right.models[index])
  );
}

function requirementRevision(requirement: NormalizedCredentialRequirement): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        key: requirement.key,
        definitionId: requirement.definitionId,
        optional: requirement.optional,
        models: requirement.models,
      })
    )
    .digest('hex');
}
