import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, AuthContext, RequirePluginAuth, type AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import {
  CreatePluginScheduleCommand,
  ListPluginSchedulesCommand,
  PluginScheduleCommand,
  UpdatePluginScheduleCommand,
} from '../dto/domain/plugin-action-schedule.command';
import {
  CreatePluginScheduleApiDto,
  PluginScheduleApiDto,
  PluginScheduleListApiDto,
  UpdatePluginScheduleApiDto,
} from '../dto/presentation/plugin-schedule-api.dto';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import { toPluginScheduleResponse } from '../mappers/plugin-action-schedule.mapper';
import { CreatePluginScheduleService } from '../use-cases/create-plugin-schedule.service';
import { DeletePluginScheduleService } from '../use-cases/delete-plugin-schedule.service';
import { GetPluginScheduleService } from '../use-cases/get-plugin-schedule.service';
import { ListPluginSchedulesService } from '../use-cases/list-plugin-schedules.service';
import { PausePluginScheduleService } from '../use-cases/pause-plugin-schedule.service';
import { ResumePluginScheduleService } from '../use-cases/resume-plugin-schedule.service';
import { UpdatePluginScheduleService } from '../use-cases/update-plugin-schedule.service';

@ApiTags('Plugin Schedules')
@Controller('plugins/runtime')
@Auth(Role.viewer(Strategy.PARSE))
@RequirePluginAuth()
@UseFilters(PluginHostExceptionFilter)
export class PluginScheduleRuntimeController {
  constructor(
    private readonly createSchedule: CreatePluginScheduleService,
    private readonly listSchedules: ListPluginSchedulesService,
    private readonly getSchedule: GetPluginScheduleService,
    private readonly updateSchedule: UpdatePluginScheduleService,
    private readonly pauseSchedule: PausePluginScheduleService,
    private readonly resumeSchedule: ResumePluginScheduleService,
    private readonly deleteSchedule: DeletePluginScheduleService
  ) {}

  @Post('schedules')
  @HttpCode(201)
  @ApiBody({ type: CreatePluginScheduleApiDto })
  @ApiCreatedResponse({ type: PluginScheduleApiDto })
  async create(
    // Not a DTO: the global pipe would drop `constructor`, `prototype` and `__proto__` at any depth.
    @Body() body: Record<string, unknown> | undefined,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginScheduleApiDto> {
    const schedule = await this.createSchedule.run(new CreatePluginScheduleCommand(context, body));
    return toPluginScheduleResponse(schedule);
  }

  @Get('schedules')
  @ApiOkResponse({ type: PluginScheduleListApiDto })
  async list(@AuthContext() context: AuthorizationContext): Promise<PluginScheduleListApiDto> {
    const schedules = await this.listSchedules.run(new ListPluginSchedulesCommand(context));
    return { schedules: schedules.map(toPluginScheduleResponse) };
  }

  @Get('schedules/:id')
  @ApiOkResponse({ type: PluginScheduleApiDto })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginScheduleApiDto> {
    return toPluginScheduleResponse(
      await this.getSchedule.run(new PluginScheduleCommand(context, id))
    );
  }

  @Patch('schedules/:id')
  @ApiBody({ type: UpdatePluginScheduleApiDto })
  @ApiOkResponse({ type: PluginScheduleApiDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    // Not a DTO: the global pipe would drop `constructor`, `prototype` and `__proto__` at any depth.
    @Body() body: Record<string, unknown> | undefined,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginScheduleApiDto> {
    const schedule = await this.updateSchedule.run(
      new UpdatePluginScheduleCommand(context, id, body)
    );
    return toPluginScheduleResponse(schedule);
  }

  @Post('schedules/:id/pause')
  @HttpCode(200)
  @ApiOkResponse({ type: PluginScheduleApiDto })
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginScheduleApiDto> {
    return toPluginScheduleResponse(
      await this.pauseSchedule.run(new PluginScheduleCommand(context, id))
    );
  }

  @Post('schedules/:id/resume')
  @HttpCode(200)
  @ApiOkResponse({ type: PluginScheduleApiDto })
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginScheduleApiDto> {
    return toPluginScheduleResponse(
      await this.resumeSchedule.run(new PluginScheduleCommand(context, id))
    );
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    await this.deleteSchedule.run(new PluginScheduleCommand(context, id));
  }
}
