import { Injectable } from '@nestjs/common';
import type { PluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { writerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class DeletePluginScheduleService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: PluginScheduleCommand): Promise<void> {
    await this.schedules.delete(writerOf(command.context).installationId, command.id);
  }
}
