import type {
  McpProjectSetupDto,
  McpProjectSetupRequest,
  McpUpdateProjectDescriptionRequest,
  McpProjectDescriptionDto,
} from '../dto/domain/mcp-project-setup.dto';

export const MCP_PROJECT_SETUP_FACADE = Symbol('MCP_PROJECT_SETUP_FACADE');

export interface McpProjectSetupFacade {
  updateProjectDescription(
    request: McpUpdateProjectDescriptionRequest
  ): Promise<McpProjectDescriptionDto>;
  getProjectSetup(request: McpProjectSetupRequest): Promise<McpProjectSetupDto>;
}
