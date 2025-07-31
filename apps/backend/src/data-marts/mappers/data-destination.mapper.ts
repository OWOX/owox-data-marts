import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { DataDestination } from '../entities/data-destination.entity';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { UpdateDataDestinationCommand } from '../dto/domain/update-data-destination.command';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../common/authorization-context/authorization.context';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { DataDestinationCredentialsUtils } from '../data-destination-types/data-destination-credentials.utils';

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
      dataDestination.credentials,
      dataDestination.createdAt,
      dataDestination.modifiedAt
    );
  }

  toDomainDtoList(dataDestinations: DataDestination[]): DataDestinationDto[] {
    return dataDestinations.map(dataDestination => this.toDomainDto(dataDestination));
  }

  toApiResponse(dataDestinationDto: DataDestinationDto): DataDestinationResponseApiDto {
    return {
      id: dataDestinationDto.id,
      title: dataDestinationDto.title,
      type: dataDestinationDto.type,
      projectId: dataDestinationDto.projectId,
      credentials: this.credentialsUtils.getPublicCredentials(
        dataDestinationDto.type,
        dataDestinationDto.credentials
      ),
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
}
