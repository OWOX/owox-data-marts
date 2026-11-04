import { ForbiddenException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GetConnectorTargetConflictCommand } from '../dto/domain/get-connector-target-conflict.command';
import { ConnectorTargetConflictDto } from '../dto/domain/connector-target-conflict.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ConnectorStorageSchema } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { Action, AccessDecisionService, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';

// BigQuery names are case-sensitive; Snowflake folds only an unquoted database; others fold case.
const CASE_SENSITIVE_STORAGES: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
  DataStorageType.LEGACY_GOOGLE_BIGQUERY,
]);

// Only the target: the rest of a draft's definition may be partial.
const TargetSchema = z.object({ connector: z.object({ storage: ConnectorStorageSchema }) });

export function normalizeTargetName(name: string, storageType: DataStorageType): string {
  if (storageType === DataStorageType.SNOWFLAKE) {
    // The connector quotes schema and table as typed and uses the database as typed.
    // ponytail: splits on every dot, so a quoted part with a dot inside compares by its pieces.
    return name
      .split('.')
      .map(part => part.trim())
      .map((part, index) => {
        const quoted = /^".*"$/.test(part);
        const bare = quoted ? part.slice(1, -1) : part;
        return index === 0 && !quoted ? bare.toUpperCase() : bare;
      })
      .join('.');
  }
  const unquoted = name.replace(/[`"[\]]/g, '').trim();
  return CASE_SENSITIVE_STORAGES.has(storageType) ? unquoted : unquoted.toLowerCase();
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

    const storageType = dataMart.storage.type;
    const target = normalizeTargetName(fullyQualifiedName, storageType);
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
        normalizeTargetName(parsed.data.connector.storage.fullyQualifiedName, storageType) ===
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
