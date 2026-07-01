import { ApiProperty } from '@nestjs/swagger';

/**
 * Result of a completed MCP-initiated Google Sheets destination setup.
 */
export class FinishMcpGoogleSheetsSetupResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Created destination ID (UUID)',
  })
  destinationId: string;

  @ApiProperty({
    example: 'https://claude.ai/chat/123',
    description:
      'Allowlisted URL/deep-link to bounce the browser back to after setup completes. ' +
      'Absent if none was supplied or it was not allowlisted.',
    required: false,
  })
  redirectTo?: string;
}
