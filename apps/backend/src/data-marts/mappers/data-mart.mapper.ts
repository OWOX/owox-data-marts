import { Injectable } from '@nestjs/common';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { CreateDataMartRequestApiDto } from '../dto/presentation/create-data-mart-request-api.dto';
import { CreateDataMartResponseApiDto } from '../dto/presentation/create-data-mart-response-api.dto';
import { DataMartResponseApiDto } from '../dto/presentation/data-mart-response-api.dto';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMart } from '../entities/data-mart.entity';

@Injectable()
export class DataMartMapper {
  toDomainCommand(dto: CreateDataMartRequestApiDto): CreateDataMartCommand {
    return new CreateDataMartCommand(dto.title, dto.storage);
  }

  toDomainDto(entity: DataMart): DataMartDto {
    return new DataMartDto(
      entity.id,
      entity.title,
      entity.storage.type,
      entity.createdAt,
      entity.modifiedAt
    );
  }

  toDomainDtoList(entities: DataMart[]): DataMartDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toCreateResponse(dto: DataMartDto): CreateDataMartResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
    };
  }

  toResponse(dto: DataMartDto): DataMartResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      storageType: dto.storageType,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toResponseList(dtos: DataMartDto[]): DataMartResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }
}
