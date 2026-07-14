import { Inject, Injectable } from '@nestjs/common';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../../../project-settings/facades/project-settings.facade';
import { composeMcpInstructions } from './mcp-system-instructions';

@Injectable()
export class McpInstructionsService {
  constructor(
    @Inject(PROJECT_SETTINGS_FACADE)
    private readonly projectSettings: ProjectSettingsFacade
  ) {}

  async getInstructions(projectId: string): Promise<string> {
    const description = await this.projectSettings.getDescription(projectId);
    return composeMcpInstructions(description);
  }
}
