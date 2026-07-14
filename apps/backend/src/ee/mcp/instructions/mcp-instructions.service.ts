import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../../../project-settings/facades/project-settings.facade';
import { composeMcpInstructions } from './mcp-system-instructions';

@Injectable()
export class McpInstructionsService {
  private readonly logger = new Logger(McpInstructionsService.name);

  constructor(
    @Inject(PROJECT_SETTINGS_FACADE)
    private readonly projectSettings: ProjectSettingsFacade
  ) {}

  async getInstructions(projectId: string): Promise<string> {
    try {
      const description = await this.projectSettings.getDescription(projectId);
      return composeMcpInstructions(description);
    } catch (error) {
      this.logger.warn('Failed to load project-specific MCP instructions', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return composeMcpInstructions(null);
    }
  }
}
