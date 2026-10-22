import { Injectable } from '@nestjs/common';
import type { UpdatePluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { parseUpdateScheduleBody } from '../utils/schedule-body.util';
import { writerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class UpdatePluginScheduleService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: UpdatePluginScheduleCommand): Promise<PluginScheduleView> {
    const { installationId } = writerOf(command.context);
    return this.schedules.update(installationId, command.id, parseUpdateScheduleBody(command.body));
  }
}
