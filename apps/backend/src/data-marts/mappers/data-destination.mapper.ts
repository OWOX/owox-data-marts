import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { DataDestinationCredentialsUtils } from '../data-destination-types/data-destination-credentials.utils';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { GetDestinationOAuthStatusCommand } from '../dto/domain/google-oauth/get-destination-oauth-status.command';
import { GetDestinationOAuthCredentialStatusCommand } from '../dto/domain/google-oauth/get-destination-oauth-credential-status.command';
import { GenerateDestinationOAuthUrlCommand } from '../dto/domain/google-oauth/generate-destination-oauth-url.command';
import { RevokeDestinationOAuthCommand } from '../dto/domain/google-oauth/revoke-destination-oauth.command';
import { ExchangeOAuthCodeCommand } from '../dto/domain/google-oauth/exchange-oauth-code.command';
import { ExchangeAuthorizationCodeRequestDto } from '../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { GenerateAuthorizationUrlRequestDto } from '../dto/presentation/google-oauth/generate-authorization-url-request.dto';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestination } from '../entities/data-destination.entity';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';

@Injectable()
export class DataDestinationMapper {
  constructor(
    private readonly credentialsUtils: DataDestinationCredentialsUtils,
    private readonly publicOriginService: PublicOriginService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService
  ) {}
  toCreateCommand(
    context: AuthorizationContext,
    dto: CreateDataDestinationApiDto
  ): CreateDataDestinationCommand {
    return new CreateDataDestinationCommand(
      context.projectId,
      dto.title,
      dto.type,
      dto.credentials,
      dto.credentialId
    );
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
      dto.credentialId
    );
  }

  toDomainDto(dataDestination: DataDestination): DataDestinationDto {
    return new DataDestinationDto(
      dataDestination.id,
      dataDestination.title,
      dataDestination.type,
      dataDestination.projectId,
      dataDestination.createdAt,
      dataDestination.modifiedAt,
      dataDestination.credentialId
    );
  }

  toDomainDtoList(dataDestinations: DataDestination[]): DataDestinationDto[] {
    return dataDestinations.map(dataDestination => this.toDomainDto(dataDestination));
  }

  async toApiResponse(
    dataDestinationDto: DataDestinationDto
  ): Promise<DataDestinationResponseApiDto> {
    const publicCredentials = await this.resolvePublicCredentials(dataDestinationDto);

    return {
      id: dataDestinationDto.id,
      title: dataDestinationDto.title,
      type: dataDestinationDto.type,
      projectId: dataDestinationDto.projectId,
      credentials: publicCredentials,
      createdAt: dataDestinationDto.createdAt,
      modifiedAt: dataDestinationDto.modifiedAt,
      credentialId: dataDestinationDto.credentialId,
    };
  }

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataDestinationCommand(id, context.projectId);
  }

  toListCommand(context: AuthorizationContext) {
    return new ListDataDestinationsCommand(context.projectId);
  }

  toResponseList(dataDestinations: DataDestinationDto[]): Promise<DataDestinationResponseApiDto[]> {
    return Promise.all(
      dataDestinations.map(dataDestinationDto => this.toApiResponse(dataDestinationDto))
    );
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataDestinationCommand {
    return new DeleteDataDestinationCommand(id, context.projectId);
  }

  toRotateSecretKeyCommand(id: string, context: AuthorizationContext): RotateSecretKeyCommand {
    return new RotateSecretKeyCommand(id, context.projectId);
  }

  toGetOAuthStatusCommand(
    id: string,
    context: AuthorizationContext
  ): GetDestinationOAuthStatusCommand {
    return new GetDestinationOAuthStatusCommand(id, context.projectId);
  }

  toGetOAuthCredentialStatusCommand(
    credentialId: string,
    context: AuthorizationContext
  ): GetDestinationOAuthCredentialStatusCommand {
    return new GetDestinationOAuthCredentialStatusCommand(credentialId, context.projectId);
  }

  toGenerateOAuthUrlCommand(
    context: AuthorizationContext,
    dto: GenerateAuthorizationUrlRequestDto,
    destinationId?: string
  ): GenerateDestinationOAuthUrlCommand {
    return new GenerateDestinationOAuthUrlCommand(
      context.projectId,
      dto.redirectUri,
      destinationId
    );
  }

  toExchangeOAuthCodeCommand(
    context: AuthorizationContext,
    dto: ExchangeAuthorizationCodeRequestDto
  ): ExchangeOAuthCodeCommand {
    return new ExchangeOAuthCodeCommand(dto.code, dto.state, context.userId, context.projectId);
  }

  toRevokeOAuthCommand(id: string, context: AuthorizationContext): RevokeDestinationOAuthCommand {
    return new RevokeDestinationOAuthCommand(id, context.projectId);
  }

  private async resolvePublicCredentials(
    dto: DataDestinationDto
  ): Promise<DataDestinationResponseApiDto['credentials']> {
    if (!dto.credentialId) {
      throw new Error(`Destination ${dto.id} has no credentialId`);
    }

    const credential = await this.dataDestinationCredentialService.getById(dto.credentialId);
    if (!credential) {
      throw new Error(`Credential ${dto.credentialId} not found for destination ${dto.id}`);
    }

    switch (credential.type) {
      case DestinationCredentialType.GOOGLE_OAUTH:
        return { type: 'google-sheets-oauth-credentials' as const };

      case DestinationCredentialType.LOOKER_STUDIO: {
        const creds = credential.credentials as DataDestinationCredentials;
        return {
          ...creds,
          destinationId: dto.id,
          deploymentUrl: this.publicOriginService.getLookerStudioDeploymentUrl(),
        };
      }

      case DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT: {
        const creds = credential.credentials as DataDestinationCredentials;
        const publicCreds = this.credentialsUtils.getPublicCredentials(dto.type, creds);
        if (!publicCreds) {
          throw new Error(
            `Failed to resolve public credentials for destination ${dto.id} (type: ${dto.type})`
          );
        }
        return publicCreds;
      }

      case DestinationCredentialType.EMAIL:
        return credential.credentials as DataDestinationCredentials;

      default:
        throw new Error(
          `Unknown credential type ${String(credential.type)} for destination ${dto.id}`
        );
    }
  }
}
