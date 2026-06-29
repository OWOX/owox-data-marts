import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DataDestination } from '../../entities/data-destination.entity';
import {
  DataDestinationType,
  isEmailBasedDataDestinationType,
  toHumanReadable,
} from '../../data-destination-types/enums/data-destination-type.enum';
import { EmailCredentialsSchema } from '../../data-destination-types/ee/email/schemas/email-credentials.schema';
import { ContextAccessService } from '../../services/context/context-access.service';
import { applyDataDestinationVisibilityFilter } from '../../utils/apply-data-destination-visibility-filter';
import type {
  AtomicTokenSlot,
  EntityScoringDescriptor,
  RichTextSlot,
} from '../indexing/entity-scoring-descriptor';
import { DATA_MART_SCORING_CONFIG, type ScoringConfig } from '../engine/scoring-config';
import { EntityAccessPredicateProvider } from './access-predicate';
import type {
  AccessPredicateProvider,
  IndexableSource,
  PageCursor,
  SearchablePage,
} from './indexable-source.port';
import { buildKeysetWhere, nextPageCursor } from './indexable-source.port';

const DESTINATION_JOIN_ALIAS = 'dd';

function extractEmails(destination: DataDestination): string[] {
  const emails: string[] = [];

  const identity = destination.credential?.identity;
  if (identity?.email) emails.push(identity.email);
  if (identity?.clientEmail) emails.push(identity.clientEmail);

  if (isEmailBasedDataDestinationType(destination.type)) {
    const raw = destination.credential?.credentials;
    const parsed = EmailCredentialsSchema.safeParse(raw);
    if (parsed.success) {
      emails.push(...parsed.data.to);
    }
  }

  return [...new Set(emails.filter(Boolean))];
}

function toDescriptor(destination: DataDestination): EntityScoringDescriptor {
  const typeLabel = toHumanReadable(destination.type as DataDestinationType);
  const richTextSlots: RichTextSlot[] = [
    { kind: 'title', text: destination.title },
    { kind: 'context', text: typeLabel },
  ];

  const emails = extractEmails(destination);
  const atomicTokenSlots: AtomicTokenSlot[] = emails.map(email => ({ kind: 'field', text: email }));

  const embeddingText = [destination.title, typeLabel, ...emails].filter(Boolean).join('\n');

  return {
    entityType: SearchableEntityType.DATA_DESTINATION,
    entityId: destination.id,
    projectId: destination.projectId,
    title: destination.title,
    description: null,
    richTextSlots,
    atomicTokenSlots,
    fieldCount: 0,
    extendability: 0,
    modifiedAt: destination.modifiedAt,
    embeddingText,
    isDraft: false,
  };
}

@Injectable()
export class DataDestinationIndexableSource implements IndexableSource {
  readonly entityType = SearchableEntityType.DATA_DESTINATION;
  readonly scoringConfig: ScoringConfig = DATA_MART_SCORING_CONFIG;
  readonly accessPredicateProvider: AccessPredicateProvider;

  constructor(
    @InjectRepository(DataDestination)
    private readonly destinationRepo: Repository<DataDestination>,
    private readonly contextAccessService: ContextAccessService
  ) {
    this.accessPredicateProvider = new EntityAccessPredicateProvider({
      repo: destinationRepo,
      joinAlias: DESTINATION_JOIN_ALIAS,
      joinSql: indexAlias =>
        `JOIN data_destination ${DESTINATION_JOIN_ALIAS} ON ${DESTINATION_JOIN_ALIAS}.id = ${indexAlias}.entity_id AND ${DESTINATION_JOIN_ALIAS}.projectId = ${indexAlias}.project_id`,
      extraClauses: [`${DESTINATION_JOIN_ALIAS}.deletedAt IS NULL`],
      applyFilter: (qb, { projectId, userId, roles, roleScope }) =>
        applyDataDestinationVisibilityFilter(qb, {
          destinationAlias: DESTINATION_JOIN_ALIAS,
          projectId,
          userId,
          roles,
          roleScope,
        }),
      contextAccessService,
    });
  }

  async listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number
  ): Promise<SearchablePage> {
    const where = buildKeysetWhere<DataDestination>({ projectId, deletedAt: IsNull() }, cursor);

    const pageRows = await this.destinationRepo.find({
      where,
      select: { id: true, createdAt: true },
      loadEagerRelations: false,
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    if (pageRows.length === 0) return { descriptors: [], nextCursor: null };

    const pageIds = pageRows.map(destination => destination.id);
    const destinations = await this.destinationRepo.find({
      where: { id: In(pageIds), projectId, deletedAt: IsNull() },
      select: {
        id: true,
        title: true,
        type: true,
        projectId: true,
        credentialId: true,
        modifiedAt: true,
        credential: {
          id: true,
          identity: true,
          credentials: true,
        },
      },
      relations: { credential: true },
      loadEagerRelations: false,
    });
    const destinationById = new Map(destinations.map(destination => [destination.id, destination]));
    const descriptors = pageIds
      .map(id => destinationById.get(id))
      .filter((destination): destination is DataDestination => destination !== undefined)
      .map(toDescriptor);

    return { descriptors, nextCursor: nextPageCursor(pageRows, limit) };
  }

  async listProjectIds(): Promise<string[]> {
    const rows: { projectId: string }[] = await this.destinationRepo
      .createQueryBuilder('d')
      .select('DISTINCT d.projectId', 'projectId')
      .where('d.deletedAt IS NULL')
      .getRawMany();
    return rows.map(r => r.projectId);
  }

  async loadSearchableOne(entityId: string): Promise<EntityScoringDescriptor | null> {
    const destination = await this.destinationRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.credential', 'cred')
      .where('d.id = :id', { id: entityId })
      .andWhere('d.deletedAt IS NULL')
      .getOne();
    if (!destination) return null;

    return toDescriptor(destination);
  }
}
