import { ForbiddenException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GetConnectorTargetConflictCommand } from '../dto/domain/get-connector-target-conflict.command';
import { ConnectorTargetConflictDto } from '../dto/domain/connector-target-conflict.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ConnectorStorageSchema } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { Action, AccessDecisionService, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';

// BigQuery names are case-sensitive, and the web quotes every Snowflake name; other storages fold case.
const CASE_SENSITIVE_STORAGES: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
  DataStorageType.LEGACY_GOOGLE_BIGQUERY,
  DataStorageType.SNOWFLAKE,
]);

// Only the target: the rest of a draft's definition may be partial.
const TargetSchema = z.object({ connector: z.object({ storage: ConnectorStorageSchema }) });

export function normalizeTargetName(name: string, caseSensitive: boolean): string {
  const unquoted = name.replace(/[`"[\]]/g, '').trim();
  return caseSensitive ? unquoted : unquoted.toLowerCase();
}

/** Tells whether another Data Mart's connector already writes the same target table. */
@Injectable()
export class GetConnectorTargetConflictService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetConnectorTargetConflictCommand): Promise<ConnectorTargetConflictDto> {
    const { dataMartId, fullyQualifiedName, projectId, userId, roles } = command;
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const canEdit = await this.accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dataMartId,
      Action.EDIT,
      projectId
    );
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to edit this Data Mart');
    }

    const caseSensitive = CASE_SENSITIVE_STORAGES.has(dataMart.storage.type);
    const target = normalizeTargetName(fullyQualifiedName, caseSensitive);
    const candidates = await this.dataMartService.findConnectorTargetsByStorage(
      projectId,
      dataMart.storage.id
    );
    // A draft may hold a partial definition; one without a valid target cannot conflict.
    const matches = candidates.filter(candidate => {
      const parsed = TargetSchema.safeParse(candidate.definition);
      return (
        candidate.id !== dataMartId &&
        parsed.success &&
        normalizeTargetName(parsed.data.connector.storage.fullyQualifiedName, caseSensitive) ===
          target
      );
    });
    if (matches.length === 0) return new ConnectorTargetConflictDto(false, null);

    const canSee = await this.accessDecisionService.canAccessMany(
      userId,
      roles,
      EntityType.DATA_MART,
      matches.map(match => match.id),
      Action.SEE,
      projectId
    );
    const visible = matches.find(match => canSee.get(match.id) === true);
    return new ConnectorTargetConflictDto(
      true,
      visible ? { id: visible.id, title: visible.title } : null
    );
  }
}
