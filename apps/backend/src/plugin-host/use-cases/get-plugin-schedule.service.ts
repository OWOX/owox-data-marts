import { Injectable } from '@nestjs/common';
import type { PluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { ownerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class GetPluginScheduleService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: PluginScheduleCommand): Promise<PluginScheduleView> {
    return this.schedules.get(ownerOf(command.context).installationId, command.id);
  }
}
