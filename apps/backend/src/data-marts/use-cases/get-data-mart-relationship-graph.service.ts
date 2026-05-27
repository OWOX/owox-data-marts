import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { GetRelationshipGraphCommand } from '../dto/domain/get-relationship-graph.command';
import {
  RelationshipGraphDto,
  RelationshipGraphNodeDto,
} from '../dto/domain/relationship-graph.dto';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

interface CollectedNode {
  relationship: DataMartRelationship;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

interface WalkContext {
  bySource: ReadonlyMap<string, DataMartRelationship[]>;
  out: CollectedNode[];
}

interface WalkFrame {
  dmId: string;
  aliasPath: string;
  depth: number;
  ancestors: ReadonlySet<string>;
  parentBlocked: boolean;
}

@Injectable()
export class GetDataMartRelationshipGraphService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetRelationshipGraphCommand): Promise<RelationshipGraphDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const rootDataMart = await this.dataMartService.getByIdAndProjectId(
      command.rootDataMartId,
      command.projectId
    );

    const allStorageRelationships = await this.relationshipService.findByStorageId(
      rootDataMart.storage.id,
      command.projectId
    );

    const bySource = new Map<string, DataMartRelationship[]>();
    for (const rel of allStorageRelationships) {
      const list = bySource.get(rel.sourceDataMart.id);
      if (list) list.push(rel);
      else bySource.set(rel.sourceDataMart.id, [rel]);
    }

    const collected: CollectedNode[] = [];
    const rootIsDraft = rootDataMart.status === DataMartStatus.DRAFT;
    this.walk(
      { bySource, out: collected },
      {
        dmId: rootDataMart.id,
        aliasPath: '',
        depth: 1,
        ancestors: new Set([rootDataMart.id]),
        parentBlocked: rootIsDraft,
      }
    );

    const involvedDataMartIds = new Set<string>([rootDataMart.id]);
    for (const node of collected) {
      involvedDataMartIds.add(node.relationship.sourceDataMart.id);
      if (!node.isCycleStub) {
        involvedDataMartIds.add(node.relationship.targetDataMart.id);
      }
    }

    const [accessByDataMartId, userProjectionsList] = await Promise.all([
      this.accessDecisionService.canAccessMany(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        Array.from(involvedDataMartIds),
        Action.SEE,
        command.projectId
      ),
      this.userProjectionsFetcherService.fetchRelevantUserProjections(
        collected.map(n => n.relationship)
      ),
    ]);

    if (!accessByDataMartId.get(rootDataMart.id)) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    const nodes: RelationshipGraphNodeDto[] = this.mapper
      .toDomainDtoList(
        collected.map(n => n.relationship),
        userProjectionsList,
        accessByDataMartId
      )
      .map((relationship, i) => ({
        relationship,
        aliasPath: collected[i].aliasPath,
        depth: collected[i].depth,
        isCycleStub: collected[i].isCycleStub,
        isBlocked: collected[i].isBlocked,
      }));

    return { rootDataMartId: rootDataMart.id, nodes };
  }

  private walk(ctx: WalkContext, frame: WalkFrame): void {
    const rels = ctx.bySource.get(frame.dmId) ?? [];
    for (const rel of rels) {
      const aliasPath = frame.aliasPath ? `${frame.aliasPath}.${rel.targetAlias}` : rel.targetAlias;
      const targetId = rel.targetDataMart.id;
      const isJoinNotConfigured = !rel.joinConditions || rel.joinConditions.length === 0;
      const isDraft = rel.targetDataMart.status === DataMartStatus.DRAFT;
      const isCycleStub = frame.ancestors.has(targetId);

      ctx.out.push({
        relationship: rel,
        aliasPath,
        depth: frame.depth,
        isCycleStub,
        isBlocked: frame.parentBlocked,
      });

      if (isCycleStub) continue;

      const childAncestors = new Set(frame.ancestors);
      childAncestors.add(targetId);
      this.walk(ctx, {
        dmId: targetId,
        aliasPath,
        depth: frame.depth + 1,
        ancestors: childAncestors,
        parentBlocked: frame.parentBlocked || isDraft || isJoinNotConfigured,
      });
    }
  }
}
