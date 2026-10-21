import { Injectable } from '@nestjs/common';
import type { CreatePluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { parseCreateScheduleBody } from '../utils/schedule-body.util';
import { writerOf } from './plugin-schedule-runtime-access';

@Injectable()
export class CreatePluginScheduleService {
  constructor(private readonly schedules: PluginActionScheduleService) {}

  async run(command: CreatePluginScheduleCommand): Promise<PluginScheduleView> {
    const owner = writerOf(command.context);
    const { draft, enabled } = parseCreateScheduleBody(command.body);
    return this.schedules.create(owner, draft, enabled);
  }
}
