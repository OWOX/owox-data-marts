import { MutateContextSetupService } from '../use-cases/contexts/mutate-context-setup.service';
import type { ContextChange, ContextMutation } from '../dto/domain/context-mutation.dto';
import { Injectable } from '@nestjs/common';
import type { ContextResourceQuery, ContextSetupActor } from '../dto/domain/mcp-context-setup.dto';
import { ReadContextSetupService } from '../use-cases/contexts/read-context-setup.service';
import type { McpContextSetupFacade } from './mcp-context-setup.facade';

@Injectable()
export class McpContextSetupFacadeImpl implements McpContextSetupFacade {
  constructor(
    private readonly reader: ReadContextSetupService,
    private readonly writer: MutateContextSetupService
  ) {}

  mutate(actor: ContextSetupActor, command: ContextMutation) {
    return this.writer.run(actor, command);
  }

  getChangeImpact(actor: ContextSetupActor, change: ContextChange) {
    return this.writer.impact(actor, change);
  }

  async getContext(actor: ContextSetupActor, contextId: string) {
    actor = await this.writer.authorize(actor, false);
    return this.reader.getContext(actor, contextId);
  }

  async listResources(actor: ContextSetupActor, query: ContextResourceQuery) {
    actor = await this.writer.authorize(actor, false);
    return this.reader.listResources(actor, query);
  }

  async listMembers(
    actor: ContextSetupActor,
    query: { query?: string; limit: number; offset: number }
  ) {
    actor = await this.writer.authorize(actor, false);
    return this.reader.listMembers(actor, query);
  }

  async getDefaults(actor: ContextSetupActor) {
    actor = await this.writer.authorize(actor, true);
    return this.reader.getDefaults(actor);
  }

  async getImpact(actor: ContextSetupActor, contextId: string) {
    actor = await this.writer.authorize(actor, true);
    const detail = await this.reader.getImpact(actor, contextId);
    const reviewed = await this.writer.impact(actor, { action: 'delete_context', contextId });
    const blockers = reviewed.effects.blockers;
    const names = {
      dataMartCount: 'detach_data_marts',
      storageCount: 'detach_storages',
      destinationCount: 'detach_destinations',
      credentialCount: 'detach_credentials',
      memberCount: 'reassign_members',
      userProvisioningDefaultsCount: 'reassign_provisioning_defaults',
    };
    return {
      ...detail,
      revision: reviewed.revision,
      impactDigest: reviewed.impactDigest,
      blockers,
      affectedMemberIds: reviewed.effects.affectedMemberIds,
      detached: Object.values(blockers).every(count => count === 0),
      requiredActions: Object.entries(blockers)
        .filter(([, count]) => count > 0)
        .map(([key]) => names[key]),
    };
  }
}
