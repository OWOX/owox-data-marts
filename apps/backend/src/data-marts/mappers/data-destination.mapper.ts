import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthorizationContext } from '../../idp';
import { isPluginRuntimeCall } from '../../idp/utils/is-plugin-runtime-call';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import {
  CreateDataDestinationCommand,
  CreateDataDestinationCommandProps,
} from '../dto/domain/create-data-destination.command';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import {
  DataDestinationType,
  requiresCredentials,
} from '../data-destination-types/enums/data-destination-type.enum';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { CreateConnectGoogleSheetsDestinationApiDto } from '../dto/presentation/create-connect-google-sheets-destination-api.dto';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import {
  DataDestinationResponseApiDto,
  DestinationResponseCredentials,
} from '../dto/presentation/data-destination-response-api.dto';
import { DestinationCredentialSummaryApiDto } from '../dto/presentation/destination-credential-summary-api.dto';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestination } from '../entities/data-destination.entity';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { publicCredentialsOfRow } from '../data-destination-types/destination-public-credentials';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { DataDestinationByTypeResponseApiDto } from '../dto/presentation/data-destination-by-type-response-api.dto';
import { ListDataDestinationsByTypeItemDto } from '../dto/domain/list-data-destinations-by-type-item.dto';
import { ListDataDestinationsByTypeCommand } from '../dto/domain/list-data-destinations-by-type.command';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { extractContextSummaries } from '../utils/extract-context-summaries';
import { DestinationConfig } from '../entities/destination-config.type';
import { DestinationConfigDto } from '../dto/presentation/destination-config.dto';
import { extractDriveFolderId } from '../data-destination-types/google-sheets/utils/drive-folder-url.utils';

@Injectable()
export class DataDestinationMapper {
  private readonly logger = new Logger(DataDestinationMapper.name);

  constructor(
    private readonly publicOriginService: PublicOriginService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly cls: ClsService
  ) {}

  /**
   * Whether this response is being built for a plugin runtime token.
   *
   * A plugin runs as untrusted third-party code with the member's own authority, so
   * everything it reads it can forward to its vendor. That is accepted for business data
   * and not for credentials: a Looker Studio destination stores a secret key, and the
   * member-facing UI shows it because the member has to paste it into Looker Studio --
   * which is a reason for it to reach a browser, not a reason for it to reach a plugin.
   *
   * Read from CLS rather than threaded through every caller: reports embed a destination
   * too, and a rule that only some call sites remember is the one that gets forgotten.
   */
  private isPluginRuntimeCall(): boolean {
    return isPluginRuntimeCall(this.cls);
  }

  private buildCreateCommand(
    context: AuthorizationContext,
    options: Omit<
      CreateDataDestinationCommandProps,
      'projectId' | 'userId' | 'roles' | 'isPluginCall'
    >
  ): CreateDataDestinationCommand {
    return new CreateDataDestinationCommand({
      ...options,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles ?? [],
      isPluginCall: this.isPluginRuntimeCall(),
    });
  }

  toCreateCommand(
    context: AuthorizationContext,
    dto: CreateDataDestinationApiDto
  ): CreateDataDestinationCommand {
    return this.buildCreateCommand(context, {
      title: dto.title,
      type: dto.type,
      credentials: dto.credentials,
      reusableCredentialId: dto.reusableCredentialId,
      sentOldCredentialFields:
        dto.credentialId !== undefined || dto.sourceDestinationId !== undefined,
      ownerIds: dto.ownerIds,
      config: this.normalizeDestinationConfig(dto.config),
    });
  }

  toConnectGoogleSheetsCreateCommand(
    context: AuthorizationContext,
    dto: CreateConnectGoogleSheetsDestinationApiDto
  ): CreateDataDestinationCommand {
    return this.buildCreateCommand(context, {
      title: dto.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: dto.reusableCredentialId,
      sentOldCredentialFields: dto.credentialId !== undefined,
      // MCP-driven connect flow — starts unshared; not client-controlled.
      availableForUse: false,
    });
  }

  toUpdateCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataDestinationApiDto
  ): UpdateDataDestinationCommand {
    return new UpdateDataDestinationCommand(
      id,
      context.projectId,
      dto.title,
      dto.credentials,
      dto.reusableCredentialId,
      dto.credentialId !== undefined || dto.sourceDestinationId !== undefined,
      dto.ownerIds,
      context.userId,
      context.roles ?? [],
      dto.availableForUse,
      dto.availableForMaintenance,
      dto.contextIds,
      this.normalizeDestinationConfig(dto.config),
      this.isPluginRuntimeCall()
    );
  }

  /**
   * Normalizes destination config from the API: the client sends a Drive folder
   * URL; we keep it as the source of truth and derive the canonical folderId from
   * it (so the validator and auto-creation flow keep consuming folderId). Returns
   * undefined when no config was sent (do not touch); returns nulls to clear.
   */
  private normalizeDestinationConfig(config?: DestinationConfigDto): DestinationConfig | undefined {
    if (config === undefined) {
      return undefined;
    }
    const folderUrl = config.folderUrl?.trim() || null;
    // folderId is server-derived only — never taken from the client payload —
    // so it always reflects a validated folder URL (or null when cleared).
    const folderId = folderUrl ? extractDriveFolderId(folderUrl) : null;
    // Reject a non-empty URL we cannot parse into a folder id, instead of
    // persisting a half-configured destination that only fails at create time.
    if (folderUrl && !folderId) {
      throw new BadRequestException(
        'The Google Drive folder URL is not valid. Paste a folder link like ' +
          'https://drive.google.com/drive/folders/<id>.'
      );
    }
    return { folderUrl, folderId };
  }

  /** With `summaries`, a Destination that selects a Credential carries its summary or null. */
  toDomainDto(
    dataDestination: DataDestination,
    createdByUser: UserProjectionDto | null = null,
    ownerUsers: UserProjectionDto[] = [],
    summaries?: ReadonlyMap<string, DestinationCredentialSummary>
  ): DataDestinationDto {
    const summary = summaries?.get(dataDestination.id);
    return new DataDestinationDto(
      dataDestination.id,
      dataDestination.title,
      dataDestination.type,
      dataDestination.projectId,
      dataDestination.createdAt,
      dataDestination.modifiedAt,
      dataDestination.credentialId,
      createdByUser,
      ownerUsers,
      dataDestination.availableForUse,
      dataDestination.availableForMaintenance,
      extractContextSummaries(dataDestination.contexts),
      dataDestination.config ?? null,
      summaries && selectsCredential(dataDestination, summary) ? (summary ?? null) : undefined
    );
  }

  toDomainDtoList(
    dataDestinations: DataDestination[],
    userProjectionsList?: UserProjectionsListDto,
    summaries?: ReadonlyMap<string, DestinationCredentialSummary>
  ): DataDestinationDto[] {
    return dataDestinations.map(dataDestination =>
      this.toDomainDto(
        dataDestination,
        dataDestination.createdById
          ? (userProjectionsList?.getByUserId(dataDestination.createdById) ?? null)
          : null,
        userProjectionsList ? resolveOwnerUsers(dataDestination.ownerIds, userProjectionsList) : [],
        summaries
      )
    );
  }

  /** A Destination that selects a Credential shows its summary's public credentials; callers summarize. */
  async toApiResponse(
    dataDestinationDto: DataDestinationDto
  ): Promise<DataDestinationResponseApiDto> {
    const { reusableCredential } = dataDestinationDto;
    const isPluginCall = this.isPluginRuntimeCall();
    let selects =
      reusableCredential !== undefined || selectsCredential(dataDestinationDto, undefined);
    let credentials: DestinationResponseCredentials = {};
    if (!selects) {
      const row = await this.findOwnCredential(dataDestinationDto);
      // An old webhook row stands for a Credential the Destination selects.
      selects = row?.type === DestinationCredentialType.GOOGLE_CHAT_WEBHOOK;
      if (!isPluginCall) {
        credentials = selects
          ? ((row && publicCredentialsOfRow(row)) ?? {})
          : this.toPublicCredentials(dataDestinationDto, row);
      }
    } else if (!isPluginCall) {
      credentials = reusableCredential?.credentials ?? {};
    }

    return {
      id: dataDestinationDto.id,
      title: dataDestinationDto.title,
      type: dataDestinationDto.type,
      projectId: dataDestinationDto.projectId,
      credentials,
      createdAt: dataDestinationDto.createdAt,
      modifiedAt: dataDestinationDto.modifiedAt,
      ...(selects ? {} : { credentialId: dataDestinationDto.credentialId }),
      // A plugin acts as the member but never learns which Credential a Destination uses.
      ...(reusableCredential !== undefined && !isPluginCall
        ? { reusableCredential: toCredentialSummaryResponse(reusableCredential) }
        : {}),
      createdByUser: dataDestinationDto.createdByUser,
      ownerUsers: dataDestinationDto.ownerUsers,
      availableForUse: dataDestinationDto.availableForUse,
      availableForMaintenance: dataDestinationDto.availableForMaintenance,
      contexts: dataDestinationDto.contexts,
      config: dataDestinationDto.config,
    };
  }

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataDestinationCommand(
      id,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toListCommand(context: AuthorizationContext, ownerFilter?: OwnerFilter) {
    return new ListDataDestinationsCommand(
      context.projectId,
      context.userId,
      context.roles ?? [],
      ownerFilter
    );
  }

  toResponseList(dataDestinations: DataDestinationDto[]): Promise<DataDestinationResponseApiDto[]> {
    return Promise.all(
      dataDestinations.map(dataDestinationDto => this.toApiResponse(dataDestinationDto))
    );
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataDestinationCommand {
    return new DeleteDataDestinationCommand(
      id,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toRotateSecretKeyCommand(id: string, context: AuthorizationContext): RotateSecretKeyCommand {
    return new RotateSecretKeyCommand(id, context.projectId, context.userId, context.roles ?? []);
  }

  toByTypeCommand(
    context: AuthorizationContext,
    type: DataDestinationType
  ): ListDataDestinationsByTypeCommand {
    return new ListDataDestinationsByTypeCommand(
      context.projectId,
      type,
      this.isPluginRuntimeCall()
    );
  }

  toByTypeResponse(
    items: ListDataDestinationsByTypeItemDto[]
  ): DataDestinationByTypeResponseApiDto[] {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      dataMartName: item.dataMartName,
      identity: item.identity,
    }));
  }

  private async findOwnCredential(
    dto: DataDestinationDto
  ): Promise<DataDestinationCredential | null> {
    if (!dto.credentialId) {
      // Only a destination that should hold a secret is worth warning about. An Excel
      // destination never has one, and warning on every list request would train readers to
      // ignore the message that does matter.
      if (requiresCredentials(dto.type)) {
        this.logger.warn(`Destination ${dto.id} has no credentialId`);
      }
      return null;
    }

    const credential = await this.dataDestinationCredentialService.getById(dto.credentialId);
    if (!credential) {
      this.logger.warn(
        `Credential ${dto.credentialId} not found for destination ${dto.id} (possibly orphaned after soft-delete)`
      );
    }
    return credential;
  }

  private toPublicCredentials(
    dto: DataDestinationDto,
    credential: DataDestinationCredential | null
  ): DestinationResponseCredentials {
    if (!credential) return {};

    switch (credential.type) {
      case DestinationCredentialType.LOOKER_STUDIO:
        return {
          ...(credential.credentials as Extract<
            DestinationResponseCredentials,
            { type: 'looker-studio-credentials' }
          >),
          destinationId: dto.id,
          deploymentUrl: this.publicOriginService.getLookerStudioDeploymentUrl(),
        };

      case DestinationCredentialType.EMAIL:
        return credential.credentials as Extract<
          DestinationResponseCredentials,
          { type: 'email-credentials' }
        >;

      default:
        throw new Error(
          `Unknown credential type ${String(credential.type)} for destination ${dto.id}`
        );
    }
  }
}

