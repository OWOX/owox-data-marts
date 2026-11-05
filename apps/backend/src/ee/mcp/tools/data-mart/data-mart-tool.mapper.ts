import type { AuthorizationContext } from '../../../../idp';
import type {
  McpDataMartSetupDto,
  McpDataMartSummaryDto,
  McpDataMartSchemaResultDto,
} from '../../../../data-marts/facades/mcp-data-mart-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { buildDataMartUiPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';

export class DataMartToolMapper {
  toActor(context: McpAuthContext): AuthorizationContext {
    return { projectId: context.projectId, userId: context.userId, roles: context.roles };
  }

  toSummary(dto: McpDataMartSummaryDto, projectId: string, origin: string) {
    return {
      data_mart_id: dto.id,
      title: dto.title,
      status: dto.status,
      url: joinPublicOrigin(origin, buildDataMartUiPath(projectId, dto.id)),
      definition_type: dto.definitionType,
      created_at: dto.createdAt,
      modified_at: dto.modifiedAt,
    };
  }

  toSetup(dto: McpDataMartSetupDto, projectId: string, origin: string) {
    return {
      ...this.toSummary(dto, projectId, origin),
      description: dto.description,
      icon: dto.icon,
      storage: { storage_id: dto.storage.id, title: dto.storage.title, type: dto.storage.type },
      definition: dto.definition,
      definition_read_error: dto.definitionReadError,
      schema: dto.schema,
      business_owner_ids: dto.businessOwnerIds,
      technical_owner_ids: dto.technicalOwnerIds,
      contexts: dto.contexts.map(context => ({ context_id: context.id, name: context.name })),
      available_for_reporting: dto.availableForReporting,
      available_for_maintenance: dto.availableForMaintenance,
    };
  }

  toSchemaResult(dto: McpDataMartSchemaResultDto, projectId: string, origin: string) {
    return {
      ...this.toSummary(dto.dataMart, projectId, origin),
      schema: dto.schema,
      warning_count: dto.warningCount,
      warnings: dto.warnings.map(({ code, message }) => ({ code, message })),
      ...(dto.warningCount > 0
        ? {
            message:
              'The schema was saved with validation warnings. Review the reported reasons before using the affected fields. Open OWOX for details and any warnings beyond the first 50.',
          }
        : {}),
    };
  }
}
