import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import {
  DataDestinationCredentialsDto,
  DataDestinationDto,
} from '../dto/domain/data-destination.dto';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { DataDestinationCredentialsUtils } from '../data-destination-types/data-destination-credentials.utils';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestination } from '../entities/data-destination.entity';

@Injectable()
export class DataDestinationMapper {
  constructor(private readonly credentialsUtils: DataDestinationCredentialsUtils) {}
  toCreateCommand(
    context: AuthorizationContext,
    dto: CreateDataDestinationApiDto
  ): CreateDataDestinationCommand {
    return new CreateDataDestinationCommand(
      context.projectId,
      dto.title,
      dto.type,
      dto.credentials
    );
  }

  toUpdateCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataDestinationApiDto
  ): UpdateDataDestinationCommand {
    return new UpdateDataDestinationCommand(id, context.projectId, dto.title, dto.credentials);
  }

  toDomainDto(dataDestination: DataDestination): DataDestinationDto {
    return new DataDestinationDto(
      dataDestination.id,
      dataDestination.title,
      dataDestination.type,
      dataDestination.projectId,
      (dataDestination.type === DataDestinationType.LOOKER_STUDIO
        ? { ...dataDestination.credentials, destinationId: dataDestination.id }
        : dataDestination.credentials) as DataDestinationCredentialsDto,
      dataDestination.createdAt,
      dataDestination.modifiedAt
    );
  }

  toDomainDtoList(dataDestinations: DataDestination[]): DataDestinationDto[] {
    return dataDestinations.map(dataDestination => this.toDomainDto(dataDestination));
  }

  toApiResponse(dataDestinationDto: DataDestinationDto): DataDestinationResponseApiDto {
    const publicCredentials = this.credentialsUtils.getPublicCredentials(
      dataDestinationDto.type,
      dataDestinationDto.credentials
    );
    return {
      id: dataDestinationDto.id,
      title: dataDestinationDto.title,
      type: dataDestinationDto.type,
      projectId: dataDestinationDto.projectId,
      credentials: publicCredentials || dataDestinationDto.credentials,
      createdAt: dataDestinationDto.createdAt,
      modifiedAt: dataDestinationDto.modifiedAt,
    };
  }

  toGetCommand(id: string, context: AuthorizationContext) {
    return new GetDataDestinationCommand(id, context.projectId);
  }

  toListCommand(context: AuthorizationContext) {
    return new ListDataDestinationsCommand(context.projectId);
  }

  toResponseList(dataDestinations: DataDestinationDto[]): DataDestinationResponseApiDto[] {
    return dataDestinations.map(dataDestinationDto => this.toApiResponse(dataDestinationDto));
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataDestinationCommand {
    return new DeleteDataDestinationCommand(id, context.projectId);
  }

  toRotateSecretKeyCommand(id: string, context: AuthorizationContext): RotateSecretKeyCommand {
    return new RotateSecretKeyCommand(id, context.projectId);
  }
}
