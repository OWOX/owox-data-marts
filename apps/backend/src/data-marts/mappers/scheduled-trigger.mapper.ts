import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { GetScheduledTriggerCommand } from '../dto/domain/get-scheduled-trigger.command';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { CreateScheduledTriggerRequestApiDto } from '../dto/presentation/create-scheduled-trigger-request-api.dto';
import { ScheduledTriggerResponseApiDto } from '../dto/presentation/scheduled-trigger-response-api.dto';
import { UpdateScheduledTriggerRequestApiDto } from '../dto/presentation/update-scheduled-trigger-request-api.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';

/**
 * Mapper for scheduled trigger entities and DTOs
 */
@Injectable()
export class ScheduledTriggerMapper {
  toDomainDto(entity: DataMartScheduledTrigger): ScheduledTriggerDto {
    return new ScheduledTriggerDto(
      entity.id,
      entity.type,
      entity.cronExpression,
      entity.timeZone,
      entity.isActive,
      entity.nextRunTimestamp,
      entity.lastRunTimestamp,
      entity.createdById,
      entity.createdAt,
      entity.modifiedAt,
      entity.triggerConfig
    );
  }

  toDomainDtoList(entities: DataMartScheduledTrigger[]): ScheduledTriggerDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toResponse(dto: ScheduledTriggerDto): ScheduledTriggerResponseApiDto {
    return {
      id: dto.id,
      type: dto.type,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRunTimestamp: dto.nextRunTimestamp,
      lastRunTimestamp: dto.lastRunTimestamp,
      triggerConfig: dto.triggerConfig,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toResponseList(dtos: ScheduledTriggerDto[]): ScheduledTriggerResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }

  toCreateCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateScheduledTriggerRequestApiDto
  ): CreateScheduledTriggerCommand {
    return new CreateScheduledTriggerCommand(
      context.projectId,
      context.userId,
      dataMartId,
      dto.type,
      dto.cronExpression,
      dto.timeZone,
      dto.isActive ?? false,
      dto.triggerConfig
    );
  }

  toUpdateCommand(
    id: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateScheduledTriggerRequestApiDto
  ): UpdateScheduledTriggerCommand {
    return new UpdateScheduledTriggerCommand(
      id,
      dataMartId,
      context.projectId,
      dto.cronExpression,
      dto.timeZone,
      dto.isActive
    );
  }

  toGetCommand(
    id: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetScheduledTriggerCommand {
    return new GetScheduledTriggerCommand(id, dataMartId, context.projectId);
  }

  toDeleteCommand(
    id: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteScheduledTriggerCommand {
    return new DeleteScheduledTriggerCommand(id, dataMartId, context.projectId);
  }

  toListCommand(dataMartId: string, context: AuthorizationContext): ListScheduledTriggersCommand {
    return new ListScheduledTriggersCommand(dataMartId, context.projectId);
  }
}
