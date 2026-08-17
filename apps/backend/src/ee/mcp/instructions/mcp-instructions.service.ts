import { Injectable } from '@nestjs/common';
import { MCP_SYSTEM_INSTRUCTIONS } from './mcp-system-instructions';

@Injectable()
export class McpInstructionsService {
  getInstructions(): string {
    return MCP_SYSTEM_INSTRUCTIONS;
  }
}
