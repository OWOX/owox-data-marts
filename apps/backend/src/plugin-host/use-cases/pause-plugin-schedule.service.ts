import { Injectable } from '@nestjs/common';
import type { PluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { writerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class PausePluginScheduleService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: PluginScheduleCommand): Promise<PluginScheduleView> {
    return this.schedules.pause(writerOf(command.context).installationId, command.id);
  }
}