/** Google Sheets and Google Chat by webhook select a Credential; Chat by email keeps its own row. */
function selectsCredential(
  destination: {
    readonly type: DataDestinationType;
    readonly credentialId?: string | null;
    readonly credential?: { readonly type: DestinationCredentialType } | null;
  },
  summary: DestinationCredentialSummary | undefined
): boolean {
  if (summary || destination.type === DataDestinationType.GOOGLE_SHEETS) return true;
  return (
    destination.type === DataDestinationType.GOOGLE_CHAT &&
    (!destination.credentialId ||
      destination.credential?.type === DestinationCredentialType.GOOGLE_CHAT_WEBHOOK)
  );
}

/** Built field by field so a restricted summary never carries the Credential's details. */
function toCredentialSummaryResponse(
  summary: DestinationCredentialSummary | null
): DestinationCredentialSummaryApiDto | null {
  if (!summary) return null;
  if (summary.access !== 'visible') {
    return {
      access: summary.access,
      state: summary.state,
      ...(summary.identity !== undefined && { identity: summary.identity }),
      ...(summary.definitionId !== undefined && { definitionId: summary.definitionId }),
    };
  }
  return {
    access: 'visible',
    id: summary.id,
    title: summary.title,
    definitionId: summary.definitionId,
    providerName: summary.providerName,
    identity: summary.identity,
    state: summary.state,
  };
}
