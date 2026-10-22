import { Injectable } from '@nestjs/common';
import type { ListPluginSchedulesCommand } from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { ownerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class ListPluginSchedulesService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: ListPluginSchedulesCommand): Promise<PluginScheduleView[]> {
    return this.schedules.list(ownerOf(command.context).installationId);
  }
}
