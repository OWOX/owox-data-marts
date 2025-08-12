import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { CreateScheduledTriggerRequestApiDto } from '../dto/presentation/create-scheduled-trigger-request-api.dto';
import { ScheduledTriggerResponseApiDto } from '../dto/presentation/scheduled-trigger-response-api.dto';
import { UpdateScheduledTriggerRequestApiDto } from '../dto/presentation/update-scheduled-trigger-request-api.dto';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { CreateScheduledTriggerService } from '../use-cases/create-scheduled-trigger.service';
import { DeleteScheduledTriggerService } from '../use-cases/delete-scheduled-trigger.service';
import { GetScheduledTriggerService } from '../use-cases/get-scheduled-trigger.service';
import { ListScheduledTriggersService } from '../use-cases/list-scheduled-triggers.service';
import { UpdateScheduledTriggerService } from '../use-cases/update-scheduled-trigger.service';
import {
  CreateScheduledTriggerSpec,
  DeleteScheduledTriggerSpec,
  GetScheduledTriggerSpec,
  ListScheduledTriggersSpec,
  UpdateScheduledTriggerSpec,
} from './spec/scheduled-trigger.api';

@Auth()
@Controller('data-marts/:dataMartId/scheduled-triggers')
@ApiTags('ScheduledTriggers')
/**
 * Controller for managing scheduled triggers
 */
export class ScheduledTriggerController {
  constructor(
    private readonly createService: CreateScheduledTriggerService,
    private readonly getService: GetScheduledTriggerService,
    private readonly listService: ListScheduledTriggersService,
    private readonly updateService: UpdateScheduledTriggerService,
    private readonly deleteService: DeleteScheduledTriggerService,
    private readonly mapper: ScheduledTriggerMapper
  ) {}

  @Post()
  @CreateScheduledTriggerSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateScheduledTriggerRequestApiDto
  ): Promise<ScheduledTriggerResponseApiDto> {
    const command = this.mapper.toCreateCommand(dataMartId, context, dto);
    const trigger = await this.createService.run(command);
    return this.mapper.toResponse(trigger);
  }

  @Get()
  @ListScheduledTriggersSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<ScheduledTriggerResponseApiDto[]> {
    const command = this.mapper.toListCommand(dataMartId, context);
    const triggers = await this.listService.run(command);
    return this.mapper.toResponseList(triggers);
  }

  @Get(':id')
  @GetScheduledTriggerSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string
  ): Promise<ScheduledTriggerResponseApiDto> {
    const command = this.mapper.toGetCommand(id, dataMartId, context);
    const trigger = await this.getService.run(command);
    return this.mapper.toResponse(trigger);
  }

  @Put(':id')
  @UpdateScheduledTriggerSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string,
    @Body() dto: UpdateScheduledTriggerRequestApiDto
  ): Promise<ScheduledTriggerResponseApiDto> {
    const command = this.mapper.toUpdateCommand(id, dataMartId, context, dto);
    const trigger = await this.updateService.run(command);
    return this.mapper.toResponse(trigger);
  }

  @Delete(':id')
  @DeleteScheduledTriggerSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, dataMartId, context);
    await this.deleteService.run(command);
  }
}
