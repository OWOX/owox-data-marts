import type { AuthorizationContext } from '../../idp';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import { GOOGLE_SHEETS_OAUTH_DEFINITION_ID } from '../credentials/services/builtin-credential-definitions';
import { extractDriveFolderId } from '../data-destination-types/google-sheets/utils/drive-folder-url.utils';
import { toMcpDestinationType, type McpDestinationType } from '../facades/mcp-destination-type';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import type { DataDestinationDto } from '../dto/domain/data-destination.dto';
import type {
  McpDestinationDto,
  McpCreateDestinationRequest,
  McpUpdateDestinationRequest,
  McpSetDestinationAccessRequest,
} from '../facades/mcp-data-destinations.facade';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import type { DestinationConfig } from '../entities/destination-config.type';

const destinationTypes: Record<McpDestinationType, DataDestinationType> = {
  google_sheets: DataDestinationType.GOOGLE_SHEETS,
  looker_studio: DataDestinationType.LOOKER_STUDIO,
  excel: DataDestinationType.EXCEL,
  email: DataDestinationType.EMAIL,
  slack: DataDestinationType.SLACK,
  teams: DataDestinationType.MS_TEAMS,
  google_chat: DataDestinationType.GOOGLE_CHAT,
};

@Injectable()
export class McpDestinationMapper {
  toDto(source: DataDestinationDto): McpDestinationDto {
    return {
      id: source.id,
      name: source.title,
      type: toMcpDestinationType(source.type),
      owner: source.createdByUser?.email ?? null,
      connectedGoogleAccount:
        source.type === DataDestinationType.GOOGLE_SHEETS &&
        source.reusableCredential?.definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID
          ? (source.reusableCredential.identity ?? null)
          : null,
      createdAt: source.createdAt.toISOString(),
      owners: source.ownerUsers.map(owner => ({
        userId: owner.userId,
        name: owner.fullName ?? null,
        email: owner.email ?? null,
      })),
      contexts: source.contexts.map(context => ({
        id: context.id,
        name: context.name,
        icon: context.icon,
      })),
      availableForUse: source.availableForUse,
      availableForMaintenance: source.availableForMaintenance,
      credential: this.toCredential(source.reusableCredential),
      emails: source.emails ?? null,
      folderUrl: source.config?.folderUrl ?? null,
    };
  }

  toCreateCommand(request: McpCreateDestinationRequest): CreateDataDestinationCommand {
    if (request.type === 'excel') {
      throw new BadRequestException('Excel destinations cannot be created through MCP.');
    }
    return new CreateDataDestinationCommand({
      projectId: request.projectId,
      userId: request.userId,
      roles: request.roles,
      title: request.title ?? request.type,
      type: destinationTypes[request.type],
      credentials:
        request.emails !== undefined
          ? { type: 'email-credentials', to: request.emails as [string, ...string[]] }
          : request.type === 'looker_studio'
            ? { type: 'looker-studio-credentials' }
            : undefined,
      reusableCredentialId: request.credentialId,
      config: this.toConfig(request.folderUrl),
      availableForUse: false,
    });
  }

  toUpdateCommand(
    actor: AuthorizationContext,
    request: McpUpdateDestinationRequest
  ): UpdateDataDestinationCommand {
    return new UpdateDataDestinationCommand({
      id: request.destinationId,
      projectId: actor.projectId,
      title: request.title,
      credentials: request.emails
        ? { type: 'email-credentials', to: request.emails as [string, ...string[]] }
        : undefined,
      reusableCredentialId: request.credentialId,
      userId: actor.userId,
      roles: actor.roles,
      config: this.toConfig(request.folderUrl),
    });
  }

  toAccessCommand(
    actor: AuthorizationContext,
    request: McpSetDestinationAccessRequest
  ): UpdateDataDestinationCommand {
    return new UpdateDataDestinationCommand({
      id: request.destinationId,
      projectId: actor.projectId,
      ownerIds: request.ownerIds === undefined ? undefined : [...new Set(request.ownerIds)],
      userId: actor.userId,
      roles: actor.roles,
      availableForUse: request.availableForUse,
      availableForMaintenance: request.availableForMaintenance,
      contextIds: request.contextIds === undefined ? undefined : [...new Set(request.contextIds)],
    });
  }

  private toConfig(folderUrl: string | null | undefined): DestinationConfig | undefined {
    if (folderUrl === undefined) return undefined;
    if (folderUrl === null) return { folderUrl: null, folderId: null };
    return { folderUrl, folderId: extractDriveFolderId(folderUrl) };
  }

  private toCredential(
    summary: DestinationCredentialSummary | null | undefined
  ): DestinationCredentialSummary | null {
    if (!summary) return null;
    if (summary.access !== 'visible') {
      const metadata = {
        ...(summary.definitionId !== undefined && { definitionId: summary.definitionId }),
        ...(summary.identity !== undefined && { identity: summary.identity }),
      };
      return summary.access === 'pending'
        ? { access: 'pending', state: 'ready', ...metadata }
        : { access: 'restricted', state: summary.state, ...metadata };
    }
    return {
      access: summary.access,
      state: summary.state,
      id: summary.id,
      title: summary.title,
      definitionId: summary.definitionId,
      providerName: summary.providerName,
      identity: summary.identity,
    };
  }
}
